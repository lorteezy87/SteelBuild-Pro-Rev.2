import React, { useState } from "react";
import { ChevronRight } from "lucide-react";
// ── Step A: Select existing drawing set ────────────────────────────
export default function StepSelectSet({ drawingSets, preSelectedSet, onSelect, onClose, loading = false, error = null }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(preSelectedSet || null);
  const getSetIdentity = (drawingSet) => drawingSet?.id ?? drawingSet?.set_name ?? "";

  const filtered = drawingSets.filter(ds =>
    !search || (ds.set_name || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.14em", color: "var(--text-muted)", marginBottom: 8 }}>
        WHICH DRAWING SET ARE YOU UPDATING?
      </div>
      <div style={{ position: "relative", marginBottom: 12 }}>
        <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: 12, pointerEvents: "none" }}>⌕</div>
        <input
          placeholder="Search drawing sets..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: "100%",
            height: 38,
            background: "var(--bg-surface-low)",
            border: "1px solid var(--border-default)",
            borderRadius: 8,
            padding: "0 12px 0 36px",
            color: "var(--text-primary)",
            fontFamily: "var(--font-body)",
            fontSize: 12,
            outline: "none",
          }}
          onFocus={e => {
            e.target.style.border = "1px solid rgba(245,158,11,0.40)";
            e.target.style.boxShadow = "0 0 0 3px rgba(245,158,11,0.08)";
          }}
          onBlur={e => {
            e.target.style.border = "1px solid var(--border-default)";
            e.target.style.boxShadow = "none";
          }}
        />
      </div>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 0", gap: 8 }}>
          <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(245,158,11,0.2)", borderTopColor: "var(--accent)", animation: "spin 0.7s linear infinite" }} />
          <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)" }}>Loading drawing sets...</span>
        </div>
      ) : error ? (
        <div style={{ textAlign: "center", padding: "20px 0", fontFamily: "var(--font-body)", fontSize: 11, color: "rgba(255,61,61,0.60)" }}>
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "20px 0", fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)" }}>
          No drawing sets found for this project
        </div>
      ) : (
        <div style={{ maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
          {filtered.map(ds => {
            const isSelected = getSetIdentity(selected) === getSetIdentity(ds);
            return (
              <div key={getSetIdentity(ds)} onClick={() => setSelected(ds)} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "0 12px", height: 48,
                background: isSelected ? "var(--warning-muted)" : "var(--hover-bg)",
                border: `1px solid ${isSelected ? "rgba(245,158,11,0.35)" : "var(--divider)"}`,
                borderRadius: 8, cursor: "pointer",
                transition: "all 0.1s"
              }}
              onMouseEnter={e => {
                if (!isSelected) {
                  e.currentTarget.style.background = "var(--warning-muted)";
                  e.currentTarget.style.borderColor = "rgba(245,158,11,0.20)";
                }
              }}
              onMouseLeave={e => {
                if (!isSelected) {
                  e.currentTarget.style.background = "var(--hover-bg)";
                  e.currentTarget.style.borderColor = "var(--divider)";
                }
              }}>
                <div>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{ds.set_name}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.08em", marginTop: 2 }}>
                    {ds.sheet_count || 0} sheets · REV {ds.revision || "—"}
                  </div>
                </div>
                {isSelected && <span style={{ color: "var(--accent)", fontSize: 14 }}>✓</span>}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, borderTop: "1px solid var(--divider)", paddingTop: 12 }}>
        <button onClick={onClose} style={{
          height: 34, padding: "0 16px", background: "var(--hover-bg)",
          border: "1px solid var(--border-default)", borderRadius: 8,
          color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: 12, cursor: "pointer"
        }}>Cancel</button>
        <button onClick={() => selected && onSelect(selected)} disabled={!selected || loading} style={{
          height: 34, padding: "0 18px", borderRadius: 8, cursor: selected && !loading ? "pointer" : "not-allowed",
          background: selected && !loading ? "var(--accent)" : "var(--hover-bg)",
          border: "none", color: selected && !loading ? "#fff" : "var(--text-muted)",
          fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600,
          display: "flex", alignItems: "center", gap: 6, opacity: selected && !loading ? 1 : 0.4
        }}>
          Continue <ChevronRight style={{ width: 13, height: 13 }} />
        </button>
      </div>
    </div>
  );
}
