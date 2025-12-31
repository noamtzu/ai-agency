from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlmodel import SQLModel, Field


class Model(SQLModel, table=True):
    id: str = Field(primary_key=True, index=True)  # e.g. model_sarah
    display_name: str
    project_id: Optional[str] = Field(default=None, index=True)
    tags_json: str = Field(default="[]")
    notes: Optional[str] = Field(default=None)
    archived_at: Optional[datetime] = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ModelImage(SQLModel, table=True):
    id: str = Field(primary_key=True, index=True)
    model_id: str = Field(index=True)
    filename: str
    rel_path: str  # relative to STORAGE_DIR
    width: int
    height: int
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Project(SQLModel, table=True):
    id: str = Field(primary_key=True, index=True)  # slug
    name: str
    description: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class PromptTemplate(SQLModel, table=True):
    id: str = Field(primary_key=True, index=True)
    name: str
    template: str
    notes: Optional[str] = Field(default=None)
    tags_json: str = Field(default="[]")
    project_id: Optional[str] = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class GenerationJob(SQLModel, table=True):
    """
    Persisted generation job record.

    Status values (stringly typed for simplicity): queued | running | complete | error | cancelled
    """

    id: str = Field(primary_key=True, index=True)
    model_id: str = Field(index=True)

    prompt: str
    source: str = Field(default="api", index=True)  # studio | test | api
    prompt_template_id: Optional[str] = Field(default=None, index=True)
    params_json: str = Field(default="{}")
    image_ids_json: str = Field(default="[]")

    celery_task_id: Optional[str] = Field(default=None, index=True)

    status: str = Field(default="queued", index=True)
    progress: Optional[int] = Field(default=None)
    message: Optional[str] = Field(default=None)

    output_rel_url: Optional[str] = Field(default=None)
    error_code: Optional[str] = Field(default=None)
    error_message: Optional[str] = Field(default=None)

    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)
