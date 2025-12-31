"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Project } from "../../lib/api";
import { createProject, listProjects } from "../../lib/api";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  async function refresh() {
    setError(null);
    try {
      setProjects(await listProjects());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onCreate() {
    setBusy(true);
    setError(null);
    try {
      await createProject({ id: id.trim(), name: (name.trim() || id.trim()), description: description.trim() || null });
      setId("");
      setName("");
      setDescription("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="pb-10">
      <div className="mb-6">
        <div className="text-2xl font-semibold">Projects</div>
        <div className="mt-1 text-sm text-neutral-400">Group models and prompts by day-to-day workstreams.</div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-200">{error}</div>
      )}

      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <div className="mb-3 text-sm font-medium">Create project</div>
          <div className="grid gap-3">
            <label className="text-sm">
              <div className="mb-1 text-neutral-300">Project ID</div>
              <input
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="acme_q1"
                className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 outline-none focus:border-blue-600"
              />
            </label>
            <label className="text-sm">
              <div className="mb-1 text-neutral-300">Name</div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ACME Q1"
                className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 outline-none focus:border-blue-600"
              />
            </label>
            <label className="text-sm">
              <div className="mb-1 text-neutral-300">Description</div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="h-24 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-blue-600"
              />
            </label>
            <button
              type="button"
              onClick={onCreate}
              disabled={busy || !id.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-60"
            >
              Create
            </button>
          </div>
        </div>

        <div className="grid gap-3">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${encodeURIComponent(p.id)}`}
              className="rounded-xl border border-neutral-800 bg-neutral-900 p-5 hover:border-neutral-700"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold">{p.name}</div>
                  <div className="mt-1 font-mono text-xs text-neutral-500">{p.id}</div>
                </div>
                <div className="text-xs text-neutral-500">Open →</div>
              </div>
              {p.description && <div className="mt-3 text-sm text-neutral-400">{p.description}</div>}
            </Link>
          ))}
          {!projects.length && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5 text-sm text-neutral-400">No projects yet.</div>
          )}
        </div>
      </div>
    </main>
  );
}


