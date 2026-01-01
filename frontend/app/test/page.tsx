"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { GenerationJob, Model, ModelImage, PromptTemplate } from "../../lib/api";
import { createGeneration, getModel, listModels, listPrompts } from "../../lib/api";
import { API_BASE } from "../../lib/env";

function parseTagsJson(tagsJson: string): string[] {
  try {
    const v = JSON.parse(tagsJson || "[]");
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export default function TestPage() {
  const sp = useSearchParams();
  const prePromptId = sp.get("promptId") || "";

  const [models, setModels] = useState<Model[]>([]);
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);

  const [modelId, setModelId] = useState<string>("");
  const [promptId, setPromptId] = useState<string>(prePromptId);
  const [images, setImages] = useState<ModelImage[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [prompt, setPrompt] = useState<string>("");
  const [femaleSubject, setFemaleSubject] = useState<boolean>(false);

  const [job, setJob] = useState<GenerationJob | null>(null);
  const [statusText, setStatusText] = useState<string>("idle");
  const [error, setError] = useState<string | null>(null);

  const esRef = useRef<EventSource | null>(null);

  async function bootstrap() {
    setError(null);
    try {
      const [ms, ps] = await Promise.all([listModels(), listPrompts({ limit: 200 })]);
      setModels(ms);
      setPrompts(ps);
      if (!modelId && ms.length) setModelId(ms[0].id);
      if (!prompt && ps.length && prePromptId) {
        const p = ps.find((x) => x.id === prePromptId);
        if (p) setPrompt(p.template);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      if (!modelId) return;
      setError(null);
      try {
        const data = await getModel(modelId);
        setImages(data.images);
        setSelectedIds([]); // explicit selection for tests
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [modelId]);

  useEffect(() => {
    const p = prompts.find((x) => x.id === promptId);
    if (p) setPrompt(p.template);
  }, [promptId, prompts]);

  const promptMeta = useMemo(() => prompts.find((x) => x.id === promptId) || null, [promptId, prompts]);
  const promptTags = useMemo(() => (promptMeta ? parseTagsJson(promptMeta.tags_json) : []), [promptMeta]);

  function toggle(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 10) return prev;
      return [...prev, id];
    });
  }

  function closeStream() {
    try {
      esRef.current?.close();
    } catch {
      // ignore
    }
    esRef.current = null;
  }

  async function run() {
    setError(null);
    closeStream();

    if (!modelId) {
      setError("Pick a model");
      return;
    }
    if (!prompt.trim()) {
      setError("Prompt is required");
      return;
    }

    try {
      setStatusText("creating job…");
      const finalPrompt = femaleSubject ? `female model, woman, ${prompt}` : prompt;
      const res = await createGeneration({
        model_id: modelId,
        prompt: finalPrompt,
        image_ids: selectedIds,
        consent_confirmed: true,
        source: "test",
        prompt_template_id: promptId || null,
        params: { subject: femaleSubject ? "female" : null }
      });
      const jobId = res.job_id;
      setStatusText(`streaming job ${jobId.slice(0, 8)}…`);

      const es = new EventSource(`${API_BASE}/v1/generations/${encodeURIComponent(jobId)}/events`);
      esRef.current = es;

      es.addEventListener("job", (evt) => {
        try {
          const payload = JSON.parse((evt as MessageEvent).data) as { type: string; job: GenerationJob };
          setJob(payload.job);
          setStatusText(`${payload.job.status}${payload.job.progress != null ? ` • ${payload.job.progress}%` : ""}`);
          if (payload.job.status === "complete" || payload.job.status === "error" || payload.job.status === "cancelled") {
            closeStream();
          }
        } catch {
          // ignore
        }
      });

      es.addEventListener("error", () => {
        setStatusText("stream error");
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatusText("error");
    }
  }

  useEffect(() => {
    return () => closeStream();
  }, []);

  const outputUrl = job?.output_url ? `${API_BASE}${job.output_url}` : null;

  return (
    <main className="pb-10">
      <div className="mb-6">
        <div className="text-2xl font-semibold">Test (Prompt Runner)</div>
        <div className="mt-1 text-sm text-neutral-400">Quickly run prompts against a model and inspect results.</div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-200">{error}</div>
      )}

      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <aside className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <div className="mb-3 text-sm font-semibold">Inputs</div>

          <label className="block text-sm">
            <div className="mb-1 text-neutral-300">Model</div>
            <select
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 outline-none focus:border-blue-600"
            >
              <option value="">Select…</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name} ({m.id})
                </option>
              ))}
            </select>
          </label>

          <label className="mt-3 block text-sm">
            <div className="mb-1 text-neutral-300">Prompt template (optional)</div>
            <select
              value={promptId}
              onChange={(e) => setPromptId(e.target.value)}
              className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 outline-none focus:border-blue-600"
            >
              <option value="">(none)</option>
              {prompts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.id})
                </option>
              ))}
            </select>
          </label>

          {!!promptTags.length && (
            <div className="mt-3 flex flex-wrap gap-2">
              {promptTags.map((t) => (
                <span key={t} className="rounded-full border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-300">
                  {t}
                </span>
              ))}
            </div>
          )}

          <label className="mt-3 block text-sm">
            <div className="mb-1 text-neutral-300">Prompt</div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="h-44 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-blue-600"
            />
          </label>

          <label className="mt-3 flex select-none items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={femaleSubject}
              onChange={(e) => setFemaleSubject(e.target.checked)}
              className="mt-1"
            />
            <div>
              <div className="text-neutral-200">Female subject (optional)</div>
              <div className="text-xs text-neutral-500">When enabled, we prefix your prompt with “female model, woman,”.</div>
            </div>
          </label>

          <div className="mt-4">
            <div className="mb-2 text-xs font-medium text-neutral-300">References (optional)</div>
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
                    <img src={`${API_BASE}/storage/${img.rel_path}`} alt={img.filename} className="h-20 w-full object-cover" />
                    {active && <div className="absolute left-1 top-1 rounded bg-blue-600 px-2 py-0.5 text-[10px]">selected</div>}
                  </button>
                );
              })}
              {!images.length && <div className="text-xs text-neutral-500">No references for this model.</div>}
            </div>
            <div className="mt-2 text-xs text-neutral-500">{selectedIds.length}/10 selected</div>
          </div>

          <button
            type="button"
            onClick={run}
            className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500"
          >
            Run
          </button>

          <div className="mt-3 text-xs text-neutral-500">Status: {statusText}</div>
          {job?.id && <div className="mt-1 font-mono text-xs text-neutral-600">Job: {job.id}</div>}
        </aside>

        <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <div className="mb-3 text-sm font-semibold">Output</div>
          {job?.error_message && (
            <div className="mb-4 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-200">
              {job.error_message}
            </div>
          )}
          {outputUrl ? (
            <img src={outputUrl} alt="output" className="w-full rounded-xl border border-neutral-800" />
          ) : (
            <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-10 text-center text-sm text-neutral-500">
              No output yet. Run a test to generate.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}


