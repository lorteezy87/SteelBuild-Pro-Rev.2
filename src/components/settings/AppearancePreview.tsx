type AppearancePreviewProps = {
  dateLabel: string;
  currencyLabel: string;
  measurementLabel: string;
};

const cell = {
  padding: "9px 10px",
  borderBottom: "1px solid var(--divider)",
  fontSize: 11,
  color: "var(--text-primary)",
};

export function AppearancePreview({ dateLabel, currencyLabel, measurementLabel }: AppearancePreviewProps) {
  return (
    <section
      aria-label="Live appearance preview"
      style={{
        marginBottom: 28,
        border: "1px solid var(--border-default)",
        borderRadius: 10,
        background: "var(--bg-surface-low)",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--divider)", display: "flex", justifyContent: "space-between" }}>
        <strong style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-primary)", letterSpacing: "0.08em" }}>LIVE PREVIEW</strong>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-success)" }}>ACTIVE</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "0.8fr 0.8fr 1fr 1fr 1fr" }}>
        {[
          ["DRAWING", "A501"],
          ["PIECE", "B-102"],
          ["DUE", dateLabel],
          ["VALUE", currencyLabel],
          ["WEIGHT", measurementLabel],
        ].map(([label, value]) => (
          <div key={label} style={cell}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
            <div style={{ fontFamily: label === "DRAWING" || label === "PIECE" ? "var(--font-mono)" : "var(--font-body)", fontWeight: 700 }}>{value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
