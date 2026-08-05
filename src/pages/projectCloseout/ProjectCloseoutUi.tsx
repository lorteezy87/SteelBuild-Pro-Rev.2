/** Presentational lessons learned panel for Project Closeout. */
export function ProjectCloseoutLessons({ closeout }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "16px" }}>
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "12px", padding: "16px" }}>
        <h3 style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 12px 0" }}>✓ Successes</h3>
        <p style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>{closeout.project_successes || "No successes documented"}</p>
      </div>

      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "12px", padding: "16px" }}>
        <h3 style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, color: "var(--status-warning)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 12px 0" }}>⚠ Challenges</h3>
        <p style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>{closeout.challenges_faced || "No challenges documented"}</p>
      </div>

      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "12px", padding: "16px" }}>
        <h3 style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, color: "var(--status-info)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 12px 0" }}>💡 Recommendations</h3>
        <p style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>{closeout.recommendations || "No recommendations documented"}</p>
      </div>

      <div style={{ gridColumn: "1 / -1", background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "12px", padding: "16px" }}>
        <h3 style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, color: "var(--text-primary)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 12px 0" }}>📚 Lessons Learned</h3>
        <p style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>{closeout.lessons_learned || "No lessons learned documented"}</p>
      </div>
    </div>
  );
}
