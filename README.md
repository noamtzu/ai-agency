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
docker compose up --build
```

- Backend: `http://localhost:8000`
- Frontend: `http://localhost:3000`
- Redis: `localhost:6379`

### Frontend → Backend base URL (important for remote deploys)

By default, the frontend will call the backend at **the same hostname on port 8000**
(e.g. UI at `http://<vm-ip>:3000` → API at `http://<vm-ip>:8000`).

If your backend is on a different host/port (or behind a proxy), set:

- `NEXT_PUBLIC_API_BASE=http(s)://<your-api-host>:<port>`
- `NEXT_PUBLIC_WS_BASE=ws(s)://<your-api-host>:<port>`

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

#### GCP firewall (minimum)
- Allow inbound TCP **3000** to your IP (UI)
- (Optional) Allow inbound TCP **8000** to your IP (API)
- Do **not** expose **6379** (Redis) or **8080** (gpu_server) publicly

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
