import { API_BASE } from "./env";

export type Model = {
  id: string;
  display_name: string;
  created_at: string;
  project_id?: string | null;
  tags_json?: string;
  notes?: string | null;
  archived_at?: string | null;
};
export type ModelImage = {
  id: string;
  model_id: string;
  filename: string;
  rel_path: string;
  width: number;
  height: number;
  created_at: string;
};

export type GenerationJob = {
  id: string;
  model_id: string;
  source?: string | null;
  prompt_template_id?: string | null;
  status: string;
  progress: number | null;
  message: string | null;
  prompt?: string;
  image_ids_json?: string;
  output_url: string | null;
  error_code?: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type Project = { id: string; name: string; description?: string | null; created_at: string };

export type ModelListItemV1 = {
  model: Model;
  ref_count: number;
  last_job: {
    id: string;
    model_id: string;
    status: string;
    progress: number | null;
    message: string | null;
    output_url: string | null;
    error_message: string | null;
    created_at: string;
    updated_at: string;
  } | null;
};

export type PromptTemplate = {
  id: string;
  name: string;
  template: string;
  notes?: string | null;
  tags_json: string;
  project_id?: string | null;
  created_at: string;
  updated_at: string;
};

type ApiErrorEnvelope = {
  error: {
    code: string;
    message: string;
    request_id?: string | null;
    details?: unknown;
  };
};

async function readError(r: Response): Promise<string> {
  const ct = r.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try {
      const j = (await r.json()) as Partial<ApiErrorEnvelope>;
      if (j?.error?.message) {
        const rid = j.error.request_id ? ` (request_id=${j.error.request_id})` : "";
        return `${j.error.message}${rid}`;
      }
    } catch {
      // fall through
    }
  }
  return await r.text();
}

export async function listModels(): Promise<Model[]> {
  const r = await fetch(`${API_BASE}/models`, { cache: "no-store" });
  if (!r.ok) throw new Error(await readError(r));
  return r.json();
}

export async function listModelsV1(input?: {
  q?: string;
  project_id?: string;
  archived?: boolean;
  limit?: number;
}): Promise<ModelListItemV1[]> {
  const params = new URLSearchParams();
  if (input?.q) params.set("q", input.q);
  if (input?.project_id) params.set("project_id", input.project_id);
  if (input?.archived != null) params.set("archived", String(input.archived));
  if (input?.limit != null) params.set("limit", String(input.limit));
  const qs = params.toString();
  const r = await fetch(`${API_BASE}/v1/models${qs ? `?${qs}` : ""}`, { cache: "no-store" });
  if (!r.ok) throw new Error(await readError(r));
  return r.json();
}

export async function createModel(input: { id: string; display_name: string }): Promise<Model> {
  const fd = new FormData();
  fd.set("id", input.id);
  fd.set("display_name", input.display_name);

  const r = await fetch(`${API_BASE}/models`, { method: "POST", body: fd });
  if (!r.ok) throw new Error(await readError(r));
  return r.json();
}

export async function getModel(modelId: string): Promise<{ model: Model; images: ModelImage[] }> {
  const r = await fetch(`${API_BASE}/models/${encodeURIComponent(modelId)}`, { cache: "no-store" });
  if (!r.ok) throw new Error(await readError(r));
  return r.json();
}

export async function uploadModelImages(modelId: string, files: File[]): Promise<void> {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);

  const r = await fetch(`${API_BASE}/models/${encodeURIComponent(modelId)}/images`, {
    method: "POST",
    body: fd
  });
  if (!r.ok) throw new Error(await readError(r));
}

export async function createGeneration(input: {
  model_id?: string;
  prompt: string;
  image_ids?: string[];
  consent_confirmed: boolean;
  source?: string;
  prompt_template_id?: string | null;
  params?: unknown;
}): Promise<{ job_id: string; task_id?: string }> {
  const r = await fetch(`${API_BASE}/v1/generations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!r.ok) throw new Error(await readError(r));
  return r.json();
}

export async function createLlmCompletion(prompt: string): Promise<{ text: string }> {
  const r = await fetch(`${API_BASE}/v1/llm`, {
    method: "POST",
    headers: { "content-type": "text/plain; charset=utf-8" },
    body: prompt
  });
  if (!r.ok) throw new Error(await readError(r));
  return r.json();
}

export async function getRuntime(): Promise<{
  ok: boolean;
  gpu_server: { url: string; reachable: boolean; reason: string };
}> {
  const r = await fetch(`${API_BASE}/v1/runtime`, { cache: "no-store" });
  if (!r.ok) throw new Error(await readError(r));
  return r.json();
}

export async function getGeneration(jobId: string): Promise<{ job: GenerationJob }> {
  const r = await fetch(`${API_BASE}/v1/generations/${encodeURIComponent(jobId)}`, { cache: "no-store" });
  if (!r.ok) throw new Error(await readError(r));
  return r.json();
}

export async function listGenerations(modelId: string, limit = 20): Promise<{ jobs: GenerationJob[] }> {
  const r = await fetch(
    `${API_BASE}/v1/models/${encodeURIComponent(modelId)}/generations?limit=${encodeURIComponent(String(limit))}`,
    { cache: "no-store" }
  );
  if (!r.ok) throw new Error(await readError(r));
  return r.json();
}

export async function cancelGeneration(jobId: string): Promise<{ job: GenerationJob }> {
  const r = await fetch(`${API_BASE}/v1/generations/${encodeURIComponent(jobId)}/cancel`, { method: "POST" });
  if (!r.ok) throw new Error(await readError(r));
  return r.json();
}

export async function listJobs(input?: {
  status?: string;
  model_id?: string;
  source?: string;
  limit?: number;
  offset?: number;
}): Promise<{ jobs: GenerationJob[]; limit: number; offset: number }> {
  const params = new URLSearchParams();
  if (input?.status) params.set("status", input.status);
  if (input?.model_id) params.set("model_id", input.model_id);
  if (input?.source) params.set("source", input.source);
  if (input?.limit != null) params.set("limit", String(input.limit));
  if (input?.offset != null) params.set("offset", String(input.offset));
  const r = await fetch(`${API_BASE}/v1/jobs?${params.toString()}`, { cache: "no-store" });
  if (!r.ok) throw new Error(await readError(r));
  return r.json();
}

export async function retryJob(jobId: string): Promise<{ job: GenerationJob }> {
  const r = await fetch(`${API_BASE}/v1/jobs/${encodeURIComponent(jobId)}/retry`, { method: "POST" });
  if (!r.ok) throw new Error(await readError(r));
  return r.json();
}

export async function listProjects(): Promise<Project[]> {
  const r = await fetch(`${API_BASE}/v1/projects`, { cache: "no-store" });
  if (!r.ok) throw new Error(await readError(r));
  return r.json();
}

export async function createProject(input: { id: string; name: string; description?: string | null }): Promise<Project> {
  const r = await fetch(`${API_BASE}/v1/projects`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!r.ok) throw new Error(await readError(r));
  return r.json();
}

export async function getProject(projectId: string): Promise<{ project: Project; models: Model[]; prompts: PromptTemplate[] }> {
  const r = await fetch(`${API_BASE}/v1/projects/${encodeURIComponent(projectId)}`, { cache: "no-store" });
  if (!r.ok) throw new Error(await readError(r));
  return r.json();
}

export async function updateProject(projectId: string, input: { name?: string; description?: string | null }): Promise<Project> {
  const r = await fetch(`${API_BASE}/v1/projects/${encodeURIComponent(projectId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!r.ok) throw new Error(await readError(r));
  return r.json();
}

export async function listPrompts(input?: { q?: string; project_id?: string; tag?: string; limit?: number }): Promise<PromptTemplate[]> {
  const params = new URLSearchParams();
  if (input?.q) params.set("q", input.q);
  if (input?.project_id) params.set("project_id", input.project_id);
  if (input?.tag) params.set("tag", input.tag);
  if (input?.limit != null) params.set("limit", String(input.limit));
  const r = await fetch(`${API_BASE}/v1/prompts?${params.toString()}`, { cache: "no-store" });
  if (!r.ok) throw new Error(await readError(r));
  return r.json();
}

export async function createPrompt(input: {
  id: string;
  name: string;
  template: string;
  notes?: string | null;
  tags?: string[];
  project_id?: string | null;
}): Promise<PromptTemplate> {
  const r = await fetch(`${API_BASE}/v1/prompts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!r.ok) throw new Error(await readError(r));
  return r.json();
}

export async function updatePrompt(
  promptId: string,
  input: { name?: string; template?: string; notes?: string | null; tags?: string[]; project_id?: string | null }
): Promise<PromptTemplate> {
  const r = await fetch(`${API_BASE}/v1/prompts/${encodeURIComponent(promptId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!r.ok) throw new Error(await readError(r));
  return r.json();
}

export async function deletePrompt(promptId: string): Promise<void> {
  const r = await fetch(`${API_BASE}/v1/prompts/${encodeURIComponent(promptId)}`, { method: "DELETE" });
  if (!r.ok && r.status !== 204) throw new Error(await readError(r));
}

export async function updateModelV1(modelId: string, input: {
  display_name?: string;
  project_id?: string | null;
  tags?: string[];
  notes?: string | null;
  archived?: boolean;
}): Promise<any> {
  const r = await fetch(`${API_BASE}/v1/models/${encodeURIComponent(modelId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!r.ok) throw new Error(await readError(r));
  return r.json();
}

export async function deleteModelImageV1(modelId: string, imageId: string): Promise<void> {
  const r = await fetch(`${API_BASE}/v1/models/${encodeURIComponent(modelId)}/images/${encodeURIComponent(imageId)}`, {
    method: "DELETE"
  });
  if (!r.ok && r.status !== 204) throw new Error(await readError(r));
}
