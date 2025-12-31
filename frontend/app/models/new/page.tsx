"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ModelCreateForm } from "../../../components/ModelCreateForm";

export default function NewModelPage() {
  const router = useRouter();

  return (
    <main className="pb-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="text-2xl font-semibold">Create model</div>
          <div className="mt-1 text-sm text-neutral-400">Create a model, then you’ll be taken to its detail page.</div>
        </div>
        <Link href="/" className="text-sm text-neutral-300 hover:text-white">
          ← Back
        </Link>
      </div>

      <div className="max-w-xl">
        <ModelCreateForm
          onCreatedModel={(m) => {
            router.push(`/models/${encodeURIComponent(m.id)}?tab=references`);
          }}
        />
      </div>
    </main>
  );
}


