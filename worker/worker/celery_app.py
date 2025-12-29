from __future__ import annotations

import os

from celery import Celery


def _redis_url() -> str:
    return os.environ.get("REDIS_URL", "redis://redis:6379/0")


celery_app = Celery(
    "worker",
    broker=_redis_url(),
    backend=_redis_url(),
)

celery_app.conf.update(
    task_track_started=True,
    task_send_sent_event=True,
)

celery_app.autodiscover_tasks(["worker"])
