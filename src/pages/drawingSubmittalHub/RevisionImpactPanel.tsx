/**
 * RevisionImpactPanel — the canonical Detailing Revision Impact board
 * (revimpact tab).
 *
 * Presentation-only. Renders INSIDE the DetailingCommandShell light island
 * (`.detailing-cc` token cascade). Rows arrive PRE-ENRICHED from the hub (joined
 * to work packages / RFIs / fab-blocked / affected pieces) and the Compare
 * action is passed straight through — no query/mutation change. The board math
 * is the pure `revisionImpact.derive.ts` (filter + severity mapping), byte-
 * uses the shared enriched revision-impact rows from the hub.
 *
 * The table and virtualized branches share ONE `<RowCells>` render function, so
 * table and virtualized branches share ONE `<RowCells>` render function, so a
 * column change lands in both automatically.
 */
import { useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { GitCompareArrows } from "lucide-react";
import LoadingSkeletonRaw from "@/components/shared/LoadingSkeleton";
import { FilterBar, Pill } from "@/components/command";
import {
  downstreamFor,
  filterRevisionImpactRows,
  shouldVirtualizeRevisionImpact,
} from "./revisionImpact.derive";

type AnyProps = Record<string, any>;
const LoadingSkeleton = LoadingSkeletonRaw as unknown as ComponentType<AnyProps>;

// CSS-grid column template shared by the virtualized header + rows so they align.
const GRID_COLS =
  "minmax(180px, 2fr) minmax(56px, 0.6fr) minmax(120px, 1fr) minmax(160px, 1.8fr) minmax(96px, 0.9fr) minmax(88px, 0.7fr) minmax(72px, 0.7fr) minmax(96px, 0.9fr)";

const COLUMNS: { label: string; align?: "right"; title?: string }[] = [
  { label: "Changed Sheet" },
  { label: "Rev" },
  { label: "Downstream" },
  { label: "Linked Work Package" },
  { label: "RFIs (open/all)", align: "right" },
  { label: "Fab Blocked?" },
  { label: "Pieces ≈", align: "right", title: "Pieces tied to this set — exact when the roster links pieces to the set, otherwise estimated via the linked work-package sequence. '—' when neither resolves." },
  { label: "" },
];

/**
 * The 8 cells for one revision-impact row, as an ordered array of ReactNodes.
 * Shared by BOTH the <table> and the virtualized grid so the columns can never
 * drift apart in the canonical revision-impact panel.
 */
function rowCells(r: any, onCompareRevision?: (drawingId: string) => void) {
  const dm = downstreamFor(r.severity);
  return [
    // Changed Sheet (sheet number + set-name subline)
    <span key="sheet" style={{ minWidth: 0, overflow: "hidden" }}>
      <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600, color: "var(--cmd-text)" }}>{r.sheetNumber || "Sheet"}</span>
      <span style={{ display: "block", fontSize: 9.5, color: "var(--cmd-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.setName}</span>
    </span>,
    // Rev
    <span key="rev" style={{ color: "var(--cmd-text-muted)" }}>{r.revisionCode}</span>,
    // Downstream
    <Pill key="down" tone={dm.tone}>{dm.label}</Pill>,
    // Linked Work Package
    <span key="wp" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, color: r.wpNames?.length ? "var(--cmd-text)" : "var(--cmd-text-muted)" }}>
      {r.wpNames?.length ? r.wpNames.join(", ") : "—"}
    </span>,
    // RFIs (open/all)
    r.rfiCount ? (
      <span key="rfi" style={{ fontSize: 11, color: r.openRfiCount ? "var(--cmd-warn)" : "var(--cmd-text-muted)" }}>
        {r.openRfiCount}<span style={{ color: "var(--cmd-text-muted)" }}> / {r.rfiCount}</span>
      </span>
    ) : <span key="rfi" style={{ color: "var(--cmd-text-muted)" }}>—</span>,
    // Fab Blocked?
    <Pill key="fab" tone={r.fabBlocked ? "danger" : "neutral"}>{r.fabBlocked ? "Yes" : "No"}</Pill>,
    // Pieces ≈
    <span key="pcs" style={{ color: r.affectedPieces != null ? "var(--cmd-text)" : "var(--cmd-text-muted)" }}>{r.affectedPieces != null ? r.affectedPieces : "—"}</span>,
    // Compare action
    (onCompareRevision && r.drawingId) ? (
      <button
        key="cmp"
        type="button"
        title="Open the revision overlay compare"
        onClick={() => onCompareRevision(r.drawingId)}
        className="cmd-btn cmd-btn--ghost"
        style={{ fontSize: 11, padding: "3px 10px" }}
      >
        Compare
      </button>
    ) : <span key="cmp" />,
  ];
}

/** Left-accent border for a row keyed to its severity (critical/high get a
 *  coloured rail). */
function severityRail(severity: string): string {
  if (severity === "critical") return "3px solid var(--cmd-danger)";
  if (severity === "high") return "3px solid var(--cmd-warn)";
  return "3px solid transparent";
}

function rowKey(r: any): string {
  return r.revisionId || `${r.drawingId}-${r.revisionCode}`;
}

// ── Virtualized branch (>100 rows) ──────────────────────────────────────────

function VirtualBoard({ rows, onCompareRevision }: { rows: any[]; onCompareRevision?: (drawingId: string) => void }) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 49,
    overscan: 12,
  });

  return (
    <div className="cmd-table-wrap" style={{ overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: GRID_COLS, borderBottom: "1px solid var(--cmd-border)", borderLeft: "3px solid transparent" }}>
        {COLUMNS.map((c, i) => (
          <div key={i} style={{ padding: "10px 14px", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--cmd-text-muted)", display: "flex", alignItems: "center", justifyContent: c.align === "right" ? "flex-end" : "flex-start", minWidth: 0 }}>
            {c.title ? <span title={c.title}>{c.label}</span> : c.label}
          </div>
        ))}
      </div>
      <div ref={parentRef} style={{ maxHeight: 600, overflowY: "auto" }}>
        <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const r = rows[virtualRow.index];
            const cells = rowCells(r, onCompareRevision);
            return (
              <div
                key={rowKey(r)}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                style={{
                  position: "absolute", top: 0, left: 0, width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                  display: "grid", gridTemplateColumns: GRID_COLS,
                  borderTop: virtualRow.index === 0 ? "none" : "1px solid var(--cmd-border)",
                  borderLeft: severityRail(r.severity),
                }}
              >
                {cells.map((cell, i) => (
                  <div key={i} style={{ padding: "10px 14px", fontSize: 13, color: "var(--cmd-text)", display: "flex", alignItems: "center", justifyContent: COLUMNS[i].align === "right" ? "flex-end" : "flex-start", minWidth: 0 }}>
                    {cell}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Board ─────────────────────────────────────────────────────────────────

export default function RevisionImpactPanel({ rows = [], onCompareRevision, isLoading }: { rows?: any[]; onCompareRevision?: (drawingId: string) => void; isLoading?: boolean }) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => filterRevisionImpactRows(rows, search), [rows, search]);
  const virtualize = shouldVirtualizeRevisionImpact(filtered.length);

  if (isLoading) return <LoadingSkeleton />;

  return (
    <section className="detailing-cc" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <GitCompareArrows size={15} color="var(--cmd-gold)" />
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--cmd-text)" }}>Revision Impact</span>
        <span style={{ fontSize: 11, color: "var(--cmd-text-muted)" }}>{rows.length} changed sheet{rows.length === 1 ? "" : "s"}</span>
      </div>

      <FilterBar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search sheet / set / WP…"
      />

      {virtualize ? (
        <VirtualBoard rows={filtered} onCompareRevision={onCompareRevision} />
      ) : (
        <div className="cmd-table-wrap">
          <table className="cmd-table">
            <thead>
              <tr>
                {COLUMNS.map((c, i) => (
                  <th key={i} style={{ textAlign: c.align === "right" ? "right" : "left" }}>
                    {c.title ? <span title={c.title}>{c.label}</span> : c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="cmd-table__empty">
                    No changed sheets {search ? "match your search" : "yet — the board lights up when a new revision is uploaded for an existing sheet"}.
                  </td>
                </tr>
              ) : filtered.map((r) => {
                const cells = rowCells(r, onCompareRevision);
                return (
                  <tr key={rowKey(r)} style={{ borderLeft: severityRail(r.severity) }}>
                    {cells.map((cell, i) => (
                      <td key={i} style={{ textAlign: COLUMNS[i].align === "right" ? "right" : "left" }}>{cell}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ fontSize: 9, color: "var(--cmd-text-muted)", lineHeight: 1.5 }}>
        Downstream severity: <span style={{ color: "var(--cmd-danger)" }}>in field</span> &gt; <span style={{ color: "var(--cmd-warn)" }}>delivered</span> &gt; <span style={{ color: "var(--cmd-review)" }}>fabricated</span>. &quot;Pieces ≈&quot; counts pieces tied to the set — exact when the roster links them, else estimated via the linked work-package sequence.
      </div>
    </section>
  );
}
