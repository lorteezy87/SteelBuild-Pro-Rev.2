/**
 * PageLoader — small Suspense fallback shown while a lazy page chunk loads.
 *
 * Used as the `fallback` prop on every `<Suspense>` that wraps a lazy page in
 * AppRoutes. Stays inline-styled (no external CSS) so it can render before
 * the app's stylesheet has loaded.
 */
export default function PageLoader() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading page"
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        minHeight: 200, width: "100%",
      }}>
      <div aria-hidden="true" style={{
        width: 24, height: 24,
        border: "2px solid var(--border-default)",
        borderTop: "2px solid var(--accent)",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
      }} />
      <span className="sr-only">Loading page…</span>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
