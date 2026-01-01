from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, UploadFile, WebSocket, WebSocketDisconnect, Form, HTTPException, Request, Header, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, StreamingResponse
from sqlmodel import Session, select

from celery.result import AsyncResult
from pydantic import BaseModel
from sqlalchemy import func

from .settings import settings
from .db import init_db, engine
from .models import Model, ModelImage, GenerationJob, Project, PromptTemplate
from .errors import error_envelope
from .storage import (
    ensure_dir,
    safe_suffix,
    save_upload_to_tmp,
    strip_exif_and_resize_to_square_1024,
    make_public_rel_path,
)
from .celery_app import celery_app
from . import llm as llm_service
from .runtime_env import resolve_gpu_server_status

app = FastAPI(title="AI Agency API", version="0.1.0")

if (settings.env or "").lower() == "prod":
    allowed_hosts = [h.strip() for h in (settings.allowed_hosts or "").split(",") if h.strip()]
    if allowed_hosts:
        app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed_hosts)

_default_cors_origins = ["http://localhost:3000", "http://0.0.0.0:3000"]
_cors_origins = [o.strip() for o in (settings.cors_origins or "").split(",") if o.strip()]
# If the env var is present-but-empty (common in compose/.env setups), fall back to dev defaults.
if not _cors_origins:
    _cors_origins = _default_cors_origins
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

_REQUEST_ID_HEADER = "x-request-id"


@app.on_event("startup")
def _startup() -> None:
    ensure_dir(STORAGE_DIR)
    ensure_dir(MODELS_DIR)
    ensure_dir(OUTPUTS_DIR)
    ensure_dir(TMP_DIR)
    init_db()


# Serve stored files (outputs + processed refs) for local dev.
app.mount("/storage", StaticFiles(directory=str(STORAGE_DIR)), name="storage")


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    rid = request.headers.get(_REQUEST_ID_HEADER) or uuid.uuid4().hex
    request.state.request_id = rid
    resp = await call_next(request)
    resp.headers[_REQUEST_ID_HEADER] = rid
    # Basic security headers (lightweight; for full CSP, prefer a reverse proxy like Caddy/Nginx).
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "no-referrer")
    resp.headers.setdefault("Cross-Origin-Resource-Policy", "same-site")
    return resp


def _error_response(request: Request | None, *, code: str, message: str, status_code: int, details: dict | None = None):
    rid = getattr(getattr(request, "state", None), "request_id", None) if request else None
    return JSONResponse(status_code=status_code, content=error_envelope(code=code, message=message, request_id=rid, details=details))


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    # Preserve existing behavior when `detail` is plain text, but wrap it in a stable envelope.
    return _error_response(request, code="http_error", message=str(exc.detail), status_code=exc.status_code)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    return _error_response(request, code="internal_error", message="Internal server error", status_code=500)


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.get("/v1/runtime")
async def runtime_status() -> dict:
    gpu = await resolve_gpu_server_status()
    return {
        "ok": True,
        "gpu_server": {
            "url": gpu.url,
            "reachable": gpu.reachable,
            "reason": gpu.reason,
        },
    }


async def _read_prompt_from_request(request: Request) -> str:
    ct = (request.headers.get("content-type") or "").lower()
    if "text/plain" in ct:
        raw = await request.body()
        return (raw or b"").decode("utf-8", errors="replace").strip()
    data = await request.json()
    return str((data or {}).get("prompt") or "").strip()


@app.post("/v1/llm")
async def llm_complete(request: Request) -> dict:
    prompt = await _read_prompt_from_request(request)
    try:
        r = await llm_service.complete(prompt)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
    return {"text": r.text, "provider": r.provider, "model": r.model}


@app.get("/debug/cors")
def debug_cors(
    x_api_key: str | None = Header(default=None),
) -> dict:
    """
    Debug helper: returns the resolved CORS origins list the server booted with.
    (The actual CORS headers are still added by CORSMiddleware based on the request Origin.)
    """
    if (settings.env or "").lower() == "prod":
        expected = (settings.admin_api_key or "").strip()
        if expected and (x_api_key or "").strip() != expected:
            raise HTTPException(status_code=401, detail="Unauthorized")
    return {"cors_origins": _cors_origins, "allow_all": _cors_allow_all}


def _now() -> datetime:
    return datetime.utcnow()


def _job_public(job: GenerationJob) -> dict:
    out_url = job.output_rel_url
    return {
        "id": job.id,
        "model_id": job.model_id,
        "source": getattr(job, "source", None),
        "prompt_template_id": getattr(job, "prompt_template_id", None),
        "status": job.status,
        "progress": job.progress,
        "message": job.message,
        "prompt": job.prompt,
        "image_ids_json": job.image_ids_json,
        "output_url": out_url,
        "error_code": job.error_code,
        "error_message": job.error_message,
        "created_at": job.created_at.isoformat(),
        "updated_at": job.updated_at.isoformat(),
    }


def _sync_job_from_celery(session: Session, job: GenerationJob) -> GenerationJob:
    """
    Best-effort: reconcile DB job with Celery result state.
    """
    if not job.celery_task_id:
        return job
    if job.status in {"complete", "error", "cancelled"}:
        return job

    ar = AsyncResult(job.celery_task_id, app=celery_app)
    state = ar.state
    info = ar.info if isinstance(ar.info, dict) else {}

    if state in {"PENDING"} and job.status == "queued":
        # no-op
        return job

    if state in {"STARTED", "PROGRESS"}:
        job.status = "running"
        if "progress" in info:
            try:
                job.progress = int(info.get("progress"))
            except Exception:
                pass
        if "message" in info:
            job.message = str(info.get("message") or "")
        job.updated_at = _now()
        session.add(job)
        session.commit()
        session.refresh(job)
        return job

    if ar.ready():
        if ar.successful():
            try:
                result = ar.get(timeout=1)
            except Exception as e:
                job.status = "error"
                job.error_code = "result_fetch_failed"
                job.error_message = str(e)
                job.updated_at = _now()
                session.add(job)
                session.commit()
                session.refresh(job)
                return job

            job.status = "complete"
            job.progress = 100
            job.message = "done"
            if isinstance(result, dict) and result.get("output_url"):
                job.output_rel_url = str(result["output_url"])
            job.updated_at = _now()
            session.add(job)
            session.commit()
            session.refresh(job)
            return job

        job.status = "error"
        job.error_code = "celery_failed"
        job.error_message = str(ar.result)
        job.updated_at = _now()
        session.add(job)
        session.commit()
        session.refresh(job)
        return job

    return job


@app.post("/v1/generations", status_code=202)
async def create_generation(request: Request) -> dict:
    data = await request.json()
    model_id = (data.get("model_id") or "").strip()
    prompt = (data.get("prompt") or "").strip()
    image_ids = data.get("image_ids") or []
    consent_confirmed = bool(data.get("consent_confirmed"))
    source = (data.get("source") or "api").strip() or "api"
    prompt_template_id = (data.get("prompt_template_id") or "").strip() or None
    params = data.get("params")

    if not consent_confirmed:
        raise HTTPException(status_code=400, detail="consent_confirmed must be true")
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt required")
    if len(prompt) > 4000:
        raise HTTPException(status_code=400, detail="prompt too long")
    if image_ids and not model_id:
        raise HTTPException(status_code=400, detail="model_id is required when image_ids are provided")

    with Session(engine) as session:
        # Optional model_id: allow pure text-to-image runs without any saved "reference set".
        # We still persist a job record, so store a stable sentinel model id.
        if not model_id:
            selected: list[ModelImage] = []
            image_paths: list[str] = []
            canonical_ids: list[str] = []
            model_id = "__text2img__"
        else:
            m = session.get(Model, model_id)
            if not m:
                raise HTTPException(status_code=404, detail="model not found")

            q = select(ModelImage).where(ModelImage.model_id == model_id).order_by(ModelImage.created_at.asc())
            all_images = list(session.exec(q))

            if image_ids:
                selected = [img for img in all_images if img.id in set(image_ids)]
            else:
                selected = all_images

            # Allow zero reference images (pure text-to-image).
            image_paths = [str(STORAGE_DIR / img.rel_path) for img in selected]
            canonical_ids = [img.id for img in selected]

        job_id = uuid.uuid4().hex
        job = GenerationJob(
            id=job_id,
            model_id=model_id,
            prompt=prompt,
            source=source,
            prompt_template_id=prompt_template_id,
            params_json=json.dumps(params) if isinstance(params, (dict, list)) else "{}",
            image_ids_json=json.dumps(canonical_ids),
            status="queued",
            progress=0,
            message="queued",
            created_at=_now(),
            updated_at=_now(),
        )
        session.add(job)
        session.commit()
        session.refresh(job)

        task = celery_app.send_task(
            "worker.tasks.generate_consistent_image",
            args=[job_id, prompt, image_paths],
        )
        job.celery_task_id = task.id
        job.updated_at = _now()
        session.add(job)
        session.commit()
        session.refresh(job)

        return {"job_id": job.id, "task_id": task.id}


@app.get("/v1/generations/{job_id}")
def get_generation(job_id: str) -> dict:
    with Session(engine) as session:
        job = session.get(GenerationJob, job_id)
        if not job:
            raise HTTPException(status_code=404, detail="generation not found")
        job = _sync_job_from_celery(session, job)
        return {"job": _job_public(job)}


@app.get("/v1/models/{model_id}/generations")
def list_generations(model_id: str, limit: int = 20) -> dict:
    limit = max(1, min(int(limit), 100))
    with Session(engine) as session:
        q = (
            select(GenerationJob)
            .where(GenerationJob.model_id == model_id)
            .order_by(GenerationJob.created_at.desc())
            .limit(limit)
        )
        jobs = list(session.exec(q))
        return {"jobs": [_job_public(j) for j in jobs]}


@app.post("/v1/generations/{job_id}/cancel")
def cancel_generation(job_id: str) -> dict:
    with Session(engine) as session:
        job = session.get(GenerationJob, job_id)
        if not job:
            raise HTTPException(status_code=404, detail="generation not found")
        if job.status in {"complete", "error", "cancelled"}:
            return {"job": _job_public(job)}
        if job.celery_task_id:
            try:
                celery_app.control.revoke(job.celery_task_id, terminate=False)
            except Exception:
                pass
        job.status = "cancelled"
        job.message = "cancelled"
        job.updated_at = _now()
        session.add(job)
        session.commit()
        session.refresh(job)
        return {"job": _job_public(job)}


@app.get("/v1/generations/{job_id}/events")
async def generation_events(job_id: str):
    async def gen():
        last_payload = None
        while True:
            with Session(engine) as session:
                job = session.get(GenerationJob, job_id)
                if not job:
                    payload = {"type": "error", "message": "generation not found"}
                    yield f"event: error\ndata: {json.dumps(payload)}\n\n"
                    return
                job = _sync_job_from_celery(session, job)
                payload = {"type": "job", "job": _job_public(job)}

            raw = json.dumps(payload, separators=(",", ":"))
            if raw != last_payload:
                yield f"event: job\ndata: {raw}\n\n"
                last_payload = raw

            if payload["job"]["status"] in {"complete", "error", "cancelled"}:
                return

            # Keep-alive + backoff.
            await asyncio.sleep(1)

    return StreamingResponse(gen(), media_type="text/event-stream")


class CreateProjectIn(BaseModel):
    id: str
    name: str
    description: str | None = None


class UpdateProjectIn(BaseModel):
    name: str | None = None
    description: str | None = None


@app.post("/v1/projects", status_code=201)
def create_project(payload: CreateProjectIn) -> Project:
    project_id = (payload.id or "").strip()
    if not project_id:
        raise HTTPException(status_code=400, detail="project id required")
    with Session(engine) as session:
        existing = session.get(Project, project_id)
        if existing:
            raise HTTPException(status_code=409, detail="project already exists")
        p = Project(id=project_id, name=(payload.name or "").strip() or project_id, description=(payload.description or None))
        session.add(p)
        session.commit()
        session.refresh(p)
        return p


@app.get("/v1/projects")
def list_projects() -> list[Project]:
    with Session(engine) as session:
        return list(session.exec(select(Project).order_by(Project.created_at.desc())))


@app.get("/v1/projects/{project_id}")
def get_project(project_id: str) -> dict:
    with Session(engine) as session:
        p = session.get(Project, project_id)
        if not p:
            raise HTTPException(status_code=404, detail="project not found")
        models = list(session.exec(select(Model).where(Model.project_id == project_id).order_by(Model.created_at.desc())))
        prompts = list(session.exec(select(PromptTemplate).where(PromptTemplate.project_id == project_id).order_by(PromptTemplate.created_at.desc())))
        return {"project": p, "models": models, "prompts": prompts}


@app.patch("/v1/projects/{project_id}")
def update_project(project_id: str, payload: UpdateProjectIn) -> Project:
    with Session(engine) as session:
        p = session.get(Project, project_id)
        if not p:
            raise HTTPException(status_code=404, detail="project not found")
        if payload.name is not None:
            p.name = payload.name.strip() or p.name
        if payload.description is not None:
            p.description = payload.description
        session.add(p)
        session.commit()
        session.refresh(p)
        return p


class CreatePromptIn(BaseModel):
    id: str
    name: str
    template: str
    notes: str | None = None
    tags: list[str] | None = None
    project_id: str | None = None


class UpdatePromptIn(BaseModel):
    name: str | None = None
    template: str | None = None
    notes: str | None = None
    tags: list[str] | None = None
    project_id: str | None = None


@app.post("/v1/prompts", status_code=201)
def create_prompt(payload: CreatePromptIn) -> PromptTemplate:
    prompt_id = (payload.id or "").strip()
    if not prompt_id:
        raise HTTPException(status_code=400, detail="prompt id required")
    with Session(engine) as session:
        existing = session.get(PromptTemplate, prompt_id)
        if existing:
            raise HTTPException(status_code=409, detail="prompt already exists")
        rec = PromptTemplate(
            id=prompt_id,
            name=(payload.name or "").strip() or prompt_id,
            template=(payload.template or "").strip(),
            notes=payload.notes,
            tags_json=json.dumps(payload.tags or []),
            project_id=(payload.project_id or None),
            created_at=_now(),
            updated_at=_now(),
        )
        session.add(rec)
        session.commit()
        session.refresh(rec)
        return rec


@app.get("/v1/prompts")
def list_prompts(q: str | None = None, project_id: str | None = None, tag: str | None = None, limit: int = 100) -> list[PromptTemplate]:
    limit = max(1, min(int(limit), 500))
    with Session(engine) as session:
        stmt = select(PromptTemplate)
        if project_id:
            stmt = stmt.where(PromptTemplate.project_id == project_id)
        if q:
            q2 = f"%{q.strip()}%"
            stmt = stmt.where((PromptTemplate.name.ilike(q2)) | (PromptTemplate.template.ilike(q2)))
        stmt = stmt.order_by(PromptTemplate.updated_at.desc()).limit(limit)
        prompts = list(session.exec(stmt))
        if tag:
            t = tag.strip()
            filtered = []
            for p in prompts:
                try:
                    tags = set(json.loads(p.tags_json or "[]"))
                except Exception:
                    tags = set()
                if t in tags:
                    filtered.append(p)
            prompts = filtered
        return prompts


@app.get("/v1/prompts/{prompt_id}")
def get_prompt(prompt_id: str) -> PromptTemplate:
    with Session(engine) as session:
        p = session.get(PromptTemplate, prompt_id)
        if not p:
            raise HTTPException(status_code=404, detail="prompt not found")
        return p


@app.patch("/v1/prompts/{prompt_id}")
def update_prompt(prompt_id: str, payload: UpdatePromptIn) -> PromptTemplate:
    with Session(engine) as session:
        p = session.get(PromptTemplate, prompt_id)
        if not p:
            raise HTTPException(status_code=404, detail="prompt not found")
        if payload.name is not None:
            p.name = payload.name.strip() or p.name
        if payload.template is not None:
            p.template = payload.template
        if payload.notes is not None:
            p.notes = payload.notes
        if payload.project_id is not None:
            p.project_id = payload.project_id
        if payload.tags is not None:
            p.tags_json = json.dumps(payload.tags or [])
        p.updated_at = _now()
        session.add(p)
        session.commit()
        session.refresh(p)
        return p


@app.delete("/v1/prompts/{prompt_id}", status_code=204, response_class=Response)
def delete_prompt(prompt_id: str) -> Response:
    with Session(engine) as session:
        p = session.get(PromptTemplate, prompt_id)
        if not p:
            return Response(status_code=204)
        session.delete(p)
        session.commit()
        return Response(status_code=204)


class UpdateModelIn(BaseModel):
    display_name: str | None = None
    project_id: str | None = None
    tags: list[str] | None = None
    notes: str | None = None
    archived: bool | None = None


@app.get("/v1/models")
def list_models_v1(q: str | None = None, project_id: str | None = None, archived: bool = False, limit: int = 200) -> list[dict]:
    limit = max(1, min(int(limit), 500))
    with Session(engine) as session:
        stmt = select(Model)
        if project_id:
            stmt = stmt.where(Model.project_id == project_id)
        if not archived:
            stmt = stmt.where(Model.archived_at.is_(None))
        if q:
            q2 = f"%{q.strip()}%"
            stmt = stmt.where((Model.id.ilike(q2)) | (Model.display_name.ilike(q2)))
        stmt = stmt.order_by(Model.created_at.desc()).limit(limit)
        models = list(session.exec(stmt))

        out: list[dict] = []
        for m in models:
            raw_count = session.exec(select(func.count()).select_from(ModelImage).where(ModelImage.model_id == m.id)).one()
            # Depending on SQLAlchemy/SQLModel version, `.one()` may yield an int or a 1-tuple.
            ref_count = int(raw_count[0] if isinstance(raw_count, (tuple, list)) else raw_count)
            last_job = session.exec(
                select(GenerationJob).where(GenerationJob.model_id == m.id).order_by(GenerationJob.created_at.desc()).limit(1)
            ).first()
            out.append(
                {
                    "model": m,
                    "ref_count": ref_count,
                    "last_job": _job_public(last_job) if last_job else None,
                }
            )
        return out


@app.patch("/v1/models/{model_id}")
def update_model_v1(model_id: str, payload: UpdateModelIn) -> Model:
    with Session(engine) as session:
        m = session.get(Model, model_id)
        if not m:
            raise HTTPException(status_code=404, detail="model not found")
        if payload.display_name is not None:
            m.display_name = payload.display_name.strip() or m.display_name
        if payload.project_id is not None:
            m.project_id = payload.project_id or None
        if payload.tags is not None:
            m.tags_json = json.dumps(payload.tags or [])
        if payload.notes is not None:
            m.notes = payload.notes
        if payload.archived is not None:
            m.archived_at = _now() if payload.archived else None
        session.add(m)
        session.commit()
        session.refresh(m)
        return m


@app.delete("/v1/models/{model_id}/images/{image_id}", status_code=204, response_class=Response)
def delete_model_image(model_id: str, image_id: str) -> Response:
    with Session(engine) as session:
        img = session.get(ModelImage, image_id)
        if not img or img.model_id != model_id:
            return Response(status_code=204)
        # best-effort delete file
        try:
            p = STORAGE_DIR / img.rel_path
            p.unlink(missing_ok=True)
        except Exception:
            pass
        session.delete(img)
        session.commit()
        return Response(status_code=204)


@app.get("/v1/jobs")
def list_jobs(status: str | None = None, model_id: str | None = None, source: str | None = None, limit: int = 50, offset: int = 0) -> dict:
    limit = max(1, min(int(limit), 200))
    offset = max(0, int(offset))
    with Session(engine) as session:
        stmt = select(GenerationJob)
        if status:
            stmt = stmt.where(GenerationJob.status == status)
        if model_id:
            stmt = stmt.where(GenerationJob.model_id == model_id)
        if source:
            stmt = stmt.where(GenerationJob.source == source)
        stmt = stmt.order_by(GenerationJob.created_at.desc()).offset(offset).limit(limit)
        jobs = list(session.exec(stmt))
        # Sync a small page with celery state for freshness.
        out = []
        for j in jobs:
            j = _sync_job_from_celery(session, j)
            out.append(_job_public(j))
        return {"jobs": out, "limit": limit, "offset": offset}


@app.post("/v1/jobs/{job_id}/retry", status_code=202)
def retry_job(job_id: str) -> dict:
    with Session(engine) as session:
        old = session.get(GenerationJob, job_id)
        if not old:
            raise HTTPException(status_code=404, detail="job not found")
        model_id = old.model_id
        m = session.get(Model, model_id)
        if not m:
            raise HTTPException(status_code=404, detail="model not found")

        try:
            image_ids = json.loads(old.image_ids_json or "[]")
        except Exception:
            image_ids = []

        q = select(ModelImage).where(ModelImage.model_id == model_id).order_by(ModelImage.created_at.asc())
        all_images = list(session.exec(q))
        if image_ids:
            selected = [img for img in all_images if img.id in set(image_ids)]
        else:
            selected = all_images
        # Allow zero reference images (pure text-to-image).
        image_paths = [str(STORAGE_DIR / img.rel_path) for img in selected]
        canonical_ids = [img.id for img in selected]

        new_id = uuid.uuid4().hex
        job = GenerationJob(
            id=new_id,
            model_id=model_id,
            prompt=old.prompt,
            source=old.source or "api",
            prompt_template_id=old.prompt_template_id,
            params_json=old.params_json or "{}",
            image_ids_json=json.dumps(canonical_ids),
            status="queued",
            progress=0,
            message="queued",
            created_at=_now(),
            updated_at=_now(),
        )
        session.add(job)
        session.commit()
        session.refresh(job)

        task = celery_app.send_task(
            "worker.tasks.generate_consistent_image",
            args=[new_id, old.prompt, image_paths],
        )
        job.celery_task_id = task.id
        job.updated_at = _now()
        session.add(job)
        session.commit()
        session.refresh(job)

        return {"job": _job_public(job)}


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
            if len(raw) > int(settings.max_upload_bytes):
                raise HTTPException(
                    status_code=413,
                    detail=f"Image too large (>{int(settings.max_upload_bytes)} bytes): {f.filename}",
                )
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

                # Allow zero reference images (pure text-to-image).

                image_paths = [str(STORAGE_DIR / img.rel_path) for img in selected]

            task = celery_app.send_task(
                "worker.tasks.generate_consistent_image",
                args=[uuid.uuid4().hex, prompt, image_paths],
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
