"use client";

/**
 * Global error boundary for the App Router.
 * Shown when a server component or async page throws an unhandled error.
 * Must be a Client Component (required by Next.js).
 */
import { useEffect } from "react";
import { SiteHeader } from "@/components/SiteHeader";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to console in development; swap for a real error reporter in production.
    console.error("Unhandled app error:", error);
  }, [error]);

  return (
    <>
      <SiteHeader minimal />
      <main id="main" className="container page">
        <section className="card stack" role="alert" aria-labelledby="err-title">
          <h1 id="err-title">Something went wrong</h1>
          <p className="lead">
            An unexpected error occurred. Your photo and session data have not been saved.
          </p>
          {error.digest && (
            <p className="muted" style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>
              Error reference: {error.digest}
            </p>
          )}
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={reset}>
              Try again
            </button>
            <a href="/" className="btn">
              Go to home page
            </a>
          </div>
        </section>
      </main>
    </>
  );
}
