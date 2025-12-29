"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { ModelImage } from "../../../lib/api";
import { getModel } from "../../../lib/api";
import { ModelImagesUploader } from "../../../components/ModelImagesUploader";
import { ReferenceGrid } from "../../../components/ReferenceGrid";
import { InferenceStudio } from "../../../components/InferenceStudio";

export default function StudioPage() {
  const params = useParams<{ modelId: string }>();
  const modelId = decodeURIComponent(params.modelId);

  const [images, setImages] = useState<ModelImage[]>([]);
  const [displayName, setDisplayName] = useState<string>(modelId);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    try {
      const data = await getModel(modelId);
      setDisplayName(data.model.display_name);
      setImages(data.images);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    refresh();
  }, [modelId]);

  return (
    <main className="pb-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="text-2xl font-semibold">Inference Studio</div>
          <div className="mt-1 text-sm text-neutral-400">
            {displayName} <span className="font-mono text-neutral-500">({modelId})</span>
          </div>
        </div>
        <Link href="/models" className="text-sm text-neutral-300 hover:text-white">
          ← Back
        </Link>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="space-y-6">
        <ModelImagesUploader modelId={modelId} onUploaded={refresh} />

        {!!images.length && (
          <div>
            <div className="mb-3 text-sm font-medium">Library</div>
            <ReferenceGrid images={images} />
          </div>
        )}

        <InferenceStudio modelId={modelId} images={images} />
      </div>
    </main>
  );
}
