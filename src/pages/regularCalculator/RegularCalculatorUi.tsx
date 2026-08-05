/** Presentational keyboard help row for Regular Calculator. */
const mono = { fontFamily: "var(--font-mono)" } as const;

export function KbRow({ k, label }: { k: string; label: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", ...mono, fontSize: 10 }}>
      <span style={{ color: "var(--text-secondary)" }}>{k}</span>
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
    </div>
  );
}
