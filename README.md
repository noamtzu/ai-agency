## AI Agency — Multi-reference “consistency” starter

Monorepo for a simple “AI agency” workflow:
- **Model library**: upload 5–10 reference photos per model; images are **EXIF-stripped** and normalized to **1024×1024**.
- **Studio**: write prompts using `@image1`, `@image2`, … mapped to selected reference photos.
- **API**: FastAPI + WebSocket progress updates.
- **Async compute**: Redis + Celery worker.
- **GPU inference (optional)**: a small FastAPI **GPU server** that runs FLUX.2 on an NVIDIA GPU.

### Safety / consent
This starter is intended for **authorized, consenting** use only. Don’t use it to impersonate real people without permission.

---

## Quick start (Docker Compose)

### Requirements
- Docker + Docker Compose v2
- (GPU mode) NVIDIA driver (`nvidia-smi` works) + NVIDIA Container Toolkit

### 1) Configure env
Create a `.env` file (local dev can leave values blank; GPU VM must set `HF_TOKEN`):

```bash
cat > .env <<'EOF'
# Hugging Face token with access to the gated model black-forest-labs/FLUX.2-dev
HF_TOKEN=
# Alternate name supported by the GPU server:
HUGGINGFACE_HUB_TOKEN=

# Recommended: protect worker -> gpu_server calls (internal, but still good practice)
GPU_SERVER_API_KEY=

# Optional: tune VRAM usage (gpu_server)
# Values: model (default), sequential, 0 (disable offload)
DIFFUSERS_CPU_OFFLOAD=model

# Optional: maximum bytes allowed per uploaded reference image
MAX_IMAGE_BYTES=8388608

# Backend: comma-separated allowed origins. Example: http://<YOUR_HOST>:3000
# Use "*" for quick testing.
CORS_ORIGINS=

# Frontend overrides (optional). If unset, frontend calls backend at same hostname on :8000
NEXT_PUBLIC_API_BASE=
NEXT_PUBLIC_WS_BASE=
EOF
```

Minimum:
- **GPU VM**: set `HF_TOKEN` (required) and preferably `GPU_SERVER_API_KEY`.
- **Local (no GPU)**: you can leave everything blank; the worker will fall back to a mock generator.

### 2) Start services

```bash
./scripts/compose-up.sh
```

That script:
- enables the Compose profile `gpu` **only if** it detects a host GPU (`nvidia-smi` works)
- otherwise starts the non-GPU stack (dev-friendly)

### 3) Open the app
- **Frontend**: `http://localhost:3000`
- **Backend**: `http://localhost:8000`

---

## Architecture (what runs where)

### Services
- **`frontend`** (`frontend/`): Next.js UI (binds `0.0.0.0:3000` in the container)
- **`backend`** (`backend/`): FastAPI API + WebSocket + static file serving for `/storage/**` (binds `0.0.0.0:8000`)
- **`worker`** (`worker/`): Celery worker; generates images via:
  - **GPU server** (preferred) if reachable, or
  - **mock generator** if not configured/reachable (so local dev works without a GPU)
- **`redis`**: message broker (internal only, not published)
- **`gpu_server`** (`gpu_server/`): FastAPI inference server for **`black-forest-labs/FLUX.2-dev`** (internal only, not published)

### Ports (host)
- **3000**: frontend (published)
- **8000**: backend (published)
- **6379**: redis (**not** published)
- **8080**: gpu_server (**not** published)

---

## GPU deployment on GCP (A100 / `a2-highgpu-1g`)

This repo is designed to run **everything on the GPU VM** via Docker Compose.

### VM checklist
- **Ubuntu 22.04** recommended
- **Disk**: **200GB+** recommended (HF caches + model weights are large)
- **GPU**: NVIDIA A100 40GB
- **Driver**: `nvidia-smi` works on the host

### Install GPU container runtime (required)
You need the **NVIDIA Container Toolkit** so Docker can pass the GPU into containers, then verify:

```bash
docker run --rm --gpus all nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04 nvidia-smi
```

### Firewall rules (minimum)
- Allow inbound TCP **3000** (UI) from your IP
- Allow inbound TCP **8000** (API) from your IP (needed for default UI → API behavior)
- Do **not** expose **6379** (redis) or **8080** (gpu_server)

### Required env on the VM
Create `.env` on the VM (from repo root):
- **`HF_TOKEN`** (or `HUGGINGFACE_HUB_TOKEN`): Hugging Face token with access to the gated model
- **`GPU_SERVER_API_KEY`**: recommended (worker → gpu server auth)

### Start
On the VM:

```bash
./scripts/compose-up.sh
```

### Verify on the VM

```bash
curl -sS http://localhost:8000/health
curl -sS http://localhost:8000/v1/runtime
docker compose exec gpu_server nvidia-smi
docker compose logs -f --tail=200 gpu_server
```

---

## Configuration reference (env vars)

### Backend (`backend`)
- **`BACKEND_HOST`**: default `0.0.0.0`
- **`BACKEND_PORT`**: default `8000`
- **`CORS_ORIGINS`**: comma-separated origins; set `*` to allow all (better: set exact UI origin in prod)
- **`DATABASE_URL`**: default SQLite in `./storage/app.db`
- **`REDIS_URL`**: default `redis://redis:6379/0`
- **`STORAGE_DIR`**: default `./storage`

### Worker (`worker`)
- **`GPU_SERVER_URL`**: explicit override; if empty, auto-discovery is used
- **`AUTO_GPU_SERVER`**: default `1` (auto-discover a healthy GPU server)
- **`GPU_SERVER_CANDIDATES`**: comma-separated candidates; defaults to `http://gpu_server:8080,http://127.0.0.1:8080`
- **`GPU_SERVER_API_KEY`**: sent as `Authorization: Bearer ...` when set
- **`GPU_SERVER_TIMEOUT_S`**: default `600`

### GPU server (`gpu_server`)
- **`HF_TOKEN`** / **`HUGGINGFACE_HUB_TOKEN`**: required for gated weights
- **`MODEL_ID`**: locked to `black-forest-labs/FLUX.2-dev` (any other value errors)
- **`GPU_SERVER_API_KEY`**: optional auth; when set, requests must include `Authorization: Bearer ...` or `X-API-Key`
- **`DIFFUSERS_CPU_OFFLOAD`**: `model` (default), `sequential`, or `0` (off)
- **`MAX_IMAGE_BYTES`**: default `8388608`

### Frontend (`frontend`)
By default, the UI calls the API at the **same hostname on port 8000**.

Override if needed:
- **`NEXT_PUBLIC_API_BASE`**: `http(s)://<api-host>:<port>`
- **`NEXT_PUBLIC_WS_BASE`**: `ws(s)://<api-host>:<port>`

---

## Troubleshooting

### GPU server doesn’t start / “CUDA is not available”
- Confirm host driver: `nvidia-smi`
- Confirm Docker GPU runtime:

```bash
docker run --rm --gpus all nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04 nvidia-smi
```

### Hugging Face 401 / “gated repo”
- Ensure you requested access to `black-forest-labs/FLUX.2-dev`
- Ensure `.env` includes `HF_TOKEN=...` on the GPU VM
- Check logs: `docker compose logs -f --tail=200 gpu_server`

### UI loads but generates fail / worker uses “mock”
- Check worker logs: `docker compose logs -f --tail=200 worker`
- Check GPU server health inside the Docker network:

```bash
docker compose exec worker python -c "import requests; print(requests.get('http://gpu_server:8080/health').status_code)"
```

### CORS errors in browser
Set backend `CORS_ORIGINS` to your UI origin (recommended) or `*` (quick test), then rebuild backend:

```bash
docker compose up -d --build backend
```

---

## Repo layout
- `backend/`: FastAPI + SQLite + storage
- `worker/`: Celery worker (calls GPU server or mock)
- `frontend/`: Next.js UI
- `gpu_server/`: FastAPI GPU inference server (FLUX.2)
- `docker-compose.yml`: service orchestration
