/**
 * LinkerPicker — extracted from ZonePanel.jsx.
 *
 * Modal for the "+ Link Record" button. Lets the user pick a project-
 * scoped record (RFI / WP / Delivery / CO / Document) to attach to the
 * current zone. Owns its own type-tab state, search query, and the
 * candidates query — same TanStack key as before so cache is unchanged.
 *
 * The parent panel passes onPick({ recordType, recordId }) which kicks
 * off the actual link-create mutation.
 */

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Search, ExternalLink } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { mono, display, PICKER_TYPES } from "./zonePanelConstants";

export function LinkerPicker({ zone, onClose, onPick }) {
  const [typeKey, setTypeKey] = useState("rfi");
  const [query, setQuery] = useState("");

  const typeSpec = PICKER_TYPES.find((t) => t.key === typeKey) || PICKER_TYPES[0];

  // Fetch candidates scoped to the same project so cross-project
  // mistakes are impossible. No pagination in the MVP — the list is
  // capped to 100 for sanity.
  const { data: candidates = [], isFetching } = useQuery({
    queryKey: ["zone-linker-candidates", zone?.project_id, typeKey],
    queryFn: async () => {
      if (!zone?.project_id) return [];
      const entity = base44.entities[typeSpec.entity];
      if (!entity?.filter) return [];
      const rows = await entity.filter({ project_id: zone.project_id });
      return Array.isArray(rows) ? rows.slice(0, 300) : [];
    },
    enabled: !!zone?.project_id,
    staleTime: 30 * 1000,
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((r) => {
      const num  = String(r[typeSpec.numberField] || "").toLowerCase();
      const ttl  = String(r[typeSpec.titleField]  || "").toLowerCase();
      return num.includes(q) || ttl.includes(q);
    });
  }, [candidates, query, typeSpec]);

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1200 }} />
      <div
        style={{
          position: "fixed",
          top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: 540, maxWidth: "92vw", maxHeight: "82vh",
          background: "var(--bg-surface-secondary)",
          border: "1px solid var(--border-default)",
          borderRadius: 6,
          zIndex: 1201,
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <header style={{ padding: "14px 18px", borderBottom: "1px solid var(--divider)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)" }}>
              Link to {zone.zone_key}
            </div>
            <div style={{ ...display, fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginTop: 2 }}>
              Pick a record to attach
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
            <X size={18} />
          </button>
        </header>

        {/* Type tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--divider)", background: "var(--bg-surface-low)" }}>
          {PICKER_TYPES.map((t) => (
            <button
              key={t.key}
              onClick={() => setTypeKey(t.key)}
              style={{
                ...mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase",
                padding: "9px 14px",
                background: "transparent",
                color: typeKey === t.key ? "var(--accent)" : "var(--text-muted)",
                border: "none",
                borderBottom: `2px solid ${typeKey === t.key ? "var(--accent)" : "transparent"}`,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ padding: "10px 18px", borderBottom: "1px solid var(--divider)" }}>
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", top: "50%", left: 8, transform: "translateY(-50%)", color: "var(--text-muted)" }} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${typeSpec.label.toLowerCase()}s by number or title…`}
              style={{
                ...mono,
                fontSize: 12,
                width: "100%",
                padding: "7px 10px 7px 30px",
                background: "var(--bg-input)",
                border: "1px solid var(--border-default)",
                borderRadius: 3,
                color: "var(--text-primary)",
              }}
            />
          </div>
        </div>

        {/* Candidate list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 10px" }}>
          {isFetching && filtered.length === 0 && (
            <div style={{ padding: "24px 8px", textAlign: "center", color: "var(--text-muted)", ...mono, fontSize: 10 }}>
              Loading…
            </div>
          )}
          {!isFetching && filtered.length === 0 && (
            <div style={{ padding: "24px 8px", textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
              No {typeSpec.label.toLowerCase()}s match{query ? ` "${query}"` : ""}.
            </div>
          )}
          {filtered.map((row) => (
            <button
              key={row.id}
              onClick={() => onPick({ recordType: typeKey, recordId: row.id })}
              style={{
                width: "100%",
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                background: "transparent",
                border: "1px solid transparent",
                borderBottom: "1px solid var(--divider)",
                color: "var(--text-primary)",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ ...mono, fontSize: 10, color: "var(--accent)", minWidth: 80 }}>
                {row[typeSpec.numberField] || "—"}
              </span>
              <span style={{ flex: 1, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {row[typeSpec.titleField] || "(untitled)"}
              </span>
              <ExternalLink size={12} style={{ color: "var(--text-muted)" }} />
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

export default LinkerPicker;
