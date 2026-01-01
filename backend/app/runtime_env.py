from __future__ import annotations

import os
from dataclasses import dataclass

import httpx


def _truthy(v: str | None) -> bool:
    s = (v or "").strip().lower()
    return s in {"1", "true", "yes", "y", "on"}


def _auto_gpu_server_enabled() -> bool:
    raw = os.environ.get("AUTO_GPU_SERVER")
    if raw is None:
        return True
    return _truthy(raw)


def _gpu_server_url_override() -> str:
    return (os.environ.get("GPU_SERVER_URL") or "").strip().rstrip("/")


def _gpu_server_candidates() -> list[str]:
    raw = (os.environ.get("GPU_SERVER_CANDIDATES") or "").strip()
    if not raw:
        raw = "http://gpu_server:8080,http://127.0.0.1:8080"
    out: list[str] = []
    for part in raw.split(","):
        u = part.strip().rstrip("/")
        if u:
            out.append(u)
    # de-dup (preserve order)
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
class GpuServerStatus:
    url: str
    reachable: bool
    reason: str


async def resolve_gpu_server_status() -> GpuServerStatus:
    override = _gpu_server_url_override()
    headers = _gpu_server_headers()

    async def _healthcheck(base_url: str) -> bool:
        async with httpx.AsyncClient(timeout=httpx.Timeout(connect=2.0, read=2.0, write=2.0, pool=2.0)) as client:
            r = await client.get(f"{base_url}/health", headers=headers)
        return r.status_code == 200

    if override:
        try:
            ok = await _healthcheck(override)
        except Exception:
            ok = False
        return GpuServerStatus(url=override, reachable=ok, reason="explicit_gpu_server_url")

    if not _auto_gpu_server_enabled():
        return GpuServerStatus(url="", reachable=False, reason="auto_gpu_server_disabled")

    for candidate in _gpu_server_candidates():
        try:
            ok = await _healthcheck(candidate)
        except Exception:
            ok = False
        if ok:
            return GpuServerStatus(url=candidate, reachable=True, reason="auto_discovered")

    return GpuServerStatus(url="", reachable=False, reason="no_healthy_candidates")


