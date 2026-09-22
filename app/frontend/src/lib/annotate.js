import { colorForClass, withAlpha } from "./colors.js";

// Draw the X-ray plus overlays into a 2D context.
// All detection coordinates are in ORIGINAL image pixels; we map them to
// screen space with transform = { scale, tx, ty } so overlays always line up
// with the image no matter the zoom/pan.
export function drawScene(ctx, opts) {
  const {
    image,
    detections,
    transform,
    showBoxes = true,
    showMasks = true,
    maskOpacity = 0.35,
    labelFontPx = 13,
    dpr = 1,
  } = opts;
  const { scale, tx, ty } = transform;

  const mapX = (x) => x * scale + tx;
  const mapY = (y) => y * scale + ty;

  ctx.save();
  ctx.clearRect(0, 0, ctx.canvas.width / dpr, ctx.canvas.height / dpr);

  // Base image
  ctx.drawImage(image, tx, ty, image.naturalWidth * scale, image.naturalHeight * scale);

  // Masks first (under boxes/labels)
  if (showMasks) {
    for (const d of detections) {
      if (!d.mask || d.mask.length < 3) continue;
      const color = colorForClass(d.classId, d.className);
      ctx.beginPath();
      ctx.moveTo(mapX(d.mask[0][0]), mapY(d.mask[0][1]));
      for (let i = 1; i < d.mask.length; i++) {
        ctx.lineTo(mapX(d.mask[i][0]), mapY(d.mask[i][1]));
      }
      ctx.closePath();
      ctx.fillStyle = withAlpha(color, maskOpacity);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = withAlpha(color, Math.min(1, maskOpacity + 0.4));
      ctx.stroke();
    }
  }

  // Boxes + labels
  for (const d of detections) {
    const color = colorForClass(d.classId, d.className);
    const x = mapX(d.box.x1);
    const y = mapY(d.box.y1);
    const w = (d.box.x2 - d.box.x1) * scale;
    const h = (d.box.y2 - d.box.y1) * scale;

    if (showBoxes) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      ctx.strokeRect(x, y, w, h);
    }

    // Label chip (always shown so a detection is identifiable even with boxes off)
    const pct = Math.round(d.confidence * 100);
    const text = `${d.className}  ${pct}%`;
    ctx.font = `600 ${labelFontPx}px system-ui, -apple-system, sans-serif`;
    const padX = 6;
    const tw = ctx.measureText(text).width + padX * 2;
    const thh = labelFontPx + 8;
    let ly = y - thh;
    if (ly < 0) ly = y; // keep on-screen if the box hugs the top
    ctx.fillStyle = color;
    ctx.fillRect(x, ly, tw, thh);
    ctx.fillStyle = "#0b0f14";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + padX, ly + thh / 2 + 0.5);
  }

  ctx.restore();
}

// Render the full image at natural resolution with overlays and return a PNG blob.
export function exportAnnotated(image, detections, viewOpts) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d");
  drawScene(ctx, {
    image,
    detections,
    transform: { scale: 1, tx: 0, ty: 0 },
    labelFontPx: Math.max(14, Math.round(image.naturalWidth / 90)),
    ...viewOpts,
  });
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}
