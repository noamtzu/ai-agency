from __future__ import annotations

import os
from dataclasses import dataclass

import requests


def _truthy(v: str | None) -> bool:
    s = (v or "").strip().lower()
    return s in {"1", "true", "yes", "y", "on"}


def _auto_gpu_server_enabled() -> bool:
    # Default ON: if a GPU server exists (e.g. on a GPU VM), we want to discover it automatically.
    raw = os.environ.get("AUTO_GPU_SERVER")
    if raw is None:
        return True
    return _truthy(raw)


def _gpu_server_url_override() -> str:
    return (os.environ.get("GPU_SERVER_URL") or "").strip().rstrip("/")


def _gpu_server_candidates() -> list[str]:
    raw = (os.environ.get("GPU_SERVER_CANDIDATES") or "").strip()
    if not raw:
        # Default candidates:
        # - Docker Compose internal DNS name
        # - Host-local GPU server (useful if gpu_server runs on the host)
        raw = "http://gpu_server:8080,http://127.0.0.1:8080"
    out: list[str] = []
    for part in raw.split(","):
        u = part.strip().rstrip("/")
        if u:
            out.append(u)
    # De-dup while preserving order
    seen = set()
    deduped: list[str] = []
    for u in out:
        if u in seen:
            continue
        seen.add(u)
        deduped.append(u)
    return deduped


def _gpu_server_headers() -> dict[str, str]:
    api_key = (os.environ.get("GPU_SERVER_API_KEY") or "").strip()
    if not api_key:
        return {}
    return {"Authorization": f"Bearer {api_key}"}


@dataclass(frozen=True)
class GpuServerResolution:
    url: str  # empty means "no GPU server"
    reason: str


def _healthcheck(url: str, headers: dict[str, str]) -> tuple[bool, str | None]:
    try:
        r = requests.get(f"{url}/health", headers=headers, timeout=(2, 2))
        if r.status_code != 200:
            return False, f"health {r.status_code}: {(r.text or '')[:2000]}"
        return True, None
    except Exception as e:
        return False, str(e)


def resolve_gpu_server_url() -> GpuServerResolution:
    """
    Resolve which GPU server URL to use.

    Priority:
      1) GPU_SERVER_URL (explicit override)
      2) AUTO_GPU_SERVER + GPU_SERVER_CANDIDATES probing via /health
      3) none (empty)
    """
    override = _gpu_server_url_override()
    if override:
        return GpuServerResolution(url=override, reason="explicit_gpu_server_url")

    if not _auto_gpu_server_enabled():
        return GpuServerResolution(url="", reason="auto_gpu_server_disabled")

    headers = _gpu_server_headers()
    for candidate in _gpu_server_candidates():
        ok, _ = _healthcheck(candidate, headers=headers)
        if ok:
            return GpuServerResolution(url=candidate, reason="auto_discovered")

    return GpuServerResolution(url="", reason="no_healthy_candidates")


