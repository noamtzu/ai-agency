"use client";

import { API_BASE } from "../lib/env";
import type { ModelImage } from "../lib/api";

export function ReferenceGrid({ images }: { images: ModelImage[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {images.map((img) => (
        <div key={img.id} className="rounded-xl border border-neutral-800 bg-neutral-900 p-2">
          <img
            src={`${API_BASE}/storage/${img.rel_path}`}
            alt={img.filename}
            className="h-32 w-full rounded-lg object-cover"
          />
          <div className="mt-2 truncate text-xs text-neutral-400">{img.filename}</div>
        </div>
      ))}
    </div>
  );
}
