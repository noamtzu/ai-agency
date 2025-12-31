from __future__ import annotations

import os


def init_otel(service_name: str) -> None:
    """
    Lightweight, code-driven OpenTelemetry setup (no `opentelemetry-instrument` needed).
    Safe to call even if OTEL_EXPORTER_OTLP_ENDPOINT isn't set.
    """

    endpoint = (os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT") or "").strip()
    if not endpoint:
        return

    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.instrumentation.requests import RequestsInstrumentor
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
    except Exception:
        return

    resource = Resource.create({"service.name": service_name})
    provider = TracerProvider(resource=resource)
    processor = BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint))
    provider.add_span_processor(processor)
    trace.set_tracer_provider(provider)

    # Instrument outgoing HTTP and FastAPI (FastAPI instrumentation hooks into the global app later).
    RequestsInstrumentor().instrument()
    # Note: app instrumentation must be done by calling FastAPIInstrumentor().instrument_app(app)
    # in main.py after app creation.


