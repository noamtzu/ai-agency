"use client";

import { useEffect, useState } from "react";
import { getRuntime } from "../lib/api";

type Mode =
  | { kind: "loading" }
  | { kind: "gpu"; label: string; detail?: string }
  | { kind: "cpu"; label: string; detail?: string }
  | { kind: "unknown"; label: string };

export function RuntimeModeBanner() {
  const [mode, setMode] = useState<Mode>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rt = await getRuntime();
        const gs = rt.gpu_server;

        if (cancelled) return;

        if (gs?.reachable) {
          setMode({
            kind: "gpu",
            label: "GPU mode: FLUX.2-dev connected",
            detail: gs.url ? `gpu_server=${gs.url}` : undefined
          });
        } else {
          setMode({
            kind: "cpu",
            label: "Local mode: mock generator (no GPU server)",
            detail: gs?.reason ? `reason=${gs.reason}` : undefined
          });
        }
      } catch {
        if (!cancelled) setMode({ kind: "unknown", label: "Mode: unknown (runtime check failed)" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const base =
    "mb-6 rounded-xl border px-4 py-3 text-sm flex flex-col gap-1 md:flex-row md:items-center md:justify-between";

  if (mode.kind === "loading") {
    return (
      <div className={`${base} border-neutral-800 bg-neutral-900 text-neutral-300`}>
        <div className="font-semibold">Checking runtime…</div>
        <div className="font-mono text-xs text-neutral-500">/v1/runtime</div>
      </div>
    );
  }

  if (mode.kind === "gpu") {
    return (
      <div className={`${base} border-emerald-900 bg-emerald-950/40 text-emerald-100`}>
        <div className="font-semibold">{mode.label}</div>
        {mode.detail && <div className="font-mono text-xs text-emerald-200/80">{mode.detail}</div>}
      </div>
    );
  }

  if (mode.kind === "cpu") {
    return (
      <div className={`${base} border-amber-900 bg-amber-950/40 text-amber-100`}>
        <div className="font-semibold">{mode.label}</div>
        {mode.detail && <div className="font-mono text-xs text-amber-200/80">{mode.detail}</div>}
      </div>
    );
  }

  return (
    <div className={`${base} border-neutral-800 bg-neutral-900 text-neutral-200`}>
      <div className="font-semibold">{mode.label}</div>
      <div className="font-mono text-xs text-neutral-500">/v1/runtime</div>
    </div>
  );
}


