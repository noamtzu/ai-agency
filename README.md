## AI Agency (Multi-Reference Consistency) — Starter Monorepo

This is a **starter project** for an “AI Agency” workflow:
- **Model Library**: upload 5–10 reference photos per model, store metadata, **strip EXIF** and **resize to 1024×1024**.
- **Inference Studio**: write prompts with `@image1`, `@image2`, … tags mapped to selected reference photos.
- **Backend**: FastAPI API + WebSocket progress updates.
- **Async compute**: Redis + Celery worker (can call a **remote GPU server**; if not configured it falls back to a mock generator).

### Safety & consent
This starter is designed for **consenting, authorized** use only (e.g., hired talent / your own assets). Don’t use it to impersonate real people without permission.

---

## Local dev (no GPU)

### 1) Configure env

Copy `.env.example` to `.env` and adjust if needed.

### 2) Run services

```bash
./scripts/compose-up.sh
```

- Backend: `http://localhost:8000`
- Frontend: `http://localhost:3000`
- Redis: internal to Docker network (not published to host by default)

By default (no `GPU_SERVER_URL` set), generations use a **mock** image generator so you can run locally without a GPU.

### Frontend → Backend base URL (important for remote deploys)

By default, the frontend will call the backend at **the same hostname on port 8000**
(e.g. UI at `http://<vm-ip>:3000` → API at `http://<vm-ip>:8000`).

If your backend is on a different host/port (or behind a proxy), set:

- `NEXT_PUBLIC_API_BASE=http(s)://<your-api-host>:<port>`
- `NEXT_PUBLIC_WS_BASE=ws(s)://<your-api-host>:<port>`

### CORS (important when UI is on :3000 and API is on :8000)

If the browser console shows a CORS error like “No `Access-Control-Allow-Origin` header”, verify what the **live API** is returning:

```bash
curl -i \
  -H 'Origin: http://<vm-ip>:3000' \
  http://<vm-ip>:8000/health
```

You should see `access-control-allow-origin: *` (or your specific origin).

If not, set `CORS_ORIGINS` for the backend (recommended in production: set the exact UI origin; for quick testing you can use `*`), then restart/rebuild:

```bash
# allow only the UI origin (recommended)
export CORS_ORIGINS="http://<vm-ip>:3000"

# OR (quick test) allow all origins
# export CORS_ORIGINS="*"

docker compose up -d --build backend
```

### 3) Flow
- Create a model (e.g. `model_sarah`)
- Upload reference images
- Open Studio, select references → prompt using `@image1` etc → generate

---

## Remote GPU (GCP VM + FLUX.2)

This repo includes a minimal GPU inference server you can run on a **GCP GPU VM** and have the local `worker` call it over HTTP.

Model doc: `https://huggingface.co/black-forest-labs/FLUX.2-dev`

### All-in-one deployment (everything on the GPU VM)

If you want **frontend + backend + redis + worker + gpu_server** all running on the GPU VM, use Docker Compose on the VM.

#### VM prerequisites
- NVIDIA driver installed (`nvidia-smi` works)
- Docker + Docker Compose v2 installed
- NVIDIA Container Toolkit installed (so Docker containers can use the GPU)
- A Hugging Face token with access to the gated model (`HF_TOKEN`)

#### Bring up the stack (auto-detect GPU)

```bash
./scripts/compose-up.sh
```

- On a machine where `nvidia-smi` works, the script enables the `gpu` compose profile (starts `gpu_server`).
- On a machine without an NVIDIA GPU, it starts the non-GPU services only.

#### GCP setup (configuration checklist)

- **VM**
  - Create a Compute Engine VM with an **NVIDIA GPU** (e.g. L4/T4/A100 depending on availability).
  - Use an Ubuntu image (22.04 is a good default).
  - Set the boot disk large enough for model caches (**100–200GB+** recommended; FLUX + caches are multi‑GB).
  - Ensure the VM has an **external IPv4** (ephemeral is fine for testing; reserve a static IP for stable URLs).

- **Drivers**
  - Install NVIDIA drivers on the VM (GCP has a “GPU driver installation” option on some images/flows, or install manually).
  - Verify on the VM:

```bash
nvidia-smi
```

- **Docker GPU runtime**
  - Install the **NVIDIA Container Toolkit** so Docker containers can access the GPU, then restart Docker.
  - Verify Docker can see the GPU (example):

```bash
docker run --rm --gpus all nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04 nvidia-smi
```

- **Network tags / firewall**
  - Either attach a network tag to the VM (e.g. `ai-agency`) and target firewall rules to it, or target firewall rules to the VM directly.

#### GCP firewall (minimum)
- Allow inbound TCP **3000** to your IP (UI)
- (Optional) Allow inbound TCP **8000** to your IP (API; required if you use the default frontend settings)
- Do **not** expose **6379** (Redis) or **8080** (gpu_server) publicly

Example `gcloud` firewall rules (adjust `--source-ranges`):

```bash
# UI (Next.js)
gcloud compute firewall-rules create ai-agency-allow-3000 \
  --allow tcp:3000 \
  --source-ranges YOUR_IP/32 \
  --target-tags ai-agency

# API (FastAPI) - optional
gcloud compute firewall-rules create ai-agency-allow-8000 \
  --allow tcp:8000 \
  --source-ranges YOUR_IP/32 \
  --target-tags ai-agency
```

#### Ubuntu host firewall (ufw example)

If you use `ufw` on the VM:

```bash
sudo ufw allow 3000/tcp
sudo ufw allow 8000/tcp   # optional (but required if you keep the default frontend→backend behavior)
sudo ufw deny 6379/tcp
sudo ufw status
```

#### Compose notes (remote access)

- The frontend must bind to `0.0.0.0` inside the container to be reachable remotely. This repo’s `npm run dev` does that (`next dev -H 0.0.0.0 -p 3000`).
- `gpu_server` uses `gpus: all`. On Ubuntu you must have **NVIDIA drivers** + **NVIDIA Container Toolkit** installed for Docker GPU passthrough.

#### Run
On the VM (from the repo root), create a `.env` file with at least:
- `HF_TOKEN=...`
- `GPU_SERVER_API_KEY=...` (recommended)

Then:

```bash
docker compose up -d --build
```

Open the UI at:
- `http://<vm-public-ip>:3000`

Quick checks (on the VM):

```bash
curl -sS http://localhost:8000/health
docker compose exec gpu_server nvidia-smi
```

### 1) Run the GPU server on your VM

On the VM:

- Ensure NVIDIA drivers + CUDA are installed.
- Ensure you have a Hugging Face token with access to the gated model.

From this repo’s `gpu_server/` folder (copy it to the VM or clone the repo there):

```bash
python -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

export HF_TOKEN="..."              # required
export GPU_SERVER_API_KEY="..."    # optional but recommended

uvicorn main:app --host 0.0.0.0 --port 8080
```

The GPU server exposes:

- `GET /health`
- `POST /generate` (multipart: `prompt` + `images[]`, returns raw JPEG bytes)

### 2) Point the local worker at the VM

Set these env vars for the local stack (e.g. in your `.env`):

- `GPU_SERVER_URL=http://<vm-ip>:8080` (or your HTTPS domain)
- `GPU_SERVER_API_KEY=...` (only if you set it on the VM)
- `GPU_SERVER_TIMEOUT_S=600` (optional)

Then run:

```bash
docker compose up --build
```

If `GPU_SERVER_URL` is set, the worker will call the VM. If it is empty, it will fall back to the mock generator.

---

## Project layout

- `backend/` FastAPI + SQLite + uploads/outputs
- `worker/` Celery worker (calls `GPU_SERVER_URL` when set; otherwise uses a mock generator)
- `frontend/` Next.js dashboard
- `gpu_server/` FastAPI GPU inference server meant to run on your GCP GPU VM
- `docker-compose.yml` Redis + backend + worker + frontend
