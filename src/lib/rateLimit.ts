/**
 * Simple in-memory rate limiter keyed by IP address.
 *
 * Uses a sliding-window counter per IP. Not suitable for multi-process
 * deployments — replace with Redis if you run multiple instances.
 */

interface Entry {
  count: number;
  windowStart: number;
}

const globalForRateLimit = globalThis as unknown as {
  __triscriptRateLimit?: Map<string, Entry>;
};

const store: Map<string, Entry> =
  globalForRateLimit.__triscriptRateLimit ?? new Map();
globalForRateLimit.__triscriptRateLimit = store;

/**
 * Returns true if the request from `key` is within the allowed rate.
 *
 * @param key      IP address or any string identifying the caller
 * @param limit    maximum requests per window (default 20)
 * @param windowMs window size in milliseconds (default 60 000 = 1 minute)
 */
export function checkRateLimit(
  key: string,
  limit = 20,
  windowMs = 60_000,
): boolean {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now - entry.windowStart >= windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= limit) return false;

  entry.count += 1;
  return true;
}

/** Periodic cleanup — call occasionally to prevent unbounded memory growth. */
export function sweepRateLimit(windowMs = 60_000): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.windowStart >= windowMs * 2) store.delete(key);
  }
}
