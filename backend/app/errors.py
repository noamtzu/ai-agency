from __future__ import annotations

from typing import Any, Optional


def error_envelope(*, code: str, message: str, request_id: Optional[str], details: Any = None) -> dict:
    payload: dict = {"error": {"code": code, "message": message, "request_id": request_id}}
    if details is not None:
        payload["error"]["details"] = details
    return payload


