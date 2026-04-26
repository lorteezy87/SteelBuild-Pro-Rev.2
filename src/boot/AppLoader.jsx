/**
 * AppLoader — full-screen loading spinner shown while the auth context is
 * resolving (initial session check, sign-in in flight, etc).
 *
 * Distinct from PageLoader: AppLoader covers the entire viewport and is
 * shown BEFORE the layout chrome renders, while PageLoader is inline and
 * only fills the page-content area while a lazy chunk loads.
 */
export default function AppLoader() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading application"
      style={{
        position: "fixed", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "var(--bg-page)",
      }}>
      <div aria-hidden="true" style={{
        width: 32, height: 32,
        border: "3px solid var(--border-default)",
        borderTop: "3px solid var(--accent)",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }} />
      <span style={{
        position: "absolute",
        width: 1, height: 1, padding: 0, margin: -1,
        overflow: "hidden", clip: "rect(0,0,0,0)",
        whiteSpace: "nowrap", border: 0,
      }}>Loading application…</span>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
