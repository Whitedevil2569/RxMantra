"""
RxMantra ML inference service (FastAPI).

Loads the trained YOLO segmentation model ONCE at startup and keeps it resident
in GPU memory. Exposes POST /predict which accepts an image and returns
structured detections (box + segmentation polygon + class + confidence).

This service is internal: it is called by the Node backend, not the browser.
"""
import io
import time
import logging
from contextlib import asynccontextmanager
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(message)s",
)
log = logging.getLogger("rxmantra.ml")

# --- Resolve the model path. Override with MODEL_PATH env (used in Docker). ---
PROJECT_ROOT = Path(__file__).resolve().parents[2]
import os
MODEL_PATH = Path(
    os.environ.get("MODEL_PATH", PROJECT_ROOT / "runs" / "dental_seg-4" / "weights" / "best.pt")
)
# Inference resolution. Lower it (e.g. 640) on CPU hosts to trade some accuracy
# for much faster inference.
IMGSZ = int(os.environ.get("IMGSZ", "1024"))

# Populated at startup.
STATE: dict = {"model": None, "names": {}, "device": "cpu"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    from ultralytics import YOLO

    if not MODEL_PATH.exists():
        raise RuntimeError(f"Model not found at {MODEL_PATH}")

    cuda = torch.cuda.is_available()
    device = 0 if cuda else "cpu"
    gpu_name = torch.cuda.get_device_name(0) if cuda else "CPU"

    log.info("Loading model: %s", MODEL_PATH.name)
    model = YOLO(str(MODEL_PATH))
    model.to(device)
    # Warm up so the first real request isn't penalized by lazy CUDA init.
    _ = model.predict(
        np.zeros((640, 640, 3), dtype=np.uint8),
        imgsz=IMGSZ, device=device, verbose=False,
    )

    STATE.update(model=model, names=model.names, device=device)
    log.info("Model loaded | task=%s | classes=%d", model.task, len(model.names))
    log.info("CUDA available: %s | device: %s", cuda, gpu_name)
    yield
    STATE.clear()
    log.info("ML service shut down.")


app = FastAPI(title="RxMantra ML Service", lifespan=lifespan)

ALLOWED = {"image/jpeg", "image/png"}
MAX_BYTES = 25 * 1024 * 1024  # 25 MB


@app.get("/health")
def health():
    return {
        "status": "ok" if STATE.get("model") is not None else "loading",
        "device": STATE.get("device"),
        "cudaAvailable": torch.cuda.is_available(),
        "gpuName": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        "numClasses": len(STATE.get("names", {})),
    }


@app.get("/classes")
def classes():
    # Full class map so the frontend can assign a stable color per class.
    return {"names": {int(k): v for k, v in STATE.get("names", {}).items()}}


@app.post("/predict")
async def predict(image: UploadFile = File(...)):
    model = STATE.get("model")
    if model is None:
        raise HTTPException(status_code=503, detail="Model is not ready yet.")

    if image.content_type not in ALLOWED:
        raise HTTPException(status_code=415, detail="Only JPEG and PNG are supported.")

    raw = await image.read()
    if len(raw) == 0:
        raise HTTPException(status_code=400, detail="Empty file.")
    if len(raw) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds the 25 MB limit.")

    try:
        pil = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="File is not a readable image.")

    w, h = pil.size
    arr = np.asarray(pil)

    t0 = time.perf_counter()
    try:
        results = model.predict(
            arr, imgsz=IMGSZ, conf=0.25, device=STATE["device"], verbose=False,
        )
    except Exception as e:  # inference failure
        log.exception("Inference failed")
        raise HTTPException(status_code=500, detail="Inference failed.") from e
    infer_ms = round((time.perf_counter() - t0) * 1000, 1)

    r = results[0]
    names = STATE["names"]
    detections = []

    if r.boxes is not None and len(r.boxes) > 0:
        xyxy = r.boxes.xyxy.cpu().numpy()
        confs = r.boxes.conf.cpu().numpy()
        clss = r.boxes.cls.cpu().numpy().astype(int)
        # Segmentation polygons in ORIGINAL image pixel coordinates (may be None).
        polys = r.masks.xy if getattr(r, "masks", None) is not None else None

        for i in range(len(xyxy)):
            x1, y1, x2, y2 = [float(v) for v in xyxy[i]]
            cid = int(clss[i])
            mask = None
            if polys is not None and i < len(polys) and len(polys[i]) >= 3:
                # Round to 2 decimals to keep payload small; still sub-pixel enough.
                mask = [[round(float(px), 2), round(float(py), 2)] for px, py in polys[i]]
            detections.append({
                "classId": cid,
                "className": names.get(cid, str(cid)),
                "confidence": round(float(confs[i]), 4),
                "box": {"x1": round(x1, 2), "y1": round(y1, 2),
                        "x2": round(x2, 2), "y2": round(y2, 2)},
                "mask": mask,
            })

    log.info("predict | %dx%d | %d detections | %.1f ms", w, h, len(detections), infer_ms)
    return JSONResponse({
        "success": True,
        "imageWidth": w,
        "imageHeight": h,
        "inferenceTimeMs": infer_ms,
        "detections": detections,
    })


if __name__ == "__main__":
    import uvicorn
    # 0.0.0.0 so it is reachable inside a container; override with HOST/PORT env.
    uvicorn.run(
        app,
        host=os.environ.get("HOST", "0.0.0.0"),
        port=int(os.environ.get("PORT", "8000")),
        log_level="info",
    )
