"use client";

import { useEffect, useState } from "react";
import type { GenerationJob } from "../../lib/api";
import { cancelGeneration, listJobs, retryJob } from "../../lib/api";
import { API_BASE } from "../../lib/env";

const STATUSES = ["queued", "running", "complete", "error", "cancelled"] as const;

export default function JobsPage() {
  const [status, setStatus] = useState<string>("");
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setError(null);
    try {
      const data = await listJobs({ status: status || undefined, limit: 50, offset: 0 });
      setJobs(data.jobs);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function onCancel(id: string) {
    setBusy(true);
    setError(null);
    try {
      await cancelGeneration(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onRetry(id: string) {
    setBusy(true);
    setError(null);
    try {
      await retryJob(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="pb-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="text-2xl font-semibold">Jobs / Queue</div>
          <div className="mt-1 text-sm text-neutral-400">Operational view across all models.</div>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm hover:border-neutral-600"
        >
          Refresh
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => setStatus("")}
          className={`rounded-lg border px-3 py-1.5 ${
            status === "" ? "border-blue-600 bg-blue-600/20" : "border-neutral-800 bg-neutral-900 hover:border-neutral-700"
          }`}
        >
          All
        </button>
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={`rounded-lg border px-3 py-1.5 ${
              status === s ? "border-blue-600 bg-blue-600/20" : "border-neutral-800 bg-neutral-900 hover:border-neutral-700"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-200">{error}</div>
      )}

      <div className="overflow-hidden rounded-xl border border-neutral-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-900 text-neutral-300">
            <tr>
              <th className="px-4 py-3">Job</th>
              <th className="px-4 py-3">Model</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Output</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-neutral-950">
            {jobs.map((j) => {
              const canCancel = j.status === "queued" || j.status === "running";
              const canRetry = j.status === "error" || j.status === "cancelled";
              const out = j.output_url ? `${API_BASE}${j.output_url}` : null;
              return (
                <tr key={j.id} className="border-t border-neutral-900">
                  <td className="px-4 py-3 font-mono text-xs text-neutral-400">{j.id.slice(0, 10)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-neutral-300">{j.model_id}</td>
                  <td className="px-4 py-3">
                    <div className="text-neutral-200">{j.status}</div>
                    <div className="text-xs text-neutral-500">
                      {j.progress != null ? `${j.progress}%` : ""} {j.message || ""}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {out ? (
                      <a href={out} target="_blank" className="text-blue-300 hover:text-blue-200" rel="noreferrer">
                        View
                      </a>
                    ) : (
                      <span className="text-xs text-neutral-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy || !canCancel}
                        onClick={() => onCancel(j.id)}
                        className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs hover:border-neutral-600 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={busy || !canRetry}
                        onClick={() => onRetry(j.id)}
                        className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs hover:border-neutral-600 disabled:opacity-50"
                      >
                        Retry
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!jobs.length && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-neutral-500">
                  No jobs found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}


