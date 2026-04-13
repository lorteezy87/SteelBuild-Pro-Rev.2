import { STAGES, DISCIPLINES, mono, surface, btnBase, btnPrimary, btnGhost } from "./drawingsConfig";

/**
 * Clickable stat cards for quick-filtering by status category.
 */
export function StatsBar({ stats, stageFilter, setStageFilter }) {
  const items = [
    { label: "TOTAL SHEETS",  value: stats.total,    color: "var(--text-primary)", filterKey: null },
    { label: "IFC / RELEASED", value: stats.released, color: "#10B981",             filterKey: "Released" },
    { label: "IN REVIEW",     value: stats.inReview,  color: "#3B82F6",             filterKey: "_inReview" },
    { label: "OVERDUE",       value: stats.overdue,   color: "var(--status-error)",  filterKey: "_overdue" },
    { label: "PRIORITY",      value: stats.priority,  color: "var(--accent)",        filterKey: "_priority" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 20 }}>
      {items.map(s => {
        const isActive = s.filterKey && stageFilter === s.filterKey;
        return (
          <button
            key={s.label}
            type="button"
            onClick={() => {
              if (!s.filterKey) return;
              setStageFilter(prev => prev === s.filterKey ? "ALL" : s.filterKey);
            }}
            style={{
              ...surface,
              padding: "12px 16px",
              cursor: s.filterKey ? "pointer" : "default",
              textAlign: "left",
              borderColor: isActive ? `${s.color}60` : undefined,
              boxShadow: isActive ? `0 0 12px ${s.color}20` : undefined,
              transition: "border-color 0.2s, box-shadow 0.2s",
            }}
          >
            <div style={{ ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.2em", color: isActive ? s.color : "var(--text-muted)", marginBottom: 4 }}>
              {s.label}
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: s.color, lineHeight: 1, ...mono }}>
              {s.value}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Discipline chip filter row.
 */
export function DisciplineChips({ discipline, setDiscipline, disciplineCounts }) {
  return (
    <div className="filter-bar-responsive" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
      {["ALL", ...DISCIPLINES].map(d => {
        const count = disciplineCounts[d] || 0;
        const active = discipline === d;
        return (
          <button
            key={d}
            onClick={() => setDiscipline(d)}
            style={{
              ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", padding: "4px 10px",
              borderRadius: 2, cursor: "pointer",
              border: `1px solid ${active ? "var(--accent)" : "var(--border-default)"}`,
              background: active ? "rgba(200,155,32,0.15)" : "none",
              color: active ? "var(--accent)" : "var(--text-muted)",
            }}
          >
            {d} <span style={{ opacity: 0.7 }}>({count})</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Search / stage filter / IFC toggle / view mode bar.
 */
export function FilterBar({ search, setSearch, stageFilter, setStageFilter, view, setView }) {
  return (
    <div className="filter-bar-responsive" style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
      {/* Search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search sheets, titles, reviewers\u2026"
        style={{
          flex: 1, minWidth: 200, padding: "7px 12px",
          background: "var(--bg-surface)", border: "1px solid var(--border-default)",
          borderRadius: 2, color: "var(--text-primary)",
          fontFamily: "var(--font-body)", fontSize: 13,
        }}
      />

      {/* Stage filter dropdown */}
      <select
        value={stageFilter}
        onChange={e => setStageFilter(e.target.value)}
        style={{
          padding: "7px 10px", background: "var(--bg-surface)",
          border: "1px solid var(--border-default)", borderRadius: 2,
          color: "var(--text-primary)", ...mono, fontSize: 10,
        }}
      >
        <option value="ALL">ALL STAGES</option>
        {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>

      {/* IFC Only toggle */}
      <button
        onClick={() => setStageFilter(prev => prev === "Released" ? "ALL" : "Released")}
        style={{
          ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
          padding: "6px 12px", borderRadius: "var(--radius-btn)", cursor: "pointer",
          background: stageFilter === "Released" ? "rgba(16,185,129,0.15)" : "none",
          border: `1px solid ${stageFilter === "Released" ? "rgba(16,185,129,0.35)" : "var(--border-default)"}`,
          color: stageFilter === "Released" ? "#10B981" : "var(--text-muted)",
          transition: "all 0.15s",
        }}
      >
        IFC ONLY
      </button>

      {/* View toggle */}
      <div style={{ display: "flex", border: "1px solid var(--border-default)", borderRadius: "var(--radius-btn)", overflow: "hidden" }}>
        {["list", "grid"].map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              ...mono, fontSize: 10, fontWeight: 700, padding: "6px 12px",
              border: "none", cursor: "pointer",
              background: view === v ? "rgba(200,155,32,0.2)" : "none",
              color: view === v ? "var(--accent)" : "var(--text-muted)",
            }}
          >
            {v === "list" ? "\u2630 LIST" : "\u229E GRID"}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Bulk actions bar — appears when drawings are selected.
 */
export function BulkActionsBar({
  selectedCount, bulkStage, setBulkStage,
  onApplyStage, selectedSetName, onSetApproval,
  onBulkDelete, onClear,
}) {
  return (
    <div style={{
      ...surface, padding: "10px 16px", marginBottom: 12,
      display: "flex", alignItems: "center", gap: 12,
      background: "rgba(200,155,32,0.08)", borderColor: "rgba(200,155,32,0.3)",
    }}>
      <span style={{ ...mono, fontSize: 10, fontWeight: 700, color: "var(--accent)" }}>
        {selectedCount} SELECTED
      </span>

      <select
        value={bulkStage}
        onChange={e => setBulkStage(e.target.value)}
        style={{
          padding: "5px 10px", background: "var(--bg-surface)",
          border: "1px solid var(--border-default)", borderRadius: 2,
          color: "var(--text-primary)", ...mono, fontSize: 10,
        }}
      >
        <option value="">— SET STAGE —</option>
        {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>

      <button style={btnPrimary} onClick={onApplyStage} disabled={!bulkStage}>APPLY</button>

      {selectedSetName && (
        <button
          style={{ ...btnBase, background: "rgba(0,230,118,0.15)", border: "1px solid rgba(0,230,118,0.3)", color: "#00E676" }}
          onClick={() => onSetApproval(selectedSetName)}
        >
          SET APPROVAL
        </button>
      )}

      <button style={btnGhost} onClick={onBulkDelete}>DELETE</button>
      <button style={btnGhost} onClick={onClear}>CLEAR</button>
    </div>
  );
}
