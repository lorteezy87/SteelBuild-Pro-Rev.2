import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { SectionCard, StatusPill } from "@/components/desktop/module";
import {
  Boxes,
  CalendarClock,
  GitCompareArrows,
} from "lucide-react";
import { ELEMENT_STATUS_META } from "@/services/modelElementStatus";
import type { ElementStatusKey, ElementStatusSummary } from "@/services/modelElementStatus";
import { FAB_STATUS_META, FAB_STATUS_ORDER, summarizeFabStatus } from "@/lib/fabStatus";
import {
  accent,
  border,
  error,
  fmtDate,
  mono,
  pluralize,
  success,
  surface1,
  surface2,
  textMuted,
  textPrimary,
  warning,
} from "./format";
import {
  EmptyState,
  FlagToggle,
  ReadyChip,
  SeqMetric,
} from "./primitives";


import type {
  DetailingReadiness,
  ModelElementViewRow,
  RevisionImpactViewRow,
  SequenceReadinessRow,
} from "./types";


// ── 3D Model Mapping (BIM integration Phase 0) ──────────────────────────────
// Member-level piece-mark mapping coverage + status buckets. The same buckets
// (and their GUID sets) will drive the viewer's "paint by numbers" coloring —
// this section makes the mapping visible (and importable) before the viewer
// lands, so model data quality is established first.

const ELEMENT_BUCKET_ORDER = [
  "rfi_blocked", "behind_schedule", "in_detailing", "in_review",
  "fab_ready", "erection_ready", "unmapped",
] as const;

const DRILLDOWN_ROW_CAP = 100;

// The drill-down can open from EITHER chip row: a detailing-status bucket
// (resolved via the summary's id sets) or a fabrication-status bucket (resolved
// by filtering elements on fab_status). The discriminated union keeps the two
// member-resolution paths + header metas unambiguous.
type FabStatusKey = keyof typeof FAB_STATUS_META;
type OpenBucket =
  | { kind: "detail"; key: ElementStatusKey }
  | { kind: "fab"; key: FabStatusKey }
  | null;

export function ModelMappingSection({
  summary, elements, onImport,
  rosterCount = null, rosterCountLoading = false, rosterLoading = false, onLoadRoster,
}: {
  summary?: ElementStatusSummary | null;
  elements?: ModelElementViewRow[];
  onImport: () => void;
  /** Live member count (HEAD count). null = not known yet. */
  rosterCount?: number | null;
  rosterCountLoading?: boolean;
  rosterLoading?: boolean;
  onLoadRoster?: () => void;
}) {
  const total = summary?.total ?? 0;
  const [openBucket, setOpenBucket] = useState<OpenBucket>(null);

  // What this card is allowed to claim depends on TWO facts, not one:
  //   • does a roster exist?  → the cheap HEAD count (always available)
  //   • is it loaded here?    → `total`, which needs the ~28k-row paged read
  // Reading only the second is what made the card announce "no members yet" on
  // projects with a full roster. Each state below says only what is known.
  const rosterKnown = rosterCount !== null;
  const rosterEmpty = rosterKnown && rosterCount === 0;
  const rosterUnloaded = rosterKnown && (rosterCount ?? 0) > 0 && total === 0;

  // Members in the open bucket. Detailing buckets resolve via the summary's id
  // sets so the list always agrees with the chip counts (same engine, same
  // truth); fab buckets filter elements by fab_status directly (the query layer
  // already excludes deleted rows; the !is_deleted guard is belt-and-suspenders).
  const bucketMembers = useMemo(() => {
    if (!openBucket) return [];
    if (openBucket.kind === "fab") {
      const key = openBucket.key;
      return (elements || []).filter((el) => el?.id && !el.is_deleted && el.fab_status === key);
    }
    if (!summary) return [];
    const ids = new Set(summary.idsByStatus?.[openBucket.key] || []);
    return (elements || []).filter((el) => el?.id && ids.has(String(el.id)));
  }, [openBucket, summary, elements]);

  // Header meta for the open drill-down: fab buckets use FAB_STATUS_META,
  // detailing buckets use ELEMENT_STATUS_META. The member table columns are
  // status-agnostic, so only the header label/color differs.
  const openMeta = openBucket
    ? (openBucket.kind === "fab" ? FAB_STATUS_META[openBucket.key] : ELEMENT_STATUS_META[openBucket.key])
    : null;
  const fab = useMemo(() => summarizeFabStatus(elements || []), [elements]);

  return (
    <SectionCard
      title="3D model mapping"
      icon={Boxes}
      headerAction={
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Badge the COUNT, not the loaded array — it is true either way. */}
          {rosterKnown && (rosterCount ?? 0) > 0 && (
            <span className="sbd-badge-info">{(rosterCount ?? 0).toLocaleString()} members</span>
          )}
          <button className="sbd-btn sbd-btn-ghost" onClick={onImport} style={{ fontSize: 12 }}>
            Import member CSV
          </button>
        </div>
      }
    >
      <p style={{ margin: "0 0 12px", color: textMuted, fontSize: 12 }}>
        Steel members mapped to packages by piece mark — this drives the BIM viewer&apos;s status coloring.
      </p>

      {rosterCountLoading || !rosterKnown ? (
        <div style={{ fontFamily: mono, fontSize: 11, color: textMuted, padding: "6px 0" }}>
          Checking for model members…
        </div>
      ) : rosterEmpty ? (
        <EmptyState text="No model members yet — export a member/assembly report (CSV) from Tekla or SDS2 and import it to map the physical steel to packages, sequences, and RFIs." />
      ) : rosterUnloaded ? (
        // A roster EXISTS but is not loaded on this tab. Say exactly that and
        // offer to load it, rather than implying nothing has been imported.
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "4px 0" }}>
          <span style={{ fontFamily: mono, fontSize: 11, color: textMuted }}>
            {(rosterCount ?? 0).toLocaleString()} members imported · mapping not loaded
          </span>
          <button
            type="button"
            className="sbd-btn sbd-btn-ghost"
            onClick={onLoadRoster}
            disabled={rosterLoading || !onLoadRoster}
            style={{ fontSize: 12 }}
          >
            {rosterLoading ? "Loading members for mapping evidence…" : "Load mapping evidence"}
          </button>
          <span style={{ fontFamily: mono, fontSize: 9, color: textMuted }}>
            large rosters load on demand
          </span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 10, color: textPrimary, marginBottom: 4 }}>
              <span style={{ color: textMuted }}>Linked to detailing packages</span>
              <span className="sbd-num">{summary?.mappedPct ?? 0}%</span>
            </div>
            <div style={{ height: 7, borderRadius: 999, background: surface2, overflow: "hidden", border: `1px solid ${border}` }}>
              <div style={{ height: "100%", width: `${summary?.mappedPct ?? 0}%`, background: accent, boxShadow: `0 0 10px ${accent}` }} />
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {ELEMENT_BUCKET_ORDER.map((bucket) => {
              const count = summary?.counts?.[bucket] ?? 0;
              if (!count) return null;
              const meta = ELEMENT_STATUS_META[bucket];
              const active = openBucket?.kind === "detail" && openBucket.key === bucket;
              return (
                <button
                  key={bucket}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setOpenBucket(active ? null : { kind: "detail", key: bucket })}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "5px 10px", borderRadius: 999, cursor: "pointer",
                    border: `1px solid color-mix(in srgb, ${meta.color} ${active ? 85 : 45}%, transparent)`,
                    background: `color-mix(in srgb, ${meta.color} ${active ? 24 : 12}%, transparent)`,
                    fontFamily: mono, fontSize: 10, color: textPrimary,
                    outlineOffset: 2,
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: meta.color, flexShrink: 0 }} />
                  {meta.label}
                  <strong className="sbd-num" style={{ fontSize: 12 }}>{count}</strong>
                </button>
              );
            })}
          </div>

          {fab.total > 0 && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 10, color: textPrimary, marginBottom: 6 }}>
                <span style={{ color: textMuted }}>Fabrication status (from model)</span>
                <span className="sbd-num">{fab.pct}% tracked</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {FAB_STATUS_ORDER.map((s) => {
                  const count = fab.counts[s] || 0;
                  if (!count) return null;
                  const key = s as FabStatusKey;
                  const meta = FAB_STATUS_META[key];
                  const active = openBucket?.kind === "fab" && openBucket.key === key;
                  return (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setOpenBucket(active ? null : { kind: "fab", key })}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "5px 10px", borderRadius: 999, cursor: "pointer",
                        border: `1px solid color-mix(in srgb, ${meta.color} ${active ? 85 : 45}%, transparent)`,
                        background: `color-mix(in srgb, ${meta.color} ${active ? 24 : 12}%, transparent)`,
                        fontFamily: mono, fontSize: 10, color: textPrimary,
                        outlineOffset: 2,
                      }}
                    >
                      <span style={{ width: 9, height: 9, borderRadius: 2, background: meta.color, flexShrink: 0 }} />
                      {meta.label} <span aria-hidden="true">·</span> <strong className="sbd-num" style={{ fontSize: 12 }}>{count}</strong>
                    </button>
                  );
                })}
              </div>
              <div style={{ marginTop: 6, fontFamily: mono, fontSize: 9, color: textMuted }}>
                Color the model by these in the 3D Model tab → Fab mode.
              </div>
            </div>
          )}

          {openBucket && openMeta && (
            <div style={{ border: `1px solid ${border}`, borderRadius: 10, overflow: "hidden" }}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
                padding: "8px 12px", borderBottom: `1px solid ${border}`, background: surface1,
              }}>
                <div style={{ fontFamily: mono, fontSize: 10, color: textMuted, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  <span style={{ color: openMeta.color, fontWeight: 800 }}>{openMeta.label}</span>
                  {" · "}{pluralize(bucketMembers.length, "member")}
                  {bucketMembers.length > DRILLDOWN_ROW_CAP ? ` · showing first ${DRILLDOWN_ROW_CAP}` : ""}
                </div>
                <button
                  type="button"
                  onClick={() => setOpenBucket(null)}
                  className="sbd-btn sbd-btn-ghost"
                  style={{ fontSize: 11, padding: "2px 10px" }}
                >
                  Close
                </button>
              </div>
              <div style={{ maxHeight: 280, overflowY: "auto" }}>
                <table className="sbd-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ position: "sticky", top: 0, background: surface1, zIndex: 1 }}>
                      <th style={drillTh}>Mark</th>
                      <th style={drillTh}>Assembly</th>
                      <th style={drillTh}>Profile</th>
                      <th style={{ ...drillTh, textAlign: "right" }}>Qty</th>
                      <th style={drillTh}>Seq</th>
                      <th style={drillTh}>Area</th>
                      <th style={drillTh}>Drawing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bucketMembers.slice(0, DRILLDOWN_ROW_CAP).map((el) => (
                      <tr key={el.id}>
                        <td style={{ ...drillTd, fontWeight: 700, color: textPrimary }}>{el.piece_mark}</td>
                        <td style={drillTd}>{el.assembly_mark || "—"}</td>
                        <td style={{ ...drillTd, fontFamily: mono, fontSize: 11 }}>{el.profile || "—"}</td>
                        <td style={{ ...drillTd, textAlign: "right" }} className="sbd-num">{el.quantity ?? 1}</td>
                        <td style={drillTd}>{el.sequence_number || "—"}</td>
                        <td style={drillTd}>{el.erection_area || "—"}</td>
                        <td style={{ ...drillTd, color: el.drawing_id ? success : textMuted }}>
                          {el.drawing_no || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

const drillTh: CSSProperties = {
  textAlign: "left", padding: "7px 12px", fontFamily: "var(--font-mono)",
  fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase",
  color: textMuted, borderBottom: `1px solid ${border}`,
};
const drillTd: CSSProperties = { padding: "6px 12px", borderBottom: `1px solid ${border}`, color: "var(--text-secondary)" };

// ── Sequence Readiness rollup ───────────────────────────────────────────────
// The sequence-aware view: group packages by erection sequence and show how far
// each sequence's detailing has progressed + how many packages are fab/erection
// ready, so the schedule can pull detailing (design doc §7).

export function SequenceReadinessSection({ rows }: { rows: SequenceReadinessRow[] }) {
  return (
    <SectionCard
      title="Sequence readiness"
      headerAction={<span className="sbd-badge-info">{rows.length}</span>}
    >
      <p style={{ margin: "0 0 12px", color: textMuted, fontSize: 12 }}>
        Detailing progress + fab/erection readiness by erection sequence.
      </p>
      {rows.length === 0 || rows.every((r) => r.sequence === "Unsequenced") ? (
        // No REAL sequence exists yet — a lone "Unsequenced" bucket is just a dead
        // row, so show the actionable hint instead. Once at least one real
        // sequence exists the trailing Unsequenced bucket stays visible as an
        // exception (sorted last by computeSequenceReadiness).
        <EmptyState text="No packages linked to an erection sequence yet — set an Area / Sequence on the drawing set (or link a work package) to populate this." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((row) => (
            <div key={row.sequence} style={{
              display: "grid",
              gridTemplateColumns: "minmax(80px, 0.7fr) minmax(120px, 1.3fr) repeat(3, minmax(64px, 0.5fr))",
              gap: 10, alignItems: "center",
              padding: "10px 12px", borderRadius: 10,
              border: `1px solid ${row.atRiskCount ? "color-mix(in srgb, var(--status-warning) 46%, transparent)" : border}`,
              background: "var(--bg-surface-low)",
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: mono, fontSize: 9, color: textMuted, letterSpacing: "0.1em", textTransform: "uppercase" }}>Seq</div>
                <div style={{ color: textPrimary, fontWeight: 800, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.sequence}</div>
                <div style={{ color: textMuted, fontSize: 11 }}>{pluralize(row.packageCount, "pkg")}</div>
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 10, color: textPrimary, marginBottom: 4 }}>
                  <span style={{ color: textMuted }}>Detailing</span>
                  <span className="sbd-num">{row.detailingPct}%</span>
                </div>
                <div style={{ height: 7, borderRadius: 999, background: surface2, overflow: "hidden", border: `1px solid ${border}` }}>
                  <div style={{ height: "100%", width: `${row.detailingPct}%`, background: accent, boxShadow: `0 0 10px ${accent}` }} />
                </div>
              </div>
              <SeqMetric label="Fab" value={`${row.fabReadyCount}/${row.packageCount}`} tone={row.fabReadyCount === row.packageCount ? success : textMuted} />
              <SeqMetric label="Erect" value={`${row.erectionReadyCount}/${row.packageCount}`} tone={row.erectionReadyCount === row.packageCount ? success : textMuted} />
              <SeqMetric label="At risk" value={row.atRiskCount} tone={row.atRiskCount ? warning : success} />
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ── Revision Impact Tracker ─────────────────────────────────────────────────
// Revisions that landed on sheets already moving downstream (fabricated /
// delivered / in field) — the rework / change-order exposure (design doc §7).


export function RevisionImpactSection({ rows, onCompare }: { rows: RevisionImpactViewRow[]; onCompare?: (drawingId: string) => void }) {
  const shown = (rows || []).slice(0, 8);
  return (
    <SectionCard
      title="Revision impact"
      headerAction={<span className="sbd-badge-info">{rows?.length || 0}</span>}
    >
      <p style={{ margin: "0 0 12px", color: textMuted, fontSize: 12 }}>
        Revisions that landed on steel already moving downstream (rework / CO risk).
      </p>
      {shown.length === 0 ? (
        <EmptyState text="No change-revisions on tracked sheets, or none with downstream exposure." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {shown.map((r) => {
            // Two very different states hide behind "nothing reached": the sheet
            // carries downstream dates and none has landed (genuinely pre-fab),
            // or it carries none at all (we simply don't know). Only the first
            // earns "caught pre-fab".
            const noneReached = !r.fabricated && !r.delivered && !r.inField;
            const caughtPreFab = noneReached && r.downstreamKnown === true;
            const downstreamUnknown = noneReached && r.downstreamKnown !== true;
            const pillTone = r.severity === "critical" || r.severity === "high" ? "danger"
              : r.severity === "medium" ? "review" : "neutral";
            return (
              <div key={r.revisionId} style={{
                display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(150px, 1fr) auto", gap: 12, alignItems: "center",
                padding: "10px 12px", borderRadius: 10,
                border: `1px solid ${r.severity === "critical" ? "color-mix(in srgb, var(--status-error) 56%, transparent)" : border}`,
                background: "var(--bg-surface-low)",
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: textPrimary, fontWeight: 800, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {(r.sheetNumber || "—")} · {r.revisionCode}
                  </div>
                  <div style={{ color: textMuted, fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.drawingSetName || "Unassigned set"}{r.issuedAt ? ` · ${fmtDate(r.issuedAt)}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {r.fabricated && <ReadyChip ok={false} label="Fabricated" bad />}
                  {r.delivered && <ReadyChip ok={false} label="Delivered" bad />}
                  {r.inField && <ReadyChip ok={false} label="In field" bad />}
                  {caughtPreFab && <span style={{ color: textMuted, fontFamily: mono, fontSize: 10 }}>caught pre-fab</span>}
                  {downstreamUnknown && (
                    <span
                      style={{ color: warning, fontFamily: mono, fontSize: 10 }}
                      title="No fabrication, delivery, or install date is recorded on this sheet, so its downstream state can't be determined."
                    >
                      downstream unknown
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {onCompare && r.drawingId && (
                    <button
                      type="button"
                      className="sbd-btn-ghost"
                      onClick={() => onCompare(String(r.drawingId))}
                      title="Overlay-compare this revision against the prior one"
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, minHeight: 30, padding: "4px 9px", fontFamily: mono, fontSize: 9, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}
                    >
                      <GitCompareArrows size={12} /> Compare
                    </button>
                  )}
                  <StatusPill tone={pillTone}>{r.severity}</StatusPill>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

// ── Backward schedule + readiness panel ─────────────────────────────────────

const SCHEDULE_ROWS: Array<[string, string]> = [
  ["detailingStart", "Detailing start"],
  ["internalReviewDue", "Internal review"],
  ["submitBy", "Submit by"],
  ["approvalNeededBy", "Approval by"],
  ["fabReleaseRequiredBy", "Fab release by"],
  ["erectionReleaseRequiredBy", "Erection release by"],
];

interface ReadinessPanelProps {
  readiness: DetailingReadiness;
  onToggle: (field: "material_impacted" | "long_lead_impact", value: boolean) => void;
  disabled: boolean;
}

export function ReadinessPanel({ readiness, onToggle, disabled }: ReadinessPanelProps) {
  const {
    backwardDates = {}, scheduleRisk = {}, fabricationReady, erectionReady,
    rfiBlocked, revisionImpacted, materialImpacted, longLeadImpact, prioritySequence,
  } = readiness || {};
  const riskTone = scheduleRisk.severity === "critical" ? error : scheduleRisk.severity === "at_risk" ? warning : success;
  const riskLabel = scheduleRisk.severity === "critical"
    ? `Critical · ${scheduleRisk.daysLate}d`
    : scheduleRisk.severity === "at_risk" ? `At risk · ${scheduleRisk.daysLate}d` : "On track";
  const hasSchedule = SCHEDULE_ROWS.some(([k]) => backwardDates[k]);

  return (
    <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: surface1, border: `1px solid ${border}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <div style={{ fontFamily: mono, fontSize: 8, color: textMuted, letterSpacing: "0.12em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 5 }}>
          <CalendarClock size={10} /> Schedule &amp; readiness
        </div>
        <span title={(scheduleRisk.reasons || []).join("; ") || "On track"} style={{
          fontFamily: mono, fontSize: 9, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase",
          color: riskTone, padding: "2px 8px", borderRadius: 999,
          background: `color-mix(in srgb, ${riskTone} 16%, transparent)`,
          border: `1px solid color-mix(in srgb, ${riskTone} 42%, transparent)`,
        }}>
          {riskLabel}
        </span>
      </div>

      {hasSchedule ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 12px", marginBottom: 10 }}>
          {SCHEDULE_ROWS.map(([k, label]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontFamily: mono, fontSize: 10 }}>
              <span style={{ color: textMuted }}>{label}</span>
              <span style={{ color: backwardDates[k] ? textPrimary : textMuted }}>
                {backwardDates[k] ? fmtDate(backwardDates[k]) : "TBD"}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: textMuted, marginBottom: 10, lineHeight: 1.4 }}>
          Link a work package with an erection date to compute the backward schedule.
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        <ReadyChip ok={!!fabricationReady} label="Fab ready" />
        <ReadyChip ok={!!erectionReady} label="Erect ready" />
        {rfiBlocked && <ReadyChip ok={false} label="RFI blocked" bad />}
        {revisionImpacted && <ReadyChip ok={false} label="Rev impacted" bad />}
        {prioritySequence && <ReadyChip ok label="Seq" neutral />}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <FlagToggle label="Material impacted" active={!!materialImpacted} disabled={disabled} onClick={() => onToggle("material_impacted", !materialImpacted)} />
        <FlagToggle label="Long-lead impact" active={!!longLeadImpact} disabled={disabled} onClick={() => onToggle("long_lead_impact", !longLeadImpact)} />
      </div>
    </div>
  );
}



