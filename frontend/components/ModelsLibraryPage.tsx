"use client";

import { useEffect, useState } from "react";
import type { Model } from "../lib/api";
import { listModels } from "../lib/api";
import { ModelCreateForm } from "./ModelCreateForm";
import { ModelCard } from "./ModelCard";

export function ModelsLibraryPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    try {
      setModels(await listModels());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <main className="pb-10">
      <div className="mb-6">
        <div className="text-2xl font-semibold">Model Library</div>
        <div className="mt-1 text-sm text-neutral-400">Manage your model IDs and reference photos.</div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <div>
          <ModelCreateForm onCreated={refresh} />
          {error && <div className="mt-4 text-sm text-red-300">{error}</div>}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {models.map((m) => (
            <ModelCard key={m.id} model={m} />
          ))}
          {!models.length && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5 text-sm text-neutral-400">
              No models yet. Create one to get started.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}


