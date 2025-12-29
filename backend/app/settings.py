from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    redis_url: str = "redis://redis:6379/0"
    database_url: str = "sqlite:///./storage/app.db"
    storage_dir: str = "./storage"
    cors_origins: str = "http://localhost:3000"


settings = Settings()
