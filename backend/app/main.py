from __future__ import annotations

import asyncio
from pathlib import Path

from fastapi import FastAPI, UploadFile, WebSocket, WebSocketDisconnect, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session, select

from celery.result import AsyncResult

from .settings import settings
from .db import init_db, engine
from .models import Model, ModelImage
from .storage import (
    ensure_dir,
    safe_suffix,
    save_upload_to_tmp,
    strip_exif_and_resize_to_square_1024,
    make_public_rel_path,
)
from .celery_app import celery_app

app = FastAPI(title="AI Agency API", version="0.1.0")

_cors_origins = [o.strip() for o in (settings.cors_origins or "").split(",") if o.strip()]
_cors_allow_all = "*" in _cors_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _cors_allow_all else _cors_origins,
    # Credentials + wildcard origin isn't valid CORS; default to no credentials when allow-all.
    allow_credentials=False if _cors_allow_all else True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STORAGE_DIR = Path(settings.storage_dir)
MODELS_DIR = STORAGE_DIR / "models"
OUTPUTS_DIR = STORAGE_DIR / "outputs"
TMP_DIR = STORAGE_DIR / "tmp"


@app.on_event("startup")
def _startup() -> None:
    ensure_dir(STORAGE_DIR)
    ensure_dir(MODELS_DIR)
    ensure_dir(OUTPUTS_DIR)
    ensure_dir(TMP_DIR)
    init_db()


# Serve stored files (outputs + processed refs) for local dev.
app.mount("/storage", StaticFiles(directory=str(STORAGE_DIR)), name="storage")


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/models")
def create_model(id: str = Form(...), display_name: str = Form(...)) -> Model:
    model_id = id.strip()
    if not model_id:
        raise HTTPException(status_code=400, detail="Model id required")

    with Session(engine) as session:
        existing = session.get(Model, model_id)
        if existing:
            raise HTTPException(status_code=409, detail="Model already exists")
        m = Model(id=model_id, display_name=display_name.strip() or model_id)
        session.add(m)
        session.commit()
        session.refresh(m)
        return m


@app.get("/models")
def list_models() -> list[Model]:
    with Session(engine) as session:
        return list(session.exec(select(Model).order_by(Model.created_at.desc())))


@app.get("/models/{model_id}")
def get_model(model_id: str) -> dict:
    with Session(engine) as session:
        m = session.get(Model, model_id)
        if not m:
            raise HTTPException(status_code=404, detail="Model not found")
        images = list(session.exec(select(ModelImage).where(ModelImage.model_id == model_id).order_by(ModelImage.created_at.asc())))
        return {"model": m, "images": images}


@app.post("/models/{model_id}/images")
async def upload_model_images(model_id: str, files: list[UploadFile]) -> dict:
    if not files:
        raise HTTPException(status_code=400, detail="No files")
    if len(files) > 10:
        raise HTTPException(status_code=400, detail="Max 10 images")

    with Session(engine) as session:
        m = session.get(Model, model_id)
        if not m:
            raise HTTPException(status_code=404, detail="Model not found")

        saved: list[ModelImage] = []
        for f in files:
            raw = await f.read()
            suffix = safe_suffix(f.filename or "upload.jpg")
            tmp_path = save_upload_to_tmp(raw, TMP_DIR, suffix)

            image_id = f"img_{model_id}_{Path(tmp_path).stem}"
            rel_path = make_public_rel_path("models", model_id, f"{image_id}.jpg")
            dst_path = STORAGE_DIR / rel_path

            w, h = strip_exif_and_resize_to_square_1024(tmp_path, dst_path)

            rec = ModelImage(
                id=image_id,
                model_id=model_id,
                filename=(f.filename or f"{image_id}.jpg"),
                rel_path=rel_path,
                width=w,
                height=h,
            )
            session.add(rec)
            saved.append(rec)

            try:
                tmp_path.unlink(missing_ok=True)
            except Exception:
                pass

        session.commit()
        return {"saved": saved}


@app.websocket("/ws/generate")
async def ws_generate(websocket: WebSocket):
    await websocket.accept()

    try:
        while True:
            data = await websocket.receive_json()

            model_id = (data.get("model_id") or "").strip()
            prompt = (data.get("prompt") or "").strip()
            image_ids = data.get("image_ids") or []
            consent_confirmed = bool(data.get("consent_confirmed"))

            if not consent_confirmed:
                await websocket.send_json({"status": "error", "message": "consent_confirmed must be true"})
                continue

            if not model_id or not prompt:
                await websocket.send_json({"status": "error", "message": "model_id and prompt required"})
                continue

            with Session(engine) as session:
                m = session.get(Model, model_id)
                if not m:
                    await websocket.send_json({"status": "error", "message": "model not found"})
                    continue

                q = select(ModelImage).where(ModelImage.model_id == model_id).order_by(ModelImage.created_at.asc())
                all_images = list(session.exec(q))

                if image_ids:
                    selected = [img for img in all_images if img.id in set(image_ids)]
                else:
                    selected = all_images

                if not selected:
                    await websocket.send_json({"status": "error", "message": "no reference images"})
                    continue

                image_paths = [str(STORAGE_DIR / img.rel_path) for img in selected]

            task = celery_app.send_task(
                "worker.tasks.generate_consistent_image",
                args=[prompt, image_paths],
            )
            await websocket.send_json({"status": "queued", "task_id": task.id})

            async_res = AsyncResult(task.id, app=celery_app)
            last_state = None
            while True:
                async_res = AsyncResult(task.id, app=celery_app)
                state = async_res.state
                info = async_res.info if isinstance(async_res.info, dict) else {}

                if state != last_state or state in {"PROGRESS"}:
                    payload = {"status": "processing", "state": state, **info}
                    await websocket.send_json(payload)
                    last_state = state

                if async_res.ready():
                    if async_res.successful():
                        result = async_res.get(timeout=1)
                        await websocket.send_json({"status": "complete", "result": result})
                    else:
                        await websocket.send_json({"status": "error", "message": str(async_res.result)})
                    break

                await asyncio.sleep(1)

    except WebSocketDisconnect:
        return
