from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlmodel import SQLModel, Field


class Model(SQLModel, table=True):
    id: str = Field(primary_key=True, index=True)  # e.g. model_sarah
    display_name: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ModelImage(SQLModel, table=True):
    id: str = Field(primary_key=True, index=True)
    model_id: str = Field(index=True)
    filename: str
    rel_path: str  # relative to STORAGE_DIR
    width: int
    height: int
    created_at: datetime = Field(default_factory=datetime.utcnow)
