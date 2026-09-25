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
  "minmax(150px, 1.5fr) minmax(52px, 0.45fr) minmax(92px, 0.75fr) minmax(170px, 1.55fr) minmax(130px, 1.1fr) minmax(84px, 0.65fr) minmax(150px, 1.2fr) minmax(78px, 0.6fr)";

const COLUMNS: { label: string; align?: "right"; title?: string }[] = [
  { label: "Changed Sheet" },
  { label: "Rev" },
  { label: "Downstream" },
  { label: "Revision control", title: "Evidence is advisory in this board; server-side fabrication release gates remain authoritative." },
  { label: "Linked Work Package" },
  { label: "RFIs (open/all)", align: "right" },
  { label: "Model mapping", title: "Exact means the model roster links pieces to the drawing set; sequence estimate is a labelled fallback. Unknown never means zero pieces." },
  { label: "" },
];

/**
 * The 8 cells for one revision-impact row, as an ordered array of ReactNodes.
 * Shared by BOTH the <table> and the virtualized grid so the columns can never
 * drift apart in the canonical revision-impact panel.
 */
function controlPresentation(r: any) {
  const control = r.revisionControl ?? {
    status: "review_required",
    reasons: [{ code: "EVIDENCE_NOT_COMPUTED", message: "Revision evidence has not been computed.", severity: "review_required" }],
  };
  const label = control.status === "clear" ? "Clear" : control.status === "blocked" ? "Blocked" : "Review required";
  const tone = (control.status === "clear" ? "good" : control.status === "blocked" ? "danger" : "review") as "good" | "danger" | "review";
  return { control, label, tone };
}

function modelScopePresentation(r: any, rosterState: RosterState) {
  const scope = r.modelScope ?? r.revisionControl?.model;
  if (scope?.state === "exact") return `Exact · ${scope.affectedPieces ?? 0} pieces`;
  if (scope?.state === "sequence_estimate") return `Sequence estimate · ${scope.affectedPieces ?? 0} pieces`;
  if (scope?.state === "not_loaded" || rosterState === "not_loaded") return "Unknown · model roster not loaded";
  if (rosterState === "load_error") return "Unknown · model roster could not load";
  return "Unknown · model scope unresolved";
}

function rowCells(r: any, onCompareRevision?: (drawingId: string) => void, rosterState: RosterState = "not_loaded") {
  const dm = downstreamFor(r.severity);
  const { control, label: controlLabel, tone: controlTone } = controlPresentation(r);
  const firstReason = control.reasons?.[0];
  return [
    // Changed Sheet (sheet number + set-name subline)
    <span key="sheet" style={{ minWidth: 0, overflow: "hidden" }}>
      <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600, color: "var(--cmd-text)" }}>{r.sheetNumber || "Sheet"}</span>
      <span style={{ display: "block", fontSize: 9.5, color: "var(--cmd-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.setName}</span>
    </span>,
    // Rev
    <span key="rev" style={{ color: "var(--cmd-text-muted)" }}>{r.revisionCode}</span>,
    // Downstream — the "Unknown" state carries why, so it can't read as an all-clear.
    <span key="down" title={dm.title}><Pill tone={dm.tone}>{dm.label}</Pill></span>,
    // Revision control — this is evidence only; it must never read as an
    // authorization to release fabrication.
    <span key="control" title={firstReason?.message} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3, minWidth: 0 }}>
      <Pill tone={controlTone}>{controlLabel}</Pill>
      {firstReason && <span style={{ fontSize: 9, color: "var(--cmd-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{firstReason.code}</span>}
    </span>,
    // Linked Work Package
    <span key="wp" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, color: r.wpNames?.length ? "var(--cmd-text)" : "var(--cmd-text-muted)" }}>
      {r.wpNames?.length ? r.wpNames.join(", ") : "—"}
    </span>,
    // RFIs (open/all)
    r.rfiCount ? (
      <span key="rfi" style={{ fontSize: 11, color: r.openRfiCount ? "var(--cmd-warn-text)" : "var(--cmd-text-muted)" }}>
        {r.openRfiCount}<span style={{ color: "var(--cmd-text-muted)" }}> / {r.rfiCount}</span>
      </span>
    ) : <span key="rfi" style={{ color: "var(--cmd-text-muted)" }}>—</span>,
    // Model mapping — unloaded, failed and unresolved scopes are all explicit.
    <span
      key="mapping"
      style={{ color: r.modelScope?.affectedPieces != null ? "var(--cmd-text)" : "var(--cmd-text-muted)", fontSize: 11 }}
    >
      {modelScopePresentation(r, rosterState)}
    </span>,
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

export type RosterState = "not_loaded" | "loaded" | "load_error";

function VirtualBoard({ rows, onCompareRevision, rosterState = "not_loaded" }: { rows: any[]; onCompareRevision?: (drawingId: string) => void; rosterState?: RosterState }) {
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
            const cells = rowCells(r, onCompareRevision, rosterState);
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

export default function RevisionImpactPanel({
  rows = [], onCompareRevision, isLoading, rosterState = "not_loaded", onLoadMappingEvidence, rosterLoadedAt,
}: {
  rows?: any[];
  onCompareRevision?: (drawingId: string) => void;
  isLoading?: boolean;
  rosterState?: RosterState;
  onLoadMappingEvidence?: () => void;
  rosterLoadedAt?: string | null;
}) {
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
        {rosterState === "not_loaded" && onLoadMappingEvidence && (
          <button type="button" className="cmd-btn cmd-btn--ghost" onClick={onLoadMappingEvidence}>
            Load mapping evidence
          </button>
        )}
        {rosterState === "load_error" && onLoadMappingEvidence && (
          <button type="button" className="cmd-btn cmd-btn--ghost" onClick={onLoadMappingEvidence}>
            Retry mapping evidence
          </button>
        )}
        {rosterState === "loaded" && rosterLoadedAt && (
          <span style={{ fontSize: 9, color: "var(--cmd-text-muted)" }}>Model roster loaded {rosterLoadedAt}</span>
        )}
      </div>

      <FilterBar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search sheet / set / WP…"
      />

      {virtualize ? (
        <VirtualBoard rows={filtered} onCompareRevision={onCompareRevision} rosterState={rosterState} />
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
                const cells = rowCells(r, onCompareRevision, rosterState);
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
        Revision control is advisory evidence only; the server release gate remains authoritative. Model mapping: exact set links are preferred, sequence estimates are labelled, and unknown never means zero affected pieces.
      </div>
    </section>
  );
}
