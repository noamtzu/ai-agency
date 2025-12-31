import Link from "next/link";
import type { Model } from "../lib/api";

export function ModelCard({
  model,
  meta,
}: {
  model: Model;
  meta?: {
    ref_count?: number;
    last_job_status?: string | null;
  };
}) {
  return (
    <Link
      href={`/models/${encodeURIComponent(model.id)}`}
      className="block rounded-xl border border-neutral-800 bg-neutral-900 p-5 hover:border-neutral-700"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{model.display_name}</div>
          <div className="mt-1 truncate font-mono text-xs text-neutral-400">{model.id}</div>
        </div>
        <div className="shrink-0 text-xs text-neutral-500">Open →</div>
      </div>

      {(meta?.ref_count != null || meta?.last_job_status) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
          {meta?.ref_count != null && (
            <span className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1">{meta.ref_count} refs</span>
          )}
          {meta?.last_job_status ? (
            <span className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1">last job: {meta.last_job_status}</span>
          ) : (
            <span className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1">no jobs yet</span>
          )}
        </div>
      )}
    </Link>
  );
}
