from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: str = "dev"  # dev | prod
    admin_api_key: str = ""
    # Comma-separated list of allowed hosts (TrustedHostMiddleware). Only enforced when env == "prod".
    allowed_hosts: str = "localhost,127.0.0.1"
    max_upload_bytes: int = 8_388_608  # 8 MiB per image

    redis_url: str = "redis://redis:6379/0"
    database_url: str = "sqlite:///./storage/app.db"
    storage_dir: str = "./storage"
    # Comma-separated list of allowed origins (set "*" to allow all).
    # Dev-friendly default allows any origin (no cookies/credentials are enabled when using "*").
    # For production, set `CORS_ORIGINS` explicitly (e.g. "https://app.yourdomain.com").
    cors_origins: str = "*"


settings = Settings()
