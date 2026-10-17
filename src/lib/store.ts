// In-memory pairing sessions for the demo server.
//
// Sessions live only in this process's memory, expire after SESSION_TTL_SECONDS,
// and are deleted (photos included) when the person saves or leaves. Nothing is
// written to disk. For a multi-instance deployment, replace this module with a
// shared store (for example Redis with a TTL) that keeps the same interface.

import { randomUUID } from "node:crypto";

export interface StoredPhoto {
  data: Buffer;
  contentType: string;
  page: number; // 1-based
}

export interface StoredSession {
  id: string;
  expiresAt: number;
  photos: StoredPhoto[];
}

const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
const MAX_PAGES = 5;

const globalForStore = globalThis as unknown as {
  __triscriptSessions?: Map<string, StoredSession>;
};
const sessions: Map<string, StoredSession> =
  globalForStore.__triscriptSessions ?? new Map();
globalForStore.__triscriptSessions = sessions;

function ttlMs(): number {
  const seconds = Number(process.env.SESSION_TTL_SECONDS ?? 300);
  return (Number.isFinite(seconds) && seconds > 0 ? seconds : 300) * 1000;
}

function sweep(): void {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (s.expiresAt <= now) sessions.delete(id);
  }
}

export function createSession(): StoredSession {
  sweep();
  const session: StoredSession = {
    id: randomUUID(),
    expiresAt: Date.now() + ttlMs(),
    photos: [],
  };
  sessions.set(session.id, session);
  return session;
}

export function getSession(id: string): StoredSession | undefined {
  sweep();
  return sessions.get(id);
}

export type PhotoResult =
  | "ok"
  | "gone"
  | "too-many-pages"
  | "too-large"
  | "bad-type";

export function addPhoto(
  id: string,
  data: Buffer,
  contentType: string,
): PhotoResult {
  const session = getSession(id);
  if (!session) return "gone";
  if (session.photos.length >= MAX_PAGES) return "too-many-pages";
  if (!/^image\/(jpeg|png|webp)$/.test(contentType)) return "bad-type";
  if (data.byteLength === 0 || data.byteLength > MAX_PHOTO_BYTES) return "too-large";
  const page = session.photos.length + 1;
  session.photos.push({ data, contentType, page });
  return "ok";
}

/** @deprecated Use addPhoto */
export function setPhoto(
  id: string,
  data: Buffer,
  contentType: string,
): "ok" | "gone" | "has-photo" | "too-large" | "bad-type" {
  const session = getSession(id);
  if (!session) return "gone";
  if (session.photos.length > 0) return "has-photo";
  const result = addPhoto(id, data, contentType);
  if (result === "ok" || result === "gone" || result === "too-large" || result === "bad-type") {
    return result as "ok" | "gone" | "too-large" | "bad-type";
  }
  return "has-photo";
}

export function deleteSession(id: string): void {
  const s = sessions.get(id);
  if (s) s.photos = [];
  sessions.delete(id);
}
