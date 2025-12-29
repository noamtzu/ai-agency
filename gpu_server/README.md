# GPU Server (FLUX.2) - FastAPI

This folder contains a minimal FastAPI service meant to run on your **GCP GPU VM** and provide a stable HTTP contract for the existing Celery worker.

## HTTP API

### `POST /generate`

- Content-Type: `multipart/form-data`
- Fields:
  - `prompt` (string, required)
  - `images` (file[], optional; 1..10 reference images)
  - Optional: `seed` (int), `num_inference_steps` (int), `guidance_scale` (float), `width` (int), `height` (int)
- Response:
  - `200` with raw image bytes, Content-Type `image/jpeg`

## Security

If `GPU_SERVER_API_KEY` is set, requests must include either:

- `Authorization: Bearer <GPU_SERVER_API_KEY>`; or
- `X-API-Key: <GPU_SERVER_API_KEY>`

## Environment variables

- `HF_TOKEN` or `HUGGINGFACE_HUB_TOKEN`: Hugging Face token (needed for gated weights)
- `MODEL_ID`: defaults to `black-forest-labs/FLUX.2-dev`
- `GPU_SERVER_API_KEY`: optional auth
- `MAX_IMAGE_BYTES`: per uploaded reference image (default: 8388608)

## Running (recommended)

Install a CUDA-enabled PyTorch build first (pick the command appropriate for your VM/CUDA version), then:

```bash
python -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
export HF_TOKEN="..."              # must have access to the gated model
export GPU_SERVER_API_KEY="..."    # optional but recommended
uvicorn main:app --host 0.0.0.0 --port 8080
```

Model documentation: `https://huggingface.co/black-forest-labs/FLUX.2-dev`


