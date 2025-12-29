"use client";

import { useState } from "react";
import { uploadModelImages } from "../lib/api";

export function ModelImagesUploader({ modelId, onUploaded }: { modelId: string; onUploaded: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files ? Array.from(e.target.files).slice(0, 10) : [];
    if (!files.length) return;

    setBusy(true);
    setError(null);
    try {
      await uploadModelImages(modelId, files);
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">Reference photos</div>
          <div className="text-xs text-neutral-400">Uploads are EXIF-stripped and resized to 1024×1024 server-side.</div>
        </div>
        <label className="inline-flex cursor-pointer items-center rounded-lg bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700">
          <input type="file" multiple className="hidden" accept="image/*" onChange={onChange} disabled={busy} />
          {busy ? "Uploading…" : "Upload (max 10)"}
        </label>
      </div>

      {error && <div className="mt-3 text-sm text-red-300">{error}</div>}
    </div>
  );
}
