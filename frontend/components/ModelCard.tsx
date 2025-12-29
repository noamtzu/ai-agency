import Link from "next/link";
import type { Model } from "../lib/api";

export function ModelCard({ model }: { model: Model }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
      <div className="text-sm font-semibold">{model.display_name}</div>
      <div className="mt-1 font-mono text-xs text-neutral-400">{model.id}</div>
      <div className="mt-4 flex items-center gap-3">
        <Link
          href={`/studio/${encodeURIComponent(model.id)}`}
          className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold hover:bg-blue-500"
        >
          Open Studio
        </Link>
      </div>
    </div>
  );
}
