"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { Model, PromptTemplate, Project } from "../../../lib/api";
import { getProject } from "../../../lib/api";

export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = decodeURIComponent(params.projectId);

  const [project, setProject] = useState<Project | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    try {
      const data = await getProject(projectId);
      setProject(data.project);
      setModels(data.models);
      setPrompts(data.prompts);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  return (
    <main className="pb-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="text-2xl font-semibold">Project</div>
          <div className="mt-1 text-sm text-neutral-400">
            <span className="font-mono text-neutral-500">{projectId}</span>
            {project?.name ? ` — ${project.name}` : ""}
          </div>
        </div>
        <Link href="/projects" className="text-sm text-neutral-300 hover:text-white">
          ← Back
        </Link>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-200">{error}</div>
      )}

      {project?.description && (
        <div className="mb-6 rounded-xl border border-neutral-800 bg-neutral-900 p-5 text-sm text-neutral-300">
          {project.description}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <div className="mb-3 text-sm font-semibold">Models</div>
          <div className="grid gap-3">
            {models.map((m) => (
              <Link
                key={m.id}
                href={`/models/${encodeURIComponent(m.id)}`}
                className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 hover:border-neutral-700"
              >
                <div className="text-sm font-semibold">{m.display_name}</div>
                <div className="mt-1 font-mono text-xs text-neutral-500">{m.id}</div>
              </Link>
            ))}
            {!models.length && <div className="text-sm text-neutral-500">No models in this project yet.</div>}
          </div>
        </section>

        <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <div className="mb-3 text-sm font-semibold">Prompts</div>
          <div className="grid gap-3">
            {prompts.map((p) => (
              <Link
                key={p.id}
                href={`/test?promptId=${encodeURIComponent(p.id)}`}
                className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 hover:border-neutral-700"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold">{p.name}</div>
                    <div className="mt-1 font-mono text-xs text-neutral-500">{p.id}</div>
                  </div>
                  <div className="text-xs text-neutral-500">Test →</div>
                </div>
                <div className="mt-2 line-clamp-2 text-xs text-neutral-400">{p.template}</div>
              </Link>
            ))}
            {!prompts.length && <div className="text-sm text-neutral-500">No prompts in this project yet.</div>}
          </div>
        </section>
      </div>
    </main>
  );
}


