# Deploying RxMantra (CPU-only)

The whole app runs as three Docker containers on one ordinary (no-GPU) Linux
server. Only the web tier is exposed; the backend and ML service stay on a
private Docker network.

```
Internet ──▶ web (nginx :80)  ──/api──▶ backend (:3001) ──▶ ml (FastAPI :8000) ──▶ best.pt (CPU)
             serves the React build            (private)              (private)
```

## Measured CPU inference (on this dev machine)
| Resolution | Latency | Detections |
|-----------|---------|-----------|
| `IMGSZ=1024` (default) | ~0.5 s | 39 |
| `IMGSZ=640` | ~0.2 s | 37 |

A small cloud CPU (2 vCPU) will be roughly 2–5× slower, so expect ~1–2.5 s per
image at 1024, or ~0.5–1 s at 640. Detections are nearly identical at 640, so
set `IMGSZ=640` in `docker-compose.yml` if you want cheaper/faster.

## Test locally first (needs Docker Desktop)
```bash
cd D:\RxMantra\app
docker compose up --build
# open http://localhost
```
The first build takes a few minutes (downloads CPU torch + ultralytics). The
138 MB model is baked into the ml image, so the container is self-contained.

## Deploy to a cheap VPS
Works on any ~$5–6/mo Linux VPS (Hetzner, DigitalOcean, Linode, etc.) with
1–2 GB RAM. **2 GB RAM recommended** (torch + ultralytics are memory-hungry).

1. Create an Ubuntu VPS and SSH in.
2. Install Docker:
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
3. Copy the project up (from your machine). You only need `app/` and the one
   model file — the `.dockerignore` already excludes `.venv`, `datasets`, and
   the other training runs:
   ```bash
   # from D:\RxMantra
   scp -r app runs/dental_seg-4/weights/best.pt user@YOUR_SERVER:/opt/rxmantra/
   ```
   (Keep the path `runs/dental_seg-4/weights/best.pt` relative to the repo root
   so the ml Dockerfile can find it, or adjust the compose `context`.)
4. Build and run:
   ```bash
   cd /opt/rxmantra/app
   docker compose up --build -d
   ```
5. Open `http://YOUR_SERVER_IP`.

## Add a domain + HTTPS (before sharing publicly)
Easiest options, no extra files needed:
- **Cloudflare**: point your domain at the server, enable "Flexible/Full" SSL.
  Free, gives HTTPS + basic DDoS protection.
- **Caddy** in front: run a Caddy reverse proxy that auto-issues Let's Encrypt
  certs and forwards to the `web` container on :80.

## Before you make it public — checklist
This is a local-first build. Harden these first:
- [ ] **HTTPS** (above) — never send X-rays over plain HTTP publicly.
- [ ] **Access control** — there is no login. Add HTTP Basic Auth at nginx/Caddy,
      or an app-level auth, if it shouldn't be open to everyone.
- [ ] **Rate limit** — already on (`RATE_LIMIT_PER_MIN`, default 20/min per IP);
      tune it for your host.
- [ ] **Keep the model private** — the ml/backend tiers are not exposed by the
      compose file; don't publish their ports.
- [ ] **Disclaimer stays visible** — the UI already shows the not-a-medical-device
      notice. Keep it.
- [ ] **Privacy** — uploads are processed in memory and never written to disk or
      sent to third parties; keep it that way.

## Files that make this work
- `app/ml-service/Dockerfile` — CPU torch, model baked in
- `app/backend/Dockerfile` — Express API
- `app/frontend/Dockerfile` + `nginx.conf` — build React, serve + proxy `/api`
- `app/docker-compose.yml` — the three-tier stack
- `.dockerignore` (repo root) — keeps the build context small

## Note on the dev vs. prod environment
Your dev machine uses GPU torch (`+cu128`) for the RTX 5090. The Docker images
deliberately use **CPU** torch so they run on any server. Nothing about the dev
setup needs to change — these files are separate and additive.
