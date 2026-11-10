"use client";

const API = "";

export type Tag = {
  id: number;
  name: string;
  colour: string;
  createdAt: string;
};

export type Correspondent = {
  id: number;
  name: string;
  createdAt: string;
};

export type DocumentType = {
  id: number;
  name: string;
  createdAt: string;
};

export type LetterSummary = {
  id: number;
  confirmed: boolean;
  formType: string;
  fields: Record<string, { value: string; confidence: number }>;
  createdAt: string;
  updatedAt?: string;
  correspondentId?: number;
  documentTypeId?: number;
  tags: Tag[];
  correspondent?: Correspondent;
  documentType?: DocumentType;
};

export type LetterPatch = {
  formType?: string;
  correspondentId?: number;
  documentTypeId?: number;
  tagIds?: number[];
  clearCorrespondent?: boolean;
  clearDocumentType?: boolean;
};

// ─── Tags ─────────────────────────────────────────────────────────────────────

export async function listTags(): Promise<Tag[]> {
  const res = await fetch(`${API}/api/tags`);
  if (!res.ok) throw new Error(`list tags: ${res.status}`);
  return res.json() as Promise<Tag[]>;
}

export async function createTag(name: string, colour: string): Promise<Tag> {
  const res = await fetch(`${API}/api/tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, colour }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<Tag>;
}

export async function updateTag(id: number, name: string, colour: string): Promise<Tag> {
  const res = await fetch(`${API}/api/tags/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, colour }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<Tag>;
}

export async function deleteTag(id: number): Promise<void> {
  const res = await fetch(`${API}/api/tags/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

// ─── Correspondents ───────────────────────────────────────────────────────────

export async function listCorrespondents(): Promise<Correspondent[]> {
  const res = await fetch(`${API}/api/correspondents`);
  if (!res.ok) throw new Error(`list correspondents: ${res.status}`);
  return res.json() as Promise<Correspondent[]>;
}

export async function suggestCorrespondents(q: string): Promise<Correspondent[]> {
  if (!q.trim()) return [];
  const res = await fetch(`${API}/api/correspondents?suggest=${encodeURIComponent(q)}`);
  if (!res.ok) return [];
  return res.json() as Promise<Correspondent[]>;
}

export async function createCorrespondent(name: string): Promise<Correspondent> {
  const res = await fetch(`${API}/api/correspondents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<Correspondent>;
}

export async function updateCorrespondent(id: number, name: string): Promise<Correspondent> {
  const res = await fetch(`${API}/api/correspondents/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<Correspondent>;
}

export async function deleteCorrespondent(id: number): Promise<void> {
  const res = await fetch(`${API}/api/correspondents/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

// ─── Document types ───────────────────────────────────────────────────────────

export async function listDocumentTypes(): Promise<DocumentType[]> {
  const res = await fetch(`${API}/api/document-types`);
  if (!res.ok) throw new Error(`list document types: ${res.status}`);
  return res.json() as Promise<DocumentType[]>;
}

export async function createDocumentType(name: string): Promise<DocumentType> {
  const res = await fetch(`${API}/api/document-types`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<DocumentType>;
}

export async function updateDocumentType(id: number, name: string): Promise<DocumentType> {
  const res = await fetch(`${API}/api/document-types/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<DocumentType>;
}

export async function deleteDocumentType(id: number): Promise<void> {
  const res = await fetch(`${API}/api/document-types/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

// ─── Letters ─────────────────────────────────────────────────────────────────

export async function listLetters(params?: {
  tag?: number[];
  correspondent?: number;
  documentType?: number;
  limit?: number;
}): Promise<LetterSummary[]> {
  const url = new URL("/api/letters", window.location.origin);
  if (params?.tag?.length) url.searchParams.set("tag", params.tag.join(","));
  if (params?.correspondent) url.searchParams.set("correspondent", String(params.correspondent));
  if (params?.documentType) url.searchParams.set("documentType", String(params.documentType));
  if (params?.limit) url.searchParams.set("limit", String(params.limit));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`list letters: ${res.status}`);
  return res.json() as Promise<LetterSummary[]>;
}

export async function patchLetter(id: number, patch: LetterPatch): Promise<LetterSummary> {
  const res = await fetch(`${API}/api/letters/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<LetterSummary>;
}
