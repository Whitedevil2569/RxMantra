"""
RxMantra - fine-tune dental panoramic X-ray segmentation.

Starts from the dataset's included best.pt (already trained on this exact data)
and continues training with our corrected data.yaml. Trains on all 31 classes;
we filter to pathology classes at prediction time (see predict.py).
"""
import os
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"  # reduce fragmentation OOM

from pathlib import Path
from ultralytics import YOLO

ROOT = Path(r"D:\RxMantra")
BASE_WEIGHTS = ROOT / r"datasets\archive (4)\best.pt"
DATA = ROOT / "data.yaml"


def main():
    model = YOLO(str(BASE_WEIGHTS))  # segmentation, 31 classes

    model.train(
        data=str(DATA),
        epochs=100,
        imgsz=1024,          # panoramic X-rays are wide; small lesions need resolution
        batch=8,             # fixed: bs=4 used only ~10GB, bs=8 ~18GB on the 32GB card
        device=0,
        workers=4,           # 4 (not 8) dataloader workers: halves host-RAM use, avoids OOM
        project=str(ROOT / "runs"),
        name="dental_seg",
        patience=20,         # early-stop if val stops improving
        # --- imbalance / small-object help ---
        cos_lr=True,
        close_mosaic=10,     # disable mosaic for the final epochs
        # --- augmentation tuned for grayscale X-rays ---
        hsv_h=0.0, hsv_s=0.0, hsv_v=0.3,  # no color shift on grayscale; vary brightness only
        degrees=5, translate=0.1, scale=0.3,
        fliplr=0.5, flipud=0.0,           # L/R flip ok (jaw is ~symmetric); no vertical flip
        mosaic=1.0,
        plots=True,
    )

    # Final per-class evaluation on the (now real) test split
    metrics = model.val(data=str(DATA), split="test", imgsz=1024)
    print("mAP50-95 (box):", metrics.box.map)
    print("mAP50-95 (mask):", metrics.seg.map)


if __name__ == "__main__":
    main()
