from __future__ import annotations

import os
from dataclasses import dataclass

import httpx


@dataclass(frozen=True)
class LlmResult:
    text: str
    provider: str
    model: str


def _provider() -> str:
    return (os.environ.get("LLM_PROVIDER") or "mock").strip().lower()


def _ollama_base_url() -> str:
    return (os.environ.get("OLLAMA_BASE_URL") or "http://localhost:11434").strip().rstrip("/")


def _ollama_model() -> str:
    return (os.environ.get("OLLAMA_MODEL") or "llama3.1").strip()


async def complete(prompt: str) -> LlmResult:
    prompt = (prompt or "").strip()
    if not prompt:
        raise ValueError("prompt required")

    provider = _provider()
    if provider == "mock":
        model = "mock"
        return LlmResult(
            text=f"[mock-llm] You said:\n\n{prompt}",
            provider=provider,
            model=model,
        )

    if provider == "ollama":
        base = _ollama_base_url()
        model = _ollama_model()
        url = f"{base}/api/generate"
        payload = {
            "model": model,
            "prompt": prompt,
            "stream": False,
        }
        timeout_s = float((os.environ.get("LLM_TIMEOUT_S") or "120").strip() or "120")
        async with httpx.AsyncClient(timeout=timeout_s) as client:
            r = await client.post(url, json=payload)
        if r.status_code != 200:
            raise RuntimeError(f"Ollama error {r.status_code}: {(r.text or '')[:2000]}")
        data = r.json()
        # Ollama returns {"response": "...", ...}
        return LlmResult(
            text=str(data.get("response") or ""),
            provider=provider,
            model=model,
        )

    raise RuntimeError(f"Unsupported LLM_PROVIDER={provider!r} (supported: mock, ollama)")


