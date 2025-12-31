"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { GenerationJob, Model, ModelImage, Project } from "../../../lib/api";
import { deleteModelImageV1, getModel, listGenerations, listProjects, updateModelV1 } from "../../../lib/api";
import { InferenceStudio } from "../../../components/InferenceStudio";
import { ModelImagesUploader } from "../../../components/ModelImagesUploader";
import { API_BASE } from "../../../lib/env";

type Tab = "overview" | "references" | "studio" | "generations" | "settings";

function tabLabel(t: Tab) {
  if (t === "overview") return "Overview";
  if (t === "references") return "References";
  if (t === "studio") return "Studio";
  if (t === "generations") return "Generations";
  return "Settings";
}

function parseTagsJson(tagsJson: string | undefined): string[] {
  try {
    const x = JSON.parse(tagsJson || "[]");
    return Array.isArray(x) ? x.map(String) : [];
  } catch {
    return [];
  }
}

export default function ModelDetailPage() {
  const params = useParams<{ modelId: string }>();
  const modelId = decodeURIComponent(params.modelId);
  const sp = useSearchParams();
  const tab = ((): Tab => {
    const raw = (sp.get("tab") || "overview").toLowerCase();
    if (raw === "references") return "references";
    if (raw === "studio") return "studio";
    if (raw === "generations") return "generations";
    if (raw === "settings") return "settings";
    return "overview";
  })();

  const [model, setModel] = useState<Model | null>(null);
  const [images, setImages] = useState<ModelImage[]>([]);
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setError(null);
    try {
      const [m, js, ps] = await Promise.all([getModel(modelId), listGenerations(modelId, 50), listProjects()]);
      setModel(m.model);
      setImages(m.images);
      setJobs(js.jobs);
      setProjects(ps);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId]);

  const tags = useMemo(() => parseTagsJson(model?.tags_json), [model?.tags_json]);

  return (
    <main className="pb-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="text-2xl font-semibold">Model</div>
          <div className="mt-1 text-sm text-neutral-400">
            {model?.display_name || modelId} <span className="font-mono text-neutral-500">({modelId})</span>
          </div>
        </div>
        <Link href="/" className="text-sm text-neutral-300 hover:text-white">
          ← Back
        </Link>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-200">{error}</div>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {(["overview", "references", "studio", "generations", "settings"] as Tab[]).map((t) => (
          <Link
            key={t}
            href={`/models/${encodeURIComponent(modelId)}?tab=${encodeURIComponent(t)}`}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              tab === t ? "border-blue-600 bg-blue-600/20" : "border-neutral-800 bg-neutral-900 hover:border-neutral-700"
            }`}
          >
            {tabLabel(t)}
          </Link>
        ))}
        <button
          type="button"
          onClick={refresh}
          className="ml-auto rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm hover:border-neutral-600"
        >
          Refresh
        </button>
      </div>

      {tab === "overview" && (
        <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-sm font-semibold">Summary</div>
              <div className="mt-2 text-sm text-neutral-300">
                <div>
                  <span className="text-neutral-500">References:</span> {images.length}
                </div>
                <div className="mt-1">
                  <span className="text-neutral-500">Recent jobs:</span> {jobs.length}
                </div>
                <div className="mt-1">
                  <span className="text-neutral-500">Project:</span> {model?.project_id || "—"}
                </div>
              </div>
              {tags.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {tags.map((t) => (
                    <span key={t} className="rounded-full border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-300">
                      {t}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="mt-3 text-xs text-neutral-500">No tags yet.</div>
              )}
              {model?.notes && (
                <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-300">
                  {model.notes}
                </div>
              )}
            </div>

            <div>
              <div className="text-sm font-semibold">Last output</div>
              <div className="mt-2 text-xs text-neutral-500">Most recent completed generation.</div>
              <LastOutput jobs={jobs} />
            </div>
          </div>
        </section>
      )}

      {tab === "references" && (
        <section className="space-y-6">
          <ModelImagesUploader modelId={modelId} onUploaded={refresh} />
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
            <div className="mb-3 text-sm font-semibold">Reference library</div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {images.map((img) => (
                <div key={img.id} className="rounded-xl border border-neutral-800 bg-neutral-950 p-2">
                  <img src={`${API_BASE}/storage/${img.rel_path}`} alt={img.filename} className="h-32 w-full rounded-lg object-cover" />
                  <div className="mt-2 truncate text-xs text-neutral-400">{img.filename}</div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      if (!confirm("Delete this reference image?")) return;
                      setBusy(true);
                      setError(null);
                      try {
                        await deleteModelImageV1(modelId, img.id);
                        await refresh();
                      } catch (err) {
                        setError(err instanceof Error ? err.message : String(err));
                      } finally {
                        setBusy(false);
                      }
                    }}
                    className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs hover:border-neutral-700 disabled:opacity-60"
                  >
                    Delete
                  </button>
                </div>
              ))}
              {!images.length && <div className="text-sm text-neutral-500">No references yet. Upload 5–10 photos.</div>}
            </div>
          </div>
        </section>
      )}

      {tab === "studio" && <InferenceStudio modelId={modelId} images={images} />}

      {tab === "generations" && (
        <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <div className="mb-3 text-sm font-semibold">Generations</div>
          <div className="grid gap-3">
            {jobs.map((j) => (
              <div key={j.id} className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-mono text-xs text-neutral-500">{j.id}</div>
                    <div className="mt-1 text-sm text-neutral-200">
                      {j.status} {j.progress != null ? `• ${j.progress}%` : ""} {j.message ? `• ${j.message}` : ""}
                    </div>
                  </div>
                  {j.output_url && (
                    <a
                      href={`${API_BASE}${j.output_url}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs hover:border-neutral-600"
                    >
                      View output
                    </a>
                  )}
                </div>
                {j.error_message && <div className="mt-2 text-xs text-red-200">{j.error_message}</div>}
              </div>
            ))}
            {!jobs.length && <div className="text-sm text-neutral-500">No generations yet.</div>}
          </div>
        </section>
      )}

      {tab === "settings" && (
        <SettingsCard
          modelId={modelId}
          model={model}
          projects={projects}
          busy={busy}
          setBusy={setBusy}
          setError={setError}
          onSaved={refresh}
        />
      )}
    </main>
  );
}

function LastOutput({ jobs }: { jobs: GenerationJob[] }) {
  const last = jobs.find((j) => j.status === "complete" && j.output_url);
  if (!last?.output_url) {
    return <div className="mt-3 text-sm text-neutral-500">No completed outputs yet.</div>;
  }
  return (
    <div className="mt-3">
      <img src={`${API_BASE}${last.output_url}`} alt="last output" className="w-full rounded-xl border border-neutral-800" />
    </div>
  );
}

function SettingsCard({
  modelId,
  model,
  projects,
  busy,
  setBusy,
  setError,
  onSaved
}: {
  modelId: string;
  model: Model | null;
  projects: Project[];
  busy: boolean;
  setBusy: (b: boolean) => void;
  setError: (s: string | null) => void;
  onSaved: () => void;
}) {
  const [displayName, setDisplayName] = useState(model?.display_name || modelId);
  const [projectId, setProjectId] = useState(model?.project_id || "");
  const [tagsText, setTagsText] = useState(() => parseTagsJson(model?.tags_json).join(", "));
  const [notes, setNotes] = useState(model?.notes || "");
  const [archived, setArchived] = useState(Boolean(model?.archived_at));

  useEffect(() => {
    setDisplayName(model?.display_name || modelId);
    setProjectId(model?.project_id || "");
    setTagsText(parseTagsJson(model?.tags_json).join(", "));
    setNotes(model?.notes || "");
    setArchived(Boolean(model?.archived_at));
  }, [model?.archived_at, model?.display_name, model?.notes, model?.project_id, model?.tags_json, modelId]);

  async function onSave() {
    setBusy(true);
    setError(null);
    try {
      const tags = tagsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      await updateModelV1(modelId, {
        display_name: displayName,
        project_id: projectId || null,
        tags,
        notes: notes || null,
        archived
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
      <div className="mb-3 text-sm font-semibold">Settings</div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm">
          <div className="mb-1 text-neutral-300">Display name</div>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 outline-none focus:border-blue-600"
          />
        </label>
        <label className="text-sm">
          <div className="mb-1 text-neutral-300">Project</div>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 outline-none focus:border-blue-600"
          >
            <option value="">(none)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.id})
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="mt-3 block text-sm">
        <div className="mb-1 text-neutral-300">Tags (comma-separated)</div>
        <input
          value={tagsText}
          onChange={(e) => setTagsText(e.target.value)}
          className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 outline-none focus:border-blue-600"
        />
      </label>

      <label className="mt-3 block text-sm">
        <div className="mb-1 text-neutral-300">Notes</div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="h-28 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-blue-600"
        />
      </label>

      <label className="mt-3 flex items-center gap-2 text-sm text-neutral-300">
        <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
        Archived
      </label>

      <div className="mt-4">
        <button
          type="button"
          onClick={onSave}
          disabled={busy}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-60"
        >
          Save settings
        </button>
      </div>
    </section>
  );
}


