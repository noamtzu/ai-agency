"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ModelImage } from "../lib/api";
import { API_BASE, WS_BASE } from "../lib/env";

type WsMsg =
  | { status: "queued"; task_id: string }
  | { status: "processing"; state?: string; progress?: number; message?: string }
  | { status: "complete"; result: { output_url: string } }
  | { status: "error"; message: string };

export function InferenceStudio({ modelId, images }: { modelId: string; images: ModelImage[] }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("A photo of @image1 wearing a red silk dress, standing in a Parisian street, cinematic lighting.");
  const [consentConfirmed, setConsentConfirmed] = useState(false);

  const [status, setStatus] = useState<string>("idle");
  const [progress, setProgress] = useState<number | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(`${WS_BASE}/ws/generate`);
    wsRef.current = ws;

    ws.onopen = () => setStatus("connected");
    ws.onclose = () => setStatus("disconnected");

    ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data) as WsMsg;
      if (msg.status === "queued") {
        setError(null);
        setResultUrl(null);
        setProgress(0);
        setStatus(`queued (${msg.task_id.slice(0, 8)})`);
      } else if (msg.status === "processing") {
        setError(null);
        setProgress(msg.progress ?? null);
        setStatus(msg.message ? `processing: ${msg.message}` : `processing (${msg.state ?? ""})`);
      } else if (msg.status === "complete") {
        setError(null);
        setProgress(100);
        setStatus("complete");
        setResultUrl(`${API_BASE}${msg.result.output_url}`);
      } else if (msg.status === "error") {
        setStatus("error");
        setError(msg.message);
      }
    };

    return () => {
      try {
        ws.close();
      } catch {
        // ignore
      }
    };
  }, []);

  const selected = useMemo(() => {
    const map = new Map(images.map((i) => [i.id, i] as const));
    return selectedIds.map((id) => map.get(id)).filter(Boolean) as ModelImage[];
  }, [images, selectedIds]);

  const tagHelp = useMemo(() => {
    return selected.map((img, idx) => ({ img, tag: `@image${idx + 1}` }));
  }, [selected]);

  function toggle(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 10) return prev;
      return [...prev, id];
    });
  }

  function insertTag(tag: string) {
    setPrompt((p) => (p.includes(tag) ? p : `${p.trim()} ${tag}`.trim()));
  }

  function generate() {
    setError(null);
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setError("WebSocket not connected");
      return;
    }
    ws.send(
      JSON.stringify({
        model_id: modelId,
        prompt,
        image_ids: selectedIds,
        consent_confirmed: consentConfirmed
      })
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <aside className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Reference gallery</div>
            <div className="text-xs text-neutral-400">Select photos to map to @image1…</div>
          </div>
          <div className="text-xs text-neutral-500">{selectedIds.length}/10</div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {images.map((img) => {
            const active = selectedIds.includes(img.id);
            return (
              <button
                key={img.id}
                type="button"
                onClick={() => toggle(img.id)}
                className={`relative overflow-hidden rounded-lg border ${active ? "border-blue-500" : "border-neutral-800"}`}
              >
                <img
                  src={`${API_BASE}/storage/${img.rel_path}`}
                  alt={img.filename}
                  className="h-28 w-full object-cover"
                />
                {active && <div className="absolute left-1 top-1 rounded bg-blue-600 px-2 py-0.5 text-[10px]">selected</div>}
              </button>
            );
          })}
        </div>

        <div className="mt-4">
          <div className="mb-2 text-xs font-medium text-neutral-300">Tag mapping</div>
          <div className="space-y-1 text-xs text-neutral-400">
            {tagHelp.length ? (
              tagHelp.map(({ img, tag }) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => insertTag(tag)}
                  className="flex w-full items-center justify-between rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 hover:border-neutral-700"
                >
                  <span className="font-mono text-blue-300">{tag}</span>
                  <span className="truncate pl-2">{img.filename}</span>
                </button>
              ))
            ) : (
              <div className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-2">Select at least 1 reference.</div>
            )}
          </div>
        </div>
      </aside>

      <main className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <div className="text-sm font-semibold">Inference Studio</div>
        <div className="mt-1 text-xs text-neutral-400">Prompt supports tags like @image1 and hex colors (e.g. #E0115F).</div>

        <label className="mt-4 block text-xs font-medium text-neutral-300">Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="mt-2 h-36 w-full rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-sm outline-none focus:border-blue-600"
        />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-neutral-300">
            <input type="checkbox" checked={consentConfirmed} onChange={(e) => setConsentConfirmed(e.target.checked)} />
            I confirm I have permission/consent to use these reference images.
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={generate}
            disabled={!selectedIds.length}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-50"
          >
            Generate
          </button>
          <div className="text-xs text-neutral-400">WS: {status}{progress !== null ? ` • ${progress}%` : ""}</div>
        </div>

        {error && <div className="mt-4 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-200">{error}</div>}

        {resultUrl && (
          <div className="mt-6">
            <div className="mb-2 text-xs font-medium text-neutral-300">Result</div>
            <img src={resultUrl} alt="result" className="w-full rounded-xl border border-neutral-800" />
          </div>
        )}
      </main>
    </div>
  );
}
