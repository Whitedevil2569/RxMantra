/**
 * RxMantra API backend (Express).
 *
 * Security boundary between the browser and the Python ML service:
 *  - validates upload type & size
 *  - never exposes filesystem paths or the model file
 *  - forwards the image to the internal FastAPI service and relays predictions
 *
 * The browser talks ONLY to this server; it never reaches the ML service directly.
 */
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const PORT = process.env.PORT || 3001;
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://127.0.0.1:8000";
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const ALLOWED = new Set(["image/jpeg", "image/png"]);
// Lock CORS to the deployed frontend origin in production (set ALLOWED_ORIGIN).
// When the frontend is served same-origin via nginx, CORS isn't needed at all.
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

const app = express();
app.set("trust proxy", 1); // correct client IPs behind nginx (for rate limiting)
app.use(cors({ origin: ALLOWED_ORIGIN }));

// Inference is expensive on CPU hosts — cap requests per IP.
const predictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_PER_MIN || 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait a moment and try again." },
});

// In-memory upload only — the image is never written to disk here, so there is
// nothing to clean up and no path traversal surface.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.has(file.mimetype)) return cb(null, true);
    cb(new Error("UNSUPPORTED_TYPE"));
  },
});

app.get("/api/health", async (_req, res) => {
  try {
    const r = await fetch(`${ML_SERVICE_URL}/health`, { signal: AbortSignal.timeout(5000) });
    const body = await r.json();
    res.json({ backend: "ok", ml: body });
  } catch {
    res.status(503).json({ backend: "ok", ml: null, error: "ML service unavailable." });
  }
});

// Full class map (for stable per-class colors on the frontend).
app.get("/api/classes", async (_req, res) => {
  try {
    const r = await fetch(`${ML_SERVICE_URL}/classes`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error();
    res.json(await r.json());
  } catch {
    res.status(503).json({ error: "ML service unavailable." });
  }
});

app.post("/api/predict", predictLimiter, (req, res) => {
  upload.single("image")(req, res, async (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE")
        return res.status(413).json({ error: "Image exceeds the 25 MB limit." });
      if (err.message === "UNSUPPORTED_TYPE")
        return res.status(415).json({ error: "Only JPG and PNG images are supported." });
      return res.status(400).json({ error: "Upload failed. Please try again." });
    }
    if (!req.file) return res.status(400).json({ error: "No image was provided." });

    try {
      // Forward to the ML service. Generated field name; original filename is
      // never trusted or forwarded (privacy + no path traversal).
      const form = new FormData();
      const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
      const ext = req.file.mimetype === "image/png" ? "png" : "jpg";
      form.append("image", blob, `upload.${ext}`);

      const r = await fetch(`${ML_SERVICE_URL}/predict`, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(120000),
      });

      const data = await r.json().catch(() => null);
      if (!r.ok) {
        const detail = (data && data.detail) || "Analysis failed.";
        return res.status(r.status).json({ error: detail });
      }
      return res.json(data);
    } catch (e) {
      if (e.name === "TimeoutError")
        return res.status(504).json({ error: "Analysis timed out. Please try again." });
      // Do not leak internal error details/paths to the client.
      return res.status(502).json({ error: "The analysis service is unavailable." });
    }
  });
});

app.listen(PORT, () => {
  console.log(`RxMantra backend listening on http://127.0.0.1:${PORT}`);
  console.log(`Proxying inference to ${ML_SERVICE_URL}`);
});
