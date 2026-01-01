from __future__ import annotations

import io
import os
import time
import textwrap
import uuid
from pathlib import Path

from celery import shared_task
from PIL import Image, ImageDraw, ImageFont
import requests


def _storage_dir() -> Path:
    return Path(os.environ.get("STORAGE_DIR", "./storage")).resolve()


def _outputs_dir() -> Path:
    p = _storage_dir() / "outputs"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _load_ref(path: str) -> Image.Image:
    im = Image.open(path)
    return im.convert("RGB")


def _make_grid(images: list[Image.Image], tile: int = 512, cols: int = 3) -> Image.Image:
    if not images:
        return Image.new("RGB", (tile, tile), (30, 30, 30))

    rows = (len(images) + cols - 1) // cols
    w = cols * tile
    h = rows * tile
    canvas = Image.new("RGB", (w, h), (20, 20, 20))

    for i, im in enumerate(images):
        r = i // cols
        c = i % cols
        thumb = im.copy()
        thumb = thumb.resize((tile, tile))
        canvas.paste(thumb, (c * tile, r * tile))

    return canvas


def _draw_overlay(base: Image.Image, prompt: str, headline: str = "Mock output") -> Image.Image:
    im = base.copy()
    draw = ImageDraw.Draw(im)

    # Semi-transparent bar
    bar_h = 180
    overlay = Image.new("RGBA", (im.width, bar_h), (0, 0, 0, 170))
    im.paste(overlay, (0, im.height - bar_h), overlay)

    # Font fallback
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 26)
    except Exception:
        font = ImageFont.load_default()

    text = f"{headline}\n" + "\n".join(textwrap.wrap(prompt, width=80)[:4])
    draw.text((18, im.height - bar_h + 18), text, fill=(255, 255, 255), font=font)
    return im


def _gpu_server_url() -> str:
    return (os.environ.get("GPU_SERVER_URL") or "").strip().rstrip("/")


def _gpu_server_api_key() -> str:
    return (os.environ.get("GPU_SERVER_API_KEY") or "").strip()


def _gpu_timeout_s() -> float:
    # Large models can take a while; default to 10 minutes.
    try:
        return float(os.environ.get("GPU_SERVER_TIMEOUT_S", "600"))
    except Exception:
        return 600.0


def _content_ext(content_type: str | None) -> str:
    ct = (content_type or "").lower()
    if "png" in ct:
        return "png"
    if "webp" in ct:
        return "webp"
    return "jpg"


def _gpu_healthcheck(url: str, headers: dict[str, str]) -> tuple[bool, str | None]:
    try:
        r = requests.get(f"{url}/health", headers=headers, timeout=(2, 2))
        if r.status_code != 200:
            return False, f"health {r.status_code}: {(r.text or '')[:2000]}"
        return True, None
    except Exception as e:
        return False, str(e)


@shared_task(bind=True, name="worker.tasks.generate_consistent_image")
def generate_consistent_image(self, job_id: str, prompt: str, reference_images_paths: list[str]) -> dict:
    """Generate an image using a remote GPU server (recommended) or a local mock fallback.

    Expected mapping:
      prompt uses @image1..@imageN
      reference_images_paths[0] corresponds to @image1, etc.
    """

    self.update_state(state="PROGRESS", meta={"progress": 5, "message": "loading references"})
    refs = [_load_ref(p) for p in reference_images_paths]

    gpu_url = _gpu_server_url()
    gpu_err: str | None = None
    headers: dict[str, str] = {}
    if gpu_url:
        api_key = _gpu_server_api_key()
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        self.update_state(state="PROGRESS", meta={"progress": 25, "message": f"checking GPU server: {gpu_url}/health"})
        ok, err = _gpu_healthcheck(gpu_url, headers=headers)
        if not ok:
            gpu_err = err or "unreachable"
            self.update_state(
                state="PROGRESS",
                meta={"progress": 30, "message": f"GPU server unavailable ({gpu_err}); using mock"},
            )
            gpu_url = ""
        else:
            self.update_state(state="PROGRESS", meta={"progress": 35, "message": "calling GPU server"})

    if gpu_url:
        timeout_s = _gpu_timeout_s()

        # Build multipart payload: prompt + images[]
        files = []
        for idx, p in enumerate(reference_images_paths):
            try:
                raw = Path(p).read_bytes()
            except Exception as e:
                raise RuntimeError(f"Failed to read reference image: {p} ({e})")
            files.append(("images", (f"image{idx+1}.jpg", raw, "image/jpeg")))

        data = {"prompt": prompt}

        last_err: Exception | None = None
        for attempt in range(1, 4):
            try:
                if attempt > 1:
                    self.update_state(
                        state="PROGRESS",
                        meta={"progress": 40, "message": f"retrying GPU request ({attempt}/3)"},
                    )
                    time.sleep(2 * (attempt - 1))

                r = requests.post(
                    f"{gpu_url}/generate",
                    data=data,
                    files=files,
                    headers=headers,
                    timeout=(5, timeout_s),
                )
                if r.status_code != 200:
                    body = (r.text or "")[:2000]
                    raise RuntimeError(f"GPU server error {r.status_code}: {body}")

                self.update_state(state="PROGRESS", meta={"progress": 80, "message": "saving output"})

                ext = _content_ext(r.headers.get("content-type"))
                out_id = uuid.uuid4().hex
                out_path = _outputs_dir() / f"gen-{out_id}.{ext}"
                out_path.write_bytes(r.content)

                self.update_state(state="PROGRESS", meta={"progress": 100, "message": "done"})

                rel_url = f"/storage/outputs/{out_path.name}"
                return {"job_id": job_id, "output_url": rel_url, "reference_count": len(reference_images_paths)}
            except Exception as e:
                last_err = e
                # Retry only on transient-ish errors.
                msg = str(e).lower()
                if "timed out" in msg or "connection" in msg or "503" in msg or "502" in msg or "504" in msg:
                    continue
                raise

        raise RuntimeError(f"GPU request failed after retries: {last_err}")

    # Fallback mock generator (keeps local dev working if GPU_SERVER_URL isn't set)
    self.update_state(state="PROGRESS", meta={"progress": 35, "message": "assembling preview (mock)"})
    grid = _make_grid(refs, tile=512, cols=3)

    self.update_state(state="PROGRESS", meta={"progress": 70, "message": "rendering output (mock)"})
    headline = "Mock output" if not gpu_err else f"Mock output (GPU server unavailable: {gpu_err})"
    out = _draw_overlay(grid, prompt, headline=headline)

    out_id = uuid.uuid4().hex
    out_path = _outputs_dir() / f"gen-{out_id}.jpg"
    out.save(out_path, format="JPEG", quality=92, optimize=True)

    self.update_state(state="PROGRESS", meta={"progress": 100, "message": "done"})

    # Backend serves /storage/**
    rel_url = f"/storage/outputs/{out_path.name}"
    return {"job_id": job_id, "output_url": rel_url, "reference_count": len(reference_images_paths)}
