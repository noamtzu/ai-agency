from __future__ import annotations

from celery import Celery

from .settings import settings

celery_app = Celery(
    "ai_agency",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

# The worker lives in a separate service/package, but for local dev we just call by name.
celery_app.conf.update(
    task_track_started=True,
)
