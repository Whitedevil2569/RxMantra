import os
import time
from contextlib import asynccontextmanager
from pathlib import Path

import requests
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO
import numpy as np
from PIL import Image
import io

# ============== MODEL DOWNLOAD SETTINGS ==============
MODEL_DIR = Path("weights")
MODEL_PATH = MODEL_DIR / "best.pt"
MODEL_URL = "https://drive.google.com/uc?export=download&id=1KXYCsyRftgN4L2u7PljzXAAbvlSZXKa4"

def download_model():
    """Download the model if it does not exist"""
    if MODEL_PATH.exists():
        print(f"Model already exists at {MODEL_PATH}")
        return

    print("Model not found. Downloading from Google Drive...")
    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    response = requests.get(MODEL_URL, stream=True)
    if response.status_code != 200:
        raise RuntimeError(f"Failed to download model. Status code: {response.status_code}")

    with open(MODEL_PATH, "wb") as f:
        for chunk in response.iter_content(chunk_size=8192):
            if chunk:
                f.write(chunk)

    print(f"Model downloaded successfully → {MODEL_PATH}")

# ============== LOAD MODEL ON STARTUP ==============
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Download + load model when service starts
    download_model()
    print(f"Loading YOLO model from {MODEL_PATH}...")
    app.state.model = YOLO(str(MODEL_PATH))
    print("Model loaded successfully!")
    yield
    # cleanup if needed
    print("Shutting down...")

app = FastAPI(title="RxMantra ML Service", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok", "model_loaded": hasattr(app.state, "model")}

@app.get("/classes")
async def get_classes():
    if not hasattr(app.state, "model"):
        raise HTTPException(status_code=503, detail="Model not loaded")
    return app.state.model.names

@app.post("/predict")
async def predict(image: UploadFile = File(...)):
    if not hasattr(app.state, "model"):
        raise HTTPException(status_code=503, detail="Model not loaded yet")

    start = time.time()

    # Read image
    contents = await image.read()
    img = Image.open(io.BytesIO(contents)).convert("RGB")
    img_np = np.array(img)

    # Run inference
    results = app.state.model.predict(img_np, conf=0.25, verbose=False)

    detections = []
    for r in results:
        if r.boxes is None:
            continue
        for i, box in enumerate(r.boxes):
            cls_id = int(box.cls[0])
            conf = float(box.conf[0])
            x1, y1, x2, y2 = box.xyxy[0].tolist()

            mask = None
            if r.masks is not None and i < len(r.masks.xy):
                mask = r.masks.xy[i].tolist()

            detections.append({
                "classId": cls_id,
                "className": app.state.model.names[cls_id],
                "confidence": conf,
                "box": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
                "mask": mask
            })

    inference_time = (time.time() - start) * 1000

    return {
        "success": True,
        "imageWidth": img.width,
        "imageHeight": img.height,
        "inferenceTimeMs": round(inference_time, 2),
        "detections": detections
    }