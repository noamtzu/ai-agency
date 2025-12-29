import { API_BASE } from "./env";

export type Model = { id: string; display_name: string; created_at: string };
export type ModelImage = {
  id: string;
  model_id: string;
  filename: string;
  rel_path: string;
  width: number;
  height: number;
  created_at: string;
};

export async function listModels(): Promise<Model[]> {
  const r = await fetch(`${API_BASE}/models`, { cache: "no-store" });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function createModel(input: { id: string; display_name: string }): Promise<Model> {
  const fd = new FormData();
  fd.set("id", input.id);
  fd.set("display_name", input.display_name);

  const r = await fetch(`${API_BASE}/models`, { method: "POST", body: fd });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getModel(modelId: string): Promise<{ model: Model; images: ModelImage[] }> {
  const r = await fetch(`${API_BASE}/models/${encodeURIComponent(modelId)}`, { cache: "no-store" });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function uploadModelImages(modelId: string, files: File[]): Promise<void> {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);

  const r = await fetch(`${API_BASE}/models/${encodeURIComponent(modelId)}/images`, {
    method: "POST",
    body: fd
  });
  if (!r.ok) throw new Error(await r.text());
}
