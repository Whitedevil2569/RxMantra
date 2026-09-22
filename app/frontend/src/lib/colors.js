// Stable, visually distinct color per class id.
// A few clinically-suggestive overrides from the brief; everything else is
// derived from a golden-angle hue walk so any of the 31 classes gets a
// consistent, well-separated color automatically.

const OVERRIDES = {
  Caries: "#ef4444", // red
  "Periapical lesion": "#f97316", // orange
  "Retained root": "#a855f7", // purple
  "Root Piece": "#3b82f6", // blue
  "Missing teeth": "#eab308", // yellow
  "Impacted tooth": "#22c55e", // green
};

const cache = new Map();

export function colorForClass(classId, className) {
  if (className && OVERRIDES[className]) return OVERRIDES[className];
  if (cache.has(classId)) return cache.get(classId);
  // Golden-angle hue spacing for maximum separation across many classes.
  const hue = (classId * 137.508) % 360;
  const color = `hsl(${hue.toFixed(0)}, 70%, 55%)`;
  cache.set(classId, color);
  return color;
}

// Convert any CSS color to an rgba string with the given alpha (for mask fills).
export function withAlpha(color, alpha) {
  if (color.startsWith("#")) {
    const n = parseInt(color.slice(1), 16);
    const r = (n >> 16) & 255,
      g = (n >> 8) & 255,
      b = n & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }
  if (color.startsWith("hsl")) {
    return color.replace("hsl", "hsla").replace(")", `,${alpha})`);
  }
  return color;
}
