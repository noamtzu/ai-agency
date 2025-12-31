"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ModelListItemV1, Project } from "../lib/api";
import { listModelsV1, listProjects } from "../lib/api";
import { ModelCard } from "./ModelCard";

export function ModelsLibraryPage() {
  const [items, setItems] = useState<ModelListItemV1[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [q, setQ] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  const [showArchived, setShowArchived] = useState(false);
  const [limit, setLimit] = useState(200);

  async function refresh() {
    setError(null);
    try {
      setLoading(true);
      const r = await listModelsV1({
        q: q.trim() || undefined,
        project_id: projectId || undefined,
        archived: showArchived,
        limit,
      });
      setItems(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // load projects once for the filter dropdown
    (async () => {
      try {
        setProjects(await listProjects());
      } catch {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => refresh(), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, projectId, showArchived, limit]);

  return (
    <main className="pb-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-2xl font-semibold">Model Library</div>
          <div className="mt-1 text-sm text-neutral-400">Browse models, filter, and jump into a single model.</div>
        </div>
        <Link
          href="/models/new"
          className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500"
        >
          Create model
        </Link>
      </div>

      <div className="mb-5 grid gap-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4 md:grid-cols-4">
        <label className="text-sm">
          <div className="mb-1 text-neutral-300">Search</div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by id or name…"
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
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || p.id}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-neutral-300 md:mt-6">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>
        <label className="text-sm">
          <div className="mb-1 text-neutral-300">Limit</div>
          <select
            value={String(limit)}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 outline-none focus:border-blue-600"
          >
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="200">200</option>
            <option value="500">500</option>
          </select>
        </label>
      </div>

      {error && <div className="mb-4 text-sm text-red-300">{error}</div>}

      <div className="mb-3 flex items-center justify-between text-xs text-neutral-500">
        <div>
          {loading ? "Loading…" : `${items.length} model${items.length === 1 ? "" : "s"}`}
          {q.trim() ? ` • q="${q.trim()}"` : ""}
          {projectId ? ` • project=${projectId}` : ""}
          {showArchived ? " • including archived" : ""}
        </div>
        <button
          type="button"
          onClick={refresh}
          className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 hover:border-neutral-700"
        >
          Refresh
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {items.map((it) => (
          <ModelCard
            key={it.model.id}
            model={it.model}
            meta={{ ref_count: it.ref_count, last_job_status: it.last_job?.status ?? null }}
          />
        ))}
        {!items.length && !loading && (
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5 text-sm text-neutral-400">
            No models match these filters.
          </div>
        )}
      </div>
    </main>
  );
}


