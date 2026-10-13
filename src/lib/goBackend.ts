/**
 * Go backend client helper for TRISCRIPT.
 * Proxies session and photo requests to the authoritative Go backend.
 */

export function getGoApiUrl(): string {
  const url = process.env.GO_API_URL || "http://localhost:8080";
  return url.replace(/\/$/, "");
}

export class BackendUnavailableError extends Error {
  constructor(message = "TRISCRIPT Go backend service is unavailable") {
    super(message);
    this.name = "BackendUnavailableError";
  }
}
