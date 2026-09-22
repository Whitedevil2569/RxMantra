# CPU-only inference image.
# Build context is the REPO ROOT (D:\RxMantra) so the model weights can be copied in.
#   docker build -f app/ml-service/Dockerfile -t rxmantra-ml .
FROM python:3.11-slim

# OpenCV (pulled in by ultralytics) needs these shared libs at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# CPU builds of torch/torchvision (no CUDA — much smaller, runs anywhere).
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir \
    fastapi "uvicorn[standard]" python-multipart pillow numpy ultralytics

# App code + the trained model (baked in so the image is self-contained).
COPY app/ml-service/server.py /app/server.py
COPY runs/dental_seg-4/weights/best.pt /app/model/best.pt

ENV MODEL_PATH=/app/model/best.pt \
    HOST=0.0.0.0 \
    PORT=8000 \
    IMGSZ=1024 \
    YOLO_CONFIG_DIR=/tmp/ultralytics

EXPOSE 8000
CMD ["python", "server.py"]
