// View-tab strip for the canonical Schedule page (Gantt / 6-Week Lookahead /
// Task List) plus the divider beneath it.

interface ViewTabsProps {
  view: string;
  onSetView: (id: string) => void;
}

export default function ViewTabs({ view, onSetView }: ViewTabsProps) {
  return (
    <>
      <div style={{ flexShrink: 0, display: "flex", gap: 0, padding: "0 24px", marginTop: 4 }}>
        {[
          { id: "gantt", label: "Gantt Chart" },
          { id: "lookahead", label: "6-Week Lookahead" },
          { id: "list", label: "Task List" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => onSetView(tab.id)}
            style={{
              background: "transparent",
              border: "none",
              borderBottom: view === tab.id ? "2px solid var(--accent)" : "2px solid transparent",
              padding: "10px 20px",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              color: view === tab.id ? "var(--accent)" : "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              cursor: "pointer",
              transition: "color 0.15s, border-color 0.15s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div style={{ height: 1, background: "var(--divider)", margin: "0 24px 8px" }} />
    </>
  );
}
