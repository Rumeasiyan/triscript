/**
 * Shown by Next.js during route-level Suspense transitions.
 * Keeps the header visible and shows a polite spinner in the main area.
 */
export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading…"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "30vh",
        gap: "0.75rem",
        padding: "2rem 1rem",
      }}
    >
      <span
        className="spinner"
        aria-hidden="true"
        style={{ width: "2rem", height: "2rem", borderWidth: "4px" }}
      />
      <span className="muted" style={{ fontSize: "1rem" }}>
        Loading…
      </span>
    </div>
  );
}
