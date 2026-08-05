import { useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import { SectionCard, StatusPill } from "@/components/desktop/module";
import { useVirtualizer } from "@tanstack/react-virtual";
import { GitCompareArrows, Search } from "lucide-react";
import LoadingSkeletonRaw from "@/components/shared/LoadingSkeleton";
import { GridCell, GridHeaderCell, Td, Th } from "./primitives";
import { accent, border, error, mono, surface1, textMuted, textPrimary, warning } from "./format";

// These shared screens are still .jsx; cast at the boundary (removable
// once they are typed).
type AnyProps = Record<string, any>;
const LoadingSkeleton = LoadingSkeletonRaw as unknown as ComponentType<AnyProps>;

// ── Revision Impact Board (slice 4 of the Hub Command Center) ──────────────
const REV_DOWNSTREAM: Record<string, { label: string; color: string }> = {
  critical: { label: "In field", color: error },
  high: { label: "Delivered", color: warning },
  medium: { label: "Fabricated", color: accent },
  low: { label: "Not downstream", color: textMuted },
};

// Shared CSS-grid column template for the virtualized Revision Impact board
// (header + rows use this exact string, so they always align). Distinct from
// REVISION_GRID_COLS — these are the impact board's 8 columns. Widths approximate
// the table's auto-layout: a wide changed-sheet column (has a set-name subline),
// then content columns, then the right-aligned RFI / pieces / action columns.
const REVISION_GRID_COLS =
  "minmax(180px, 2fr) minmax(56px, 0.6fr) minmax(110px, 1fr) minmax(160px, 1.8fr) minmax(96px, 0.9fr) minmax(80px, 0.7fr) minmax(72px, 0.7fr) minmax(96px, 0.9fr)";

// ⚠ MIRROR of the table-branch <Td> cells in RevisionImpactBoard (the
// !shouldVirtualize branch). Any column add/edit MUST be made in BOTH places.
/**
 * RevisionGridCells — virtualized mirror of the inline table <Td> cells of the
 * Revision Impact board. Same content and styling, rendered as grid <div> cells
 * (in REVISION_GRID_COLS order) via the generic GridCell helper so the
 * absolute-positioned virtual rows line up with the grid header.
 */
function RevisionGridCells({ r, onCompareRevision }: { r: any; onCompareRevision?: (drawingId: string) => void }) {
  const dm = REV_DOWNSTREAM[r.severity] || REV_DOWNSTREAM.low;
  return (
    <>
      <GridCell style={{ color: textPrimary, fontWeight: 600 }}>
        <span style={{ minWidth: 0, overflow: "hidden" }}>
          <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.sheetNumber || "Sheet"}</span>
          <span style={{ display: "block", fontFamily: mono, fontSize: 9.5, color: textMuted, fontWeight: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.setName}</span>
        </span>
      </GridCell>
      <GridCell style={{ color: textMuted }}>{r.revisionCode}</GridCell>
      <GridCell>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: mono, fontSize: 10, fontWeight: 700, color: dm.color }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: dm.color, flexShrink: 0 }} />{dm.label}
        </span>
      </GridCell>
      <GridCell style={{ color: r.wpNames?.length ? textPrimary : textMuted }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{r.wpNames?.length ? r.wpNames.join(", ") : "—"}</span>
      </GridCell>
      <GridCell align="right">
        {r.rfiCount ? (
          <span style={{ fontFamily: mono, fontSize: 11, color: r.openRfiCount ? warning : textMuted }}>{r.openRfiCount}<span style={{ color: textMuted }}> / {r.rfiCount}</span></span>
        ) : <span style={{ color: textMuted }}>—</span>}
      </GridCell>
      <GridCell>
        {r.fabBlocked
          ? <span style={{ fontFamily: mono, fontSize: 9.5, fontWeight: 800, color: error, background: `color-mix(in srgb, ${error} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${error} 40%, transparent)`, borderRadius: 4, padding: "1px 6px", textTransform: "uppercase" }}>Yes</span>
          : <span style={{ fontFamily: mono, fontSize: 9.5, color: textMuted }}>No</span>}
      </GridCell>
      <GridCell align="right" style={{ color: r.affectedPieces != null ? textPrimary : textMuted }}>{r.affectedPieces != null ? r.affectedPieces : "—"}</GridCell>
      <GridCell align="right">
        {onCompareRevision && r.drawingId && (
          <button type="button" title="Open the revision overlay compare" onClick={() => onCompareRevision(r.drawingId)}
            style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 6, cursor: "pointer", background: "transparent", border: `1px solid ${border}`, color: accent }}>
            Compare
          </button>
        )}
      </GridCell>
    </>
  );
}

/**
 * RevisionVirtualList — virtualized rendering of the Revision Impact board, used
 * only when the filtered row count exceeds the 100-row threshold. Sticky CSS-grid
 * header + absolute-positioned grid rows (the repo's useVirtualizer house
 * pattern). The severity left-border accent and row keys are preserved.
 */
function RevisionVirtualList({ rows, onCompareRevision }: { rows: any[]; onCompareRevision?: (drawingId: string) => void }) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 49,
    overscan: 12,
  });

  return (
    <div style={{ border: `1px solid ${border}`, borderRadius: 10, overflow: "hidden", background: surface1 }}>
      <div style={{
        display: "grid", gridTemplateColumns: REVISION_GRID_COLS,
        borderBottom: `1px solid ${border}`, borderLeft: "3px solid transparent",
      }}>
        <GridHeaderCell>Changed Sheet</GridHeaderCell>
        <GridHeaderCell>Rev</GridHeaderCell>
        <GridHeaderCell>Downstream</GridHeaderCell>
        <GridHeaderCell>Linked Work Package</GridHeaderCell>
        <GridHeaderCell align="right">RFIs (open/all)</GridHeaderCell>
        <GridHeaderCell>Fab Blocked?</GridHeaderCell>
        <GridHeaderCell align="right">
          <span title="Pieces tied to this set — exact when the roster links pieces to the set, otherwise estimated via the linked work-package sequence. '—' when neither resolves.">Pieces ≈</span>
        </GridHeaderCell>
        <GridHeaderCell align="right">{""}</GridHeaderCell>
      </div>
      <div ref={parentRef} style={{ maxHeight: 600, overflowY: "auto" }}>
        <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const r = rows[virtualRow.index];
            const dm = REV_DOWNSTREAM[r.severity] || REV_DOWNSTREAM.low;
            return (
              <div
                key={r.revisionId || `${r.drawingId}-${r.revisionCode}`}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                style={{
                  position: "absolute", top: 0, left: 0, width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                  display: "grid", gridTemplateColumns: REVISION_GRID_COLS,
                  borderTop: virtualRow.index === 0 ? "none" : `1px solid ${border}`,
                  borderLeft: r.severity === "critical" || r.severity === "high" ? `3px solid ${dm.color}` : "3px solid transparent",
                }}
              >
                <RevisionGridCells r={r} onCompareRevision={onCompareRevision} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * "What changed / what's affected" board — one row per change-revision, joined
 * (in the hub) to its set's work package, linked RFIs, fab-blocked state, and a
 * best-effort affected-piece count. Rows arrive pre-enriched; this is presentational.
 */
export function RevisionImpactBoard({ rows = [], onCompareRevision, isLoading }: { rows?: any[]; onCompareRevision?: (drawingId: string) => void; isLoading?: boolean }) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) =>
      (r.sheetNumber || "").toLowerCase().includes(q) ||
      (r.setName || "").toLowerCase().includes(q) ||
      (r.wpNames || []).join(" ").toLowerCase().includes(q));
  }, [rows, search]);

  // Above this many rows, render the virtualized grid instead of a full <table>
  // so large projects stay fast. Small lists keep the exact table below.
  const shouldVirtualize = filtered.length > 100;

  if (isLoading) return <LoadingSkeleton />;

  // Severity → StatusPill tone mapping per plan D2:
  // critical/high → danger; medium → review; low → neutral
  function severityTone(sev: string): string {
    if (sev === "critical" || sev === "high") return "danger";
    if (sev === "medium") return "review";
    return "neutral";
  }

  return (
    <SectionCard title="Revision impact">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <GitCompareArrows size={15} color={accent} />
          <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", color: textPrimary, textTransform: "uppercase" }}>Revision Impact</span>
          <span style={{ fontFamily: mono, fontSize: 10, color: textMuted }}>{rows.length} changed sheet{rows.length === 1 ? "" : "s"}</span>
          <div style={{ flex: 1 }} />
          <div style={{ position: "relative", flex: "0 1 320px", minWidth: 180 }}>
            <Search size={14} color={textMuted} style={{ position: "absolute", left: 10, top: 9 }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search sheet / set / WP…" style={{ width: "100%", padding: "7px 10px 7px 30px", borderRadius: 8, border: `1px solid ${border}`, background: surface1, color: textPrimary, fontFamily: mono, fontSize: 12, outline: "none" }} />
          </div>
        </div>

        {shouldVirtualize ? (
          <RevisionVirtualList rows={filtered} onCompareRevision={onCompareRevision} />
        ) : (
        <div style={{ border: `1px solid ${border}`, borderRadius: 10, overflow: "hidden", background: surface1 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <Th>Changed Sheet</Th>
                <Th>Rev</Th>
                <Th>Downstream</Th>
                <Th>Linked Work Package</Th>
                <Th style={{ textAlign: "right" }}>RFIs (open/all)</Th>
                <Th>Fab Blocked?</Th>
                <Th style={{ textAlign: "right" }}>
                  <span title="Pieces tied to this set — exact when the roster links pieces to the set, otherwise estimated via the linked work-package sequence. '—' when neither resolves.">Pieces ≈</span>
                </Th>
                <Th style={{ textAlign: "right" }}>{""}</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><Td colSpan={8} style={{ textAlign: "center", color: textMuted, padding: 28 }}>
                  No changed sheets {search ? "match your search" : "yet — the board lights up when a new revision is uploaded for an existing sheet"}.
                </Td></tr>
              ) : filtered.map((r) => {
                const dm = REV_DOWNSTREAM[r.severity] || REV_DOWNSTREAM.low;
                return (
                  <tr key={r.revisionId || `${r.drawingId}-${r.revisionCode}`} style={{
                    borderTop: `1px solid ${border}`,
                    borderLeft: r.severity === "critical" || r.severity === "high" ? `3px solid ${dm.color}` : "3px solid transparent",
                  }}>
                    {/* ⚠ MIRROR of RevisionGridCells (virtualized branch) — edit both when changing columns. */}
                    <Td style={{ color: textPrimary, fontWeight: 600 }}>
                      {r.sheetNumber || "Sheet"}
                      <span style={{ display: "block", fontFamily: mono, fontSize: 9.5, color: textMuted, fontWeight: 400 }}>{r.setName}</span>
                    </Td>
                    <Td style={{ color: textMuted }}>{r.revisionCode}</Td>
                    <Td>
                      <StatusPill tone={severityTone(r.severity || "low")}>{dm.label}</StatusPill>
                    </Td>
                    <Td style={{ color: r.wpNames?.length ? textPrimary : textMuted }}>{r.wpNames?.length ? r.wpNames.join(", ") : "—"}</Td>
                    <Td style={{ textAlign: "right" }}>
                      {r.rfiCount ? (
                        <span style={{ fontFamily: mono, fontSize: 11, color: r.openRfiCount ? warning : textMuted }}>{r.openRfiCount}<span style={{ color: textMuted }}> / {r.rfiCount}</span></span>
                      ) : <span style={{ color: textMuted }}>—</span>}
                    </Td>
                    <Td>
                      <StatusPill tone={r.fabBlocked ? "danger" : "neutral"}>{r.fabBlocked ? "Yes" : "No"}</StatusPill>
                    </Td>
                    <Td style={{ textAlign: "right", color: r.affectedPieces != null ? textPrimary : textMuted }}>{r.affectedPieces != null ? r.affectedPieces : "—"}</Td>
                    <Td style={{ textAlign: "right" }}>
                      {onCompareRevision && r.drawingId && (
                        <button type="button" title="Open the revision overlay compare" onClick={() => onCompareRevision(r.drawingId)}
                          style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 6, cursor: "pointer", background: "transparent", border: `1px solid ${border}`, color: accent }}>
                          Compare
                        </button>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}
        <div style={{ fontFamily: mono, fontSize: 9, color: textMuted, lineHeight: 1.5 }}>
          Downstream severity: <span style={{ color: REV_DOWNSTREAM.critical.color }}>in field</span> &gt; <span style={{ color: REV_DOWNSTREAM.high.color }}>delivered</span> &gt; <span style={{ color: REV_DOWNSTREAM.medium.color }}>fabricated</span>. &quot;Pieces ≈&quot; counts pieces tied to the set — exact when the roster links them, else estimated via the linked work-package sequence.
        </div>
      </div>
    </SectionCard>
  );
}
