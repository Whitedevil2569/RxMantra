# RxMantra — AI-Assisted Dental Panoramic X-ray Analysis

Three-tier web application over the trained YOLO segmentation model at
`runs/dental_seg-4/weights/best.pt` (31 classes, segmentation).

```
Browser (React/Vite :5173)
   → Node backend (Express :3001)   ← upload validation + security boundary
   → Python ML service (FastAPI :8000)   ← model loaded once, resident on GPU
   → YOLO best.pt inference
```

The browser only ever talks to the Node backend. The ML service is internal and
never exposed to the browser; the model file and filesystem paths are never
exposed to the client.

## Prerequisites (already set up in this project)
- Python venv at `D:\RxMantra\.venv` (torch 2.11+cu128, ultralytics, fastapi, uvicorn)
- Node.js (v26) with deps installed in `app/backend` and `app/frontend`
- NVIDIA GPU with CUDA (auto-detected; falls back to CPU if unavailable)

## Start everything
```powershell
powershell -ExecutionPolicy Bypass -File D:\RxMantra\app\start-all.ps1
```
Then open **http://localhost:5173**.

## Or start each tier manually
```powershell
# 1) ML service (wait for "Application startup complete")
D:\RxMantra\.venv\Scripts\python.exe D:\RxMantra\app\ml-service\server.py

# 2) Backend
cd D:\RxMantra\app\backend ; node server.js

# 3) Frontend
cd D:\RxMantra\app\frontend ; npm run dev
```

## API
- `POST /api/predict` (multipart `image`) → `{ success, imageWidth, imageHeight, inferenceTimeMs, detections[] }`
  where each detection is `{ classId, className, confidence, box{x1,y1,x2,y2}, mask[[x,y]...] | null }`.
- `GET /api/health` → backend + ML/GPU status.
- `GET /api/classes` → full class-id → name map (used for stable overlay colors).

Coordinates are in original-image pixels; the viewer scales them to the canvas.

## Notes
- This is an AI-assisted research/analysis tool. It is **not** a medical
  diagnostic device and has not been clinically validated.
- Uploads are held in memory only (never written to disk) and are not sent to
  any third party.
- `playwright` is a dev-only dependency that was used for the end-to-end UI
  test; it is not needed to run the app.
