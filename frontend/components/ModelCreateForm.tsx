"use client";

import { useState } from "react";
import type { Model } from "../lib/api";
import { createModel } from "../lib/api";

export function ModelCreateForm({
  onCreated,
  onCreatedModel,
}: {
  onCreated?: () => void;
  onCreatedModel?: (model: Model) => void;
}) {
  const [id, setId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await createModel({ id: id.trim(), display_name: (displayName.trim() || id.trim()) });
      setId("");
      setDisplayName("");
      onCreatedModel?.(created);
      onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
      <div className="mb-3 text-sm font-medium">Create model</div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm">
          <div className="mb-1 text-neutral-300">Model ID</div>
          <input
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="model_sarah"
            className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 outline-none focus:border-blue-600"
            required
          />
        </label>
        <label className="text-sm">
          <div className="mb-1 text-neutral-300">Display name</div>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Sarah"
            className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 outline-none focus:border-blue-600"
          />
        </label>
      </div>

      {error && <div className="mt-3 text-sm text-red-300">{error}</div>}

      <button
        type="submit"
        disabled={busy}
        className="mt-4 inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-60"
      >
        {busy ? "Creating…" : "Create"}
      </button>
    </form>
  );
}
