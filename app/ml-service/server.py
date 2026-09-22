```python
import time
import urllib.request
from contextlib import asynccontextmanager
from pathlib import Path
import io

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO
import numpy as np
from PIL import Image


# ============================================================
# MODEL SETTINGS
# ============================================================

MODEL_DIR = Path("weights")
MODEL_PATH = MODEL_DIR / "best.onnx"

MODEL_URL = (
    "https://github.com/Whitedevil2569/RxMantra/"
    "releases/download/v1.0/best.onnx"
)


def download_model():
    """Download the ONNX model if it does not already exist."""

    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    if MODEL_PATH.exists():
        file_size = MODEL_PATH.stat().st_size

        if file_size < 1_000_000:
            print("Found corrupted model file. Deleting it...")
            MODEL_PATH.unlink()
        else:
            print(
                f"Model already exists: {MODEL_PATH} "
                f"({file_size / 1024 / 1024:.2f} MB)"
            )
            return

    print("Model not found.")
    print("Downloading ONNX model from GitHub Releases...")
    print(f"URL: {MODEL_URL}")

    try:
        urllib.request.urlretrieve(
            MODEL_URL,
            str(MODEL_PATH)
        )
    except Exception as e:
        print(f"MODEL DOWNLOAD FAILED: {e}")
        raise

    if not MODEL_PATH.exists():
        raise RuntimeError("Model download finished but file does not exist.")

    file_size = MODEL_PATH.stat().st_size

    if file_size < 1_000_000:
        MODEL_PATH.unlink()
        raise RuntimeError(
            f"Downloaded model appears corrupted. "
            f"File size: {file_size} bytes"
        )

    print(
        f"Model downloaded successfully: {MODEL_PATH} "
        f"({file_size / 1024 / 1024:.2f} MB)"
    )


# ============================================================
# APPLICATION LIFESPAN
# ============================================================

@asynccontextmanager
async def lifespan(app: FastAPI):

    print("=" * 60)
    print("RxMantra ML Service starting...")
    print("=" * 60)

    # Download model
    download_model()

    # Load model
    print(f"Loading YOLO model from: {MODEL_PATH}")

    try:
        # Do not force task="detect".
        # Ultralytics will use the task associated with the model.
        app.state.model = YOLO(str(MODEL_PATH))

        print("YOLO model loaded successfully!")
        print(f"Model classes: {app.state.model.names}")

    except Exception as e:
        print(f"MODEL LOAD FAILED: {e}")
        raise

    print("=" * 60)
    print("RxMantra ML Service is ready!")
    print("=" * 60)

    yield

    print("Shutting down RxMantra ML Service...")


# ============================================================
# FASTAPI APPLICATION
# ============================================================

app = FastAPI(
    title="RxMantra ML Service",
    description="Dental X-ray disease detection and localization API",
    version="1.0.0",
    lifespan=lifespan,
)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# HEALTH CHECK
# ============================================================

@app.get("/")
async def root():
    return {
        "service": "RxMantra ML Service",
        "status": "running",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health")
async def health():

    return {
        "status": "ok",
        "model_loaded": hasattr(app.state, "model"),
    }


# ============================================================
# MODEL CLASSES
# ============================================================

@app.get("/classes")
async def get_classes():

    if not hasattr(app.state, "model"):
        raise HTTPException(
            status_code=503,
            detail="Model not loaded"
        )

    return app.state.model.names


# ============================================================
# PREDICTION
# ============================================================

@app.post("/predict")
async def predict(image: UploadFile = File(...)):

    if not hasattr(app.state, "model"):
        raise HTTPException(
            status_code=503,
            detail="Model not loaded yet"
        )

    start = time.time()

    # --------------------------------------------------------
    # Read uploaded image
    # --------------------------------------------------------

    try:
        contents = await image.read()

        img = Image.open(
            io.BytesIO(contents)
        ).convert("RGB")

    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid image: {str(e)}"
        )

    img_np = np.array(img)

    # --------------------------------------------------------
    # Run YOLO inference
    # --------------------------------------------------------

    try:

        results = app.state.model.predict(
            img_np,
            conf=0.25,
            verbose=False
        )

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=f"Model inference failed: {str(e)}"
        )

    # --------------------------------------------------------
    # Extract detections
    # --------------------------------------------------------

    detections = []

    for result in results:

        if result.boxes is None:
            continue

        for i, box in enumerate(result.boxes):

            cls_id = int(box.cls[0])
            confidence = float(box.conf[0])

            x1, y1, x2, y2 = box.xyxy[0].tolist()

            # ------------------------------------------------
            # Segmentation mask
            # ------------------------------------------------

            mask = None

            if (
                result.masks is not None
                and i < len(result.masks.xy)
            ):
                mask = result.masks.xy[i].tolist()

            detections.append({
                "classId": cls_id,

                "className": app.state.model.names[cls_id],

                "confidence": confidence,

                "box": {
                    "x1": x1,
                    "y1": y1,
                    "x2": x2,
                    "y2": y2,
                },

                "mask": mask,
            })

    # --------------------------------------------------------
    # Inference time
    # --------------------------------------------------------

    inference_time = (
        time.time() - start
    ) * 1000

    # --------------------------------------------------------
    # Response
    # --------------------------------------------------------

    return {
        "success": True,

        "imageWidth": img.width,

        "imageHeight": img.height,

        "inferenceTimeMs": round(
            inference_time,
            2
        ),

        "detections": detections,
    }
```
