/** Presentational first-project empty state for Dashboard. */
export function FirstProjectWelcome({ onStart }) {
  return (
    <div className="sb-dashboard-reference-page" style={{ display: "grid", placeItems: "center", minHeight: "62vh" }}>
      <div style={{ maxWidth: 480, textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--accent)", fontWeight: 800, marginBottom: 14 }}>
          Welcome to SteelBuild Pro
        </div>
        <h1 style={{ fontFamily: "'Space Grotesk', var(--font-display)", fontSize: 26, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 10px" }}>
          Set up your first project
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 14, lineHeight: 1.6, margin: "0 0 24px" }}>
          Create a project to start tracking drawings, submittals, RFIs, fabrication, and field progress. Start from a template or import a starter spreadsheet - it takes about a minute.
        </p>
        <button type="button" className="sbd-btn sbd-btn-primary" onClick={onStart} style={{ minHeight: 44, padding: "0 22px", fontSize: 14, justifyContent: "center" }}>
          Set up your first project
        </button>
      </div>
    </div>
  );
}
