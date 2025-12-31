"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { PromptTemplate } from "../../lib/api";
import { createPrompt, deletePrompt, listPrompts, listProjects, updatePrompt } from "../../lib/api";

function parseTags(s: string): string[] {
  return s
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export default function PromptsPage() {
  const [q, setQ] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newTemplate, setNewTemplate] = useState("");
  const [newTags, setNewTags] = useState("");

  const [editId, setEditId] = useState<string | null>(null);
  const editing = useMemo(() => prompts.find((p) => p.id === editId) || null, [editId, prompts]);

  async function refresh() {
    setError(null);
    try {
      const [ps, prjs] = await Promise.all([
        listPrompts({ q: q || undefined, project_id: projectId || undefined, limit: 200 }),
        listProjects()
      ]);
      setPrompts(ps);
      setProjects(prjs.map((p) => ({ id: p.id, name: p.name })));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, projectId]);

  async function onCreate() {
    setBusy(true);
    setError(null);
    try {
      await createPrompt({
        id: newId.trim(),
        name: (newName.trim() || newId.trim()),
        template: newTemplate,
        tags: parseTags(newTags),
        project_id: projectId || null
      });
      setNewId("");
      setNewName("");
      setNewTemplate("");
      setNewTags("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onSave(p: PromptTemplate, tagsText: string) {
    setBusy(true);
    setError(null);
    try {
      await updatePrompt(p.id, {
        name: p.name,
        template: p.template,
        notes: p.notes ?? null,
        tags: parseTags(tagsText),
        project_id: p.project_id ?? null
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this prompt template?")) return;
    setBusy(true);
    setError(null);
    try {
      await deletePrompt(id);
      setEditId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="pb-10">
      <div className="mb-6">
        <div className="text-2xl font-semibold">Prompt Library</div>
        <div className="mt-1 text-sm text-neutral-400">Reusable prompt templates you can send to Test.</div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-200">{error}</div>
      )}

      <div className="mb-6 grid gap-4 lg:grid-cols-[420px_1fr]">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <div className="mb-3 text-sm font-medium">Create prompt</div>
          <div className="grid gap-3">
            <label className="text-sm">
              <div className="mb-1 text-neutral-300">Prompt ID</div>
              <input
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                placeholder="prompt_headshot_v1"
                className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 outline-none focus:border-blue-600"
              />
            </label>
            <label className="text-sm">
              <div className="mb-1 text-neutral-300">Name</div>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Headshot (v1)"
                className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 outline-none focus:border-blue-600"
              />
            </label>
            <label className="text-sm">
              <div className="mb-1 text-neutral-300">Template</div>
              <textarea
                value={newTemplate}
                onChange={(e) => setNewTemplate(e.target.value)}
                placeholder="A studio portrait of @image1, 85mm lens, soft lighting..."
                className="h-32 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-blue-600"
              />
            </label>
            <label className="text-sm">
              <div className="mb-1 text-neutral-300">Tags (comma-separated)</div>
              <input
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                placeholder="headshot,studio"
                className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 outline-none focus:border-blue-600"
              />
            </label>
            <button
              type="button"
              onClick={onCreate}
              disabled={busy || !newId.trim() || !newTemplate.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-60"
            >
              Create
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search prompts…"
              className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-blue-600 md:w-72"
            />
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-blue-600"
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.id})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={refresh}
              className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm hover:border-neutral-600"
            >
              Refresh
            </button>
          </div>

          <div className="grid gap-3">
            {prompts.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setEditId(p.id)}
                className={`rounded-xl border p-4 text-left ${
                  editId === p.id ? "border-blue-600 bg-blue-600/10" : "border-neutral-800 bg-neutral-950 hover:border-neutral-700"
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-neutral-100">{p.name}</div>
                    <div className="mt-0.5 font-mono text-xs text-neutral-500">{p.id}</div>
                  </div>
                  <Link
                    href={`/test?promptId=${encodeURIComponent(p.id)}`}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs hover:border-neutral-600"
                  >
                    Send to Test
                  </Link>
                </div>
                <div className="mt-3 line-clamp-2 text-xs text-neutral-400">{p.template}</div>
              </button>
            ))}
            {!prompts.length && <div className="text-sm text-neutral-500">No prompts yet.</div>}
          </div>
        </div>
      </div>

      {editing && (
        <EditorCard
          key={editing.id}
          prompt={editing}
          projects={projects}
          busy={busy}
          onSave={onSave}
          onDelete={onDelete}
        />
      )}
    </main>
  );
}

function EditorCard({
  prompt,
  projects,
  busy,
  onSave,
  onDelete
}: {
  prompt: PromptTemplate;
  projects: { id: string; name: string }[];
  busy: boolean;
  onSave: (p: PromptTemplate, tagsText: string) => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState<PromptTemplate>(prompt);
  const [tagsText, setTagsText] = useState(() => {
    try {
      return (JSON.parse(prompt.tags_json || "[]") as string[]).join(", ");
    } catch {
      return "";
    }
  });

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold">Edit prompt</div>
          <div className="mt-1 font-mono text-xs text-neutral-500">{prompt.id}</div>
        </div>
        <button
          type="button"
          onClick={() => onDelete(prompt.id)}
          disabled={busy}
          className="rounded-lg border border-red-900 bg-red-950/30 px-3 py-2 text-xs text-red-200 hover:bg-red-950/50 disabled:opacity-60"
        >
          Delete
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm">
          <div className="mb-1 text-neutral-300">Name</div>
          <input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 outline-none focus:border-blue-600"
          />
        </label>
        <label className="text-sm">
          <div className="mb-1 text-neutral-300">Project</div>
          <select
            value={draft.project_id || ""}
            onChange={(e) => setDraft((d) => ({ ...d, project_id: e.target.value || null }))}
            className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 outline-none focus:border-blue-600"
          >
            <option value="">(none)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.id})
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="mt-3 block text-sm">
        <div className="mb-1 text-neutral-300">Template</div>
        <textarea
          value={draft.template}
          onChange={(e) => setDraft((d) => ({ ...d, template: e.target.value }))}
          className="h-40 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-blue-600"
        />
      </label>

      <label className="mt-3 block text-sm">
        <div className="mb-1 text-neutral-300">Notes</div>
        <textarea
          value={draft.notes ?? ""}
          onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
          className="h-24 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-blue-600"
        />
      </label>

      <label className="mt-3 block text-sm">
        <div className="mb-1 text-neutral-300">Tags (comma-separated)</div>
        <input
          value={tagsText}
          onChange={(e) => setTagsText(e.target.value)}
          className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 outline-none focus:border-blue-600"
        />
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => onSave(draft, tagsText)}
          disabled={busy || !draft.template.trim()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-60"
        >
          Save
        </button>
        <Link
          href={`/test?promptId=${encodeURIComponent(prompt.id)}`}
          className="rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2 text-sm hover:border-neutral-600"
        >
          Open in Test
        </Link>
      </div>
    </div>
  );
}


