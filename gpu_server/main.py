from __future__ import annotations

import io
import os
from typing import Annotated

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image

app = FastAPI(title="AI Agency GPU Server", version="0.1.0")


def _require_api_key(
    authorization: str | None,
    x_api_key: str | None,
) -> None:
    expected = (os.environ.get("GPU_SERVER_API_KEY") or "").strip()
    if not expected:
        return

    provided = (x_api_key or "").strip()
    if not provided and authorization:
        # Accept "Bearer <token>"
        parts = authorization.split(" ", 1)
        if len(parts) == 2 and parts[0].lower() == "bearer":
            provided = parts[1].strip()

    if provided != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")


def _max_image_bytes() -> int:
    try:
        return int(os.environ.get("MAX_IMAGE_BYTES", "8388608"))
    except Exception:
        return 8388608


_PIPE = None
_PIPE_DEVICE = None


def _get_pipe():
    global _PIPE, _PIPE_DEVICE
    if _PIPE is not None:
        return _PIPE

    # Import heavy deps lazily so the process can start quickly and fail with clearer errors.
    import torch
    from diffusers import Flux2Pipeline

    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is not available on this VM (torch.cuda.is_available() is False)")

    model_id = (os.environ.get("MODEL_ID") or "black-forest-labs/FLUX.2-dev").strip()
    token = (os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_HUB_TOKEN") or "").strip() or None

    torch_dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16

    # Diffusers has changed auth kwarg names over time; try both.
    try:
        pipe = Flux2Pipeline.from_pretrained(model_id, torch_dtype=torch_dtype, token=token)
    except TypeError:
        pipe = Flux2Pipeline.from_pretrained(model_id, torch_dtype=torch_dtype, use_auth_token=token)

    pipe = pipe.to("cuda")

    _PIPE = pipe
    _PIPE_DEVICE = "cuda"
    return _PIPE


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/generate")
async def generate(
    prompt: str = Form(...),
    images: list[UploadFile] = File(default_factory=list),
    seed: int | None = Form(None),
    num_inference_steps: int = Form(30),
    guidance_scale: float = Form(4.0),
    width: int = Form(1024),
    height: int = Form(1024),
    authorization: Annotated[str | None, Header()] = None,
    x_api_key: Annotated[str | None, Header()] = None,
) -> Response:
    _require_api_key(authorization=authorization, x_api_key=x_api_key)

    prompt = (prompt or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt required")
    if len(prompt) > 4000:
        raise HTTPException(status_code=400, detail="prompt too long")

    if len(images) > 10:
        raise HTTPException(status_code=400, detail="Max 10 images")

    # Clamp to keep the server stable.
    num_inference_steps = max(1, min(int(num_inference_steps), 80))
    guidance_scale = max(0.0, min(float(guidance_scale), 20.0))
    width = max(256, min(int(width), 2048))
    height = max(256, min(int(height), 2048))
    # Many diffusion pipelines expect multiples of 8.
    width -= width % 8
    height -= height % 8

    max_bytes = _max_image_bytes()
    pil_images: list[Image.Image] = []
    for f in images:
        raw = await f.read()
        if len(raw) > max_bytes:
            raise HTTPException(status_code=413, detail=f"Image too large (>{max_bytes} bytes): {f.filename}")
        try:
            im = Image.open(io.BytesIO(raw))
            pil_images.append(im.convert("RGB"))
        except Exception:
            raise HTTPException(status_code=400, detail=f"Invalid image: {f.filename}")

    try:
        pipe = _get_pipe()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Model init failed: {e}")

    try:
        import torch

        gen = None
        if seed is not None:
            gen = torch.Generator(device="cuda").manual_seed(int(seed))

        kwargs = dict(
            prompt=prompt,
            num_inference_steps=int(num_inference_steps),
            guidance_scale=float(guidance_scale),
            width=int(width),
            height=int(height),
            generator=gen,
        )

        if pil_images:
            # Flux2Pipeline APIs vary across versions; try a few common shapes.
            try:
                kwargs["image"] = pil_images if len(pil_images) > 1 else pil_images[0]
                result = pipe(**kwargs)
            except TypeError:
                kwargs.pop("image", None)
                kwargs["images"] = pil_images
                result = pipe(**kwargs)
        else:
            result = pipe(**kwargs)

        out = result.images[0]
        buf = io.BytesIO()
        out.save(buf, format="JPEG", quality=92, optimize=True)
        return Response(content=buf.getvalue(), media_type="image/jpeg")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference failed: {e}")


