import React from "react";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { STAGES, mono } from "@/pages/drawingViewer/drawingViewerUtils";

// Left sidebar: back-button, sheet search, scrollable list of sheets keyed
// to the active project, and a prev/next nav footer. Pure presentation —
// every piece of state and every callback is owned by DrawingViewer and
// passed in by prop. The rendered DOM and inline styles are byte-identical
// to the JSX block this replaces.
export default function SheetListSidebar({
  sidebarOpen,
  navigate,
  search,
  setSearch,
  filtered,
  drawings,
  activeId,
  setActiveId,
  activeIndex,
}) {
  return (
    <div className="sbd-sidebar" style={{
      width: sidebarOpen ? 260 : 0,
      flexShrink: 0,
      borderRight: sidebarOpen ? "1px solid var(--border-default)" : "none",
      display: "flex",
      flexDirection: "column",
      background: "var(--bg-surface)",
      overflow: "hidden",
      transition: "width 0.2s ease",
      padding: 0,
      minWidth: 0,
    }}>

      {/* Sidebar header */}
      <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid var(--border-default)" }}>
        <button onClick={() => navigate("/Drawings")}
          style={{ ...mono, display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", background: "none", border: "none", color: "var(--accent)", cursor: "pointer", padding: 0, marginBottom: 10 }}>
          <ArrowLeft size={12} /> Back to Drawings
        </button>
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search sheets…"
          className="sbd-input"
          style={{ width: "100%", padding: "7px 10px", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: 6, color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, boxSizing: "border-box" }} />
        <div style={{ ...mono, fontSize: 10, fontWeight: 700, color: "var(--text-muted)", marginTop: 8, letterSpacing: "0.10em", textTransform: "uppercase" }}>
          {filtered.length} / {drawings.length} Sheets
        </div>
      </div>

      {/* Sheet list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {filtered.map((d) => {
          const isActive = d.id === activeId;
          const stageColor = STAGES[d.stage]?.color || "#6B7280";
          return (
            <div key={d.id} onClick={() => setActiveId(d.id)}
              style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid var(--hover-bg)", background: isActive ? "var(--accent-muted)" : "none", borderLeft: `3px solid ${isActive ? "var(--accent)" : "transparent"}`, transition: "background 0.1s" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                <div>
                  <div style={{ ...mono, fontSize: 11, fontWeight: 700, color: isActive ? "var(--accent)" : "var(--text-primary)", marginBottom: 2 }}>
                    {d.sheet_number}
                  </div>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 150 }}>
                    {d.title}
                  </div>
                </div>
                <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                  <span style={{ ...mono, fontSize: 8, fontWeight: 700, color: stageColor, border: `1px solid ${stageColor}44`, padding: "1px 5px", borderRadius: 2 }}>
                    {d.stage === "Released" ? "IFC" : (d.stage || "—")}
                  </span>
                  {d.priority_flag && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--status-error)", display: "inline-block" }} />}
                </div>
              </div>
              <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", opacity: 0.5, marginTop: 3 }}>R{d.revision_number ?? "0"} · {d.discipline}</div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ padding: 24, ...mono, fontSize: 10, color: "var(--text-muted)", textAlign: "center" }}>NO SHEETS FOUND</div>
        )}
      </div>

      {/* Navigation footer */}
      {filtered.length > 0 && (
        <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border-default)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button onClick={() => { const p = filtered[activeIndex - 1]; if (p) setActiveId(p.id); }}
            disabled={activeIndex <= 0}
            style={{ display: "inline-flex", alignItems: "center", background: "var(--bg-surface-low)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-btn)", color: "var(--text-secondary)", padding: "4px 10px", cursor: activeIndex <= 0 ? "not-allowed" : "pointer", opacity: activeIndex <= 0 ? 0.3 : 1 }}>
            <ChevronLeft size={14} />
          </button>
          <span style={{ ...mono, fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em" }}>{activeIndex + 1} / {filtered.length}</span>
          <button onClick={() => { const n = filtered[activeIndex + 1]; if (n) setActiveId(n.id); }}
            disabled={activeIndex >= filtered.length - 1}
            style={{ display: "inline-flex", alignItems: "center", background: "var(--bg-surface-low)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-btn)", color: "var(--text-secondary)", padding: "4px 10px", cursor: activeIndex >= filtered.length - 1 ? "not-allowed" : "pointer", opacity: activeIndex >= filtered.length - 1 ? 0.3 : 1 }}>
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
