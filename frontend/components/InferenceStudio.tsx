"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GenerationJob, ModelImage } from "../lib/api";
import { API_BASE } from "../lib/env";
import { cancelGeneration, createGeneration, listGenerations } from "../lib/api";

export function InferenceStudio({ modelId, images }: { modelId: string; images: ModelImage[] }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("A photo of @image1 wearing a red silk dress, standing in a Parisian street, cinematic lighting.");

  const [status, setStatus] = useState<string>("idle");
  const [progress, setProgress] = useState<number | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [recentJobs, setRecentJobs] = useState<GenerationJob[]>([]);
  const [toast, setToast] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const sseRef = useRef<EventSource | null>(null);

  useEffect(() => {
    async function loadRecent() {
      try {
        const r = await listGenerations(modelId, 10);
        setRecentJobs(r.jobs);
      } catch {
        // ignore
      }
    }
    loadRecent();

    return () => {
      try {
        sseRef.current?.close();
      } catch {
        // ignore
      }
    };
  }, [modelId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

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

  function attachToJobEvents(newJobId: string) {
    try {
      sseRef.current?.close();
    } catch {
      // ignore
    }

    const es = new EventSource(`${API_BASE}/v1/generations/${encodeURIComponent(newJobId)}/events`);
    sseRef.current = es;
    setStatus(`subscribed (${newJobId.slice(0, 8)})`);

    es.addEventListener("job", (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data) as { type: "job"; job: GenerationJob };
        const j = data.job;
        setProgress(j.progress ?? null);
        setStatus(j.message ? `${j.status}: ${j.message}` : j.status);
        if (j.status === "complete" && j.output_url) {
          setResultUrl(`${API_BASE}${j.output_url}`);
        }
        if (j.status === "error") {
          setError(j.error_message || "Generation failed");
        }
        if (j.status === "cancelled") {
          setError("Cancelled");
        }
        if (j.status === "complete" || j.status === "error" || j.status === "cancelled") {
          try {
            sseRef.current?.close();
          } catch {
            // ignore
          }
          sseRef.current = null;
          try {
            listGenerations(modelId, 10).then((rec) => setRecentJobs(rec.jobs));
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
    });

    es.addEventListener("error", () => {
      setStatus("disconnected");
    });
  }

  async function generate() {
    setError(null);
    setResultUrl(null);
    setProgress(0);
    setToast(null);

    if (!prompt.trim()) {
      setError("Prompt is required.");
      return;
    }
    if (!selectedIds.length) {
      setError("Select at least 1 reference.");
      return;
    }

    try {
      setStatus("creating job…");
      const r = await createGeneration({
        model_id: modelId,
        prompt,
        image_ids: selectedIds,
        consent_confirmed: true,
        source: "studio"
      });
      setJobId(r.job_id);
      setStatus(`queued (${r.job_id.slice(0, 8)})`);
      attachToJobEvents(r.job_id);
      setToast({ kind: "success", text: "Generation started" });

      try {
        const rec = await listGenerations(modelId, 10);
        setRecentJobs(rec.jobs);
      } catch {
        // ignore
      }
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
      setToast({ kind: "error", text: "Failed to start generation" });
    }
  }

  async function cancel() {
    if (!jobId) return;
    try {
      await cancelGeneration(jobId);
      setStatus("cancelled");
      setError("Cancelled");
      setToast({ kind: "success", text: "Cancelled" });
      try {
        sseRef.current?.close();
      } catch {
        // ignore
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setToast({ kind: "error", text: "Cancel failed" });
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      {toast && (
        <div
          className={`fixed right-4 top-4 z-50 rounded-lg border px-4 py-2 text-sm shadow-lg ${
            toast.kind === "success"
              ? "border-emerald-900 bg-emerald-950/80 text-emerald-200"
              : "border-red-900 bg-red-950/80 text-red-200"
          }`}
        >
          {toast.text}
        </div>
      )}
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

        {!!recentJobs.length && (
          <div className="mt-4">
            <div className="mb-2 text-xs font-medium text-neutral-300">Recent jobs</div>
            <div className="space-y-1 text-xs text-neutral-400">
              {recentJobs.slice(0, 5).map((j) => (
                <button
                  key={j.id}
                  type="button"
                  onClick={() => {
                    setJobId(j.id);
                    setError(null);
                    setResultUrl(j.output_url ? `${API_BASE}${j.output_url}` : null);
                    setProgress(j.progress ?? null);
                    setStatus(j.status);
                    attachToJobEvents(j.id);
                  }}
                  className="flex w-full items-center justify-between rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 hover:border-neutral-700"
                >
                  <span className="font-mono text-neutral-300">{j.id.slice(0, 8)}</span>
                  <span className="pl-2 text-neutral-500">{j.status}</span>
                </button>
              ))}
            </div>
          </div>
        )}

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
          <button
            type="button"
            onClick={generate}
            disabled={!selectedIds.length}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-50"
          >
            Generate
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={!jobId}
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm font-semibold hover:bg-neutral-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <div className="text-xs text-neutral-400">
            Job: {status}
            {progress !== null ? ` • ${progress}%` : ""}
          </div>
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
