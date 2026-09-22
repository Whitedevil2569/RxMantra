"""
RxMantra - predict dental disease from a panoramic X-ray.

Runs the trained segmentation model, then filters detections down to the
pathology (disease) classes only, so the output is a disease report rather
than a dump of every filling and crown.

Usage:
    python predict.py path/to/xray.jpg
    python predict.py path/to/folder_of_xrays
"""
import sys
from pathlib import Path
from ultralytics import YOLO

ROOT = Path(r"D:\RxMantra")

# Prefer our fine-tuned weights (latest dental_seg* run); fall back to the original.
ORIGINAL = ROOT / r"datasets\archive (4)\best.pt"
_candidates = sorted(
    ROOT.glob("runs/dental_seg*/weights/best.pt"),
    key=lambda p: p.stat().st_mtime,
)
WEIGHTS = _candidates[-1] if _candidates else ORIGINAL

# Class ids that represent actual pathology/disease (not dental work or anatomy).
# NOTE: Cyst(28), Fracture(14), Root resorption(29) are kept here but had far too
# few training examples to be reliable - treat any such detection with suspicion.
DISEASE_CLASSES = {
    0: "Caries",
    7: "Periapical lesion",
    8: "Retained root",
    10: "Root Piece",
    11: "Impacted tooth",
    13: "Bone Loss",
    14: "Fracture teeth",
    28: "Cyst",
    29: "Root resorption",
}
# Classes we trust (enough training data); others get flagged as low-confidence.
RELIABLE = {0, 7, 8, 10, 11, 13}


def main():
    if len(sys.argv) < 2:
        print("Usage: python predict.py <image_or_folder>")
        sys.exit(1)

    source = sys.argv[1]
    model = YOLO(str(WEIGHTS))
    print(f"Using weights: {WEIGHTS.name}")

    results = model.predict(
        source=source,
        imgsz=1024,
        conf=0.25,
        classes=sorted(DISEASE_CLASSES),   # only run/return disease classes
        save=True,                          # writes annotated image(s) to runs/segment/predict
        project=str(ROOT / "runs"),
        name="predict",
        exist_ok=True,
    )

    for r in results:
        print(f"\n=== {Path(r.path).name} ===")
        if r.boxes is None or len(r.boxes) == 0:
            print("  No disease findings detected.")
            continue
        # Summarize findings, highest confidence first
        rows = []
        for cid, conf in zip(r.boxes.cls.tolist(), r.boxes.conf.tolist()):
            cid = int(cid)
            flag = "" if cid in RELIABLE else "  (!) low-data class, unreliable"
            rows.append((conf, f"  {conf:.2f}  {DISEASE_CLASSES[cid]}{flag}"))
        for _, line in sorted(rows, reverse=True):
            print(line)

    print(f"\nAnnotated images saved to: {ROOT / 'runs' / 'predict'}")


if __name__ == "__main__":
    main()
