/**
 * DetailPanel — the 460px right-side panel that shows the selected
 * RFI in full. Header with title + status/priority/BIC pills, workflow
 * status chips (click to transition), grid of meta fields, question
 * box, response box (or "Awaiting response"), ball-in-court chooser,
 * optional description + impact flags, then Edit / Delete footer.
 *
 * Empty state when `rfi` is null.
 *
 * Callbacks:
 *   onClose()        — clear selection
 *   onUpdate(data)   — call updateMut with { id: rfi.id, data }
 *   onEdit()         — open RFI form modal in edit mode
 *   onDelete()       — open delete confirm dialog
 */

import React from "react";
import { parseUTCDate } from "@/components/shared/formatters";
import { mono, BIC_COLORS, BIC_PARTIES, PRIORITY_CFG, STATUS_CFG, statusColumns } from "./constants";
import { isOverdue } from "./utils";
import { Pill, Section, Meta, ContentBox } from "./subcomponents";
import CommentThread from "@/components/collaboration/CommentThread";

export default function DetailPanel({ rfi, projectName, onClose, onUpdate, onEdit, onDelete }) {
  return (
    <div style={{ width: 460, flexShrink: 0, borderLeft: "1px solid var(--divider)", display: "flex", flexDirection: "column", background: "var(--bg-surface)" }}>
      {!rfi ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8, color: "var(--text-muted)" }}>
          <div style={{ fontSize: 32 }}>◆</div>
          <div style={{ ...mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" }}>Select an RFI</div>
          <div style={{ fontSize: 9 }}>Click any row to view details</div>
        </div>
      ) : (
        <>
          {/* Header */}
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--divider)", background: "var(--bg-surface-low)", flexShrink: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...mono, fontSize: 12, fontWeight: 800, color: "var(--accent)", letterSpacing: "0.08em" }}>{rfi.rfi_number}</div>
                <div style={{ fontFamily: "Space Grotesk, var(--font-display)", fontSize: 16, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1.3, letterSpacing: "-0.01em" }}>{rfi.title}</div>
                <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 4 }}>{projectName || "—"}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  <Pill label={rfi.status} color={(STATUS_CFG[rfi.status] || STATUS_CFG.Open).color} bg={(STATUS_CFG[rfi.status] || STATUS_CFG.Open).bg} />
                  <Pill label={rfi.priority} color={(PRIORITY_CFG[rfi.priority] || PRIORITY_CFG.Medium).color} bg={(PRIORITY_CFG[rfi.priority] || PRIORITY_CFG.Medium).bg} />
                  {isOverdue(rfi) && (
                    <span style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--status-error)" }}>
                      ⚠ {Math.abs(Math.ceil((parseUTCDate(rfi.date_required) - new Date()) / 86400000))}d overdue
                    </span>
                  )}
                  <Pill
                    label={rfi.ball_in_court || "Contractor"}
                    color={(BIC_COLORS[rfi.ball_in_court || "Contractor"] || BIC_COLORS.Contractor).text}
                    bg={(BIC_COLORS[rfi.ball_in_court || "Contractor"] || BIC_COLORS.Contractor).bg}
                  />
                </div>
              </div>
              <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 20, marginLeft: 10 }}>×</button>
            </div>
            {(rfi.cost_impact || rfi.schedule_impact) && (
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                {rfi.cost_impact && (
                  <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--status-warning)", background: "var(--warning-muted)", border: "1px solid var(--warning-border)", padding: "4px 8px", borderRadius: 4 }}>
                    $ COST IMPACT: ${rfi.cost_impact_amount || "—"}
                  </div>
                )}
                {rfi.schedule_impact && (
                  <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--status-error)", background: "var(--danger-muted)", border: "1px solid var(--danger-border)", padding: "4px 8px", borderRadius: 4 }}>
                    ⏱ SCHEDULE: {rfi.schedule_impact_days || 0}d
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Workflow chips */}
          <div style={{ padding: "10px 20px", borderBottom: "1px solid var(--divider)", background: "var(--bg-surface)" }}>
            <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>Workflow</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 6 }}>
              {statusColumns.map((s) => {
                const active = rfi.status === s;
                const past = statusColumns.indexOf(rfi.status) > statusColumns.indexOf(s);
                const bg = active ? "var(--accent)" : past ? "var(--success-muted)" : "var(--bg-surface-low)";
                const color = active ? "var(--accent-text)" : past ? "var(--status-success)" : "var(--text-secondary)";
                return (
                  <button
                    key={s}
                    onClick={() => onUpdate({ status: s, ...(s === "Answered" || s === "Closed" ? { date_answered: new Date().toISOString().split("T")[0] } : {}) })}
                    style={{ padding: "6px 8px", borderRadius: 4, border: "1px solid var(--border-default)", background: bg, color, ...mono, fontSize: 9, fontWeight: 700, cursor: "pointer" }}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scrollable body */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
            <Section title="Meta">
              <Meta label="Submitted By"   value={rfi.submitted_by} />
              <Meta label="Submitted Date" value={rfi.submitted_date} />
              <Meta label="Date Required"  value={rfi.date_required} highlight={isOverdue(rfi)} />
              <Meta label="Date Answered"  value={rfi.date_answered} />
              <Meta label="Drawing Ref"    value={rfi.drawing_reference} />
              <Meta label="Spec Section"   value={rfi.spec_section} />
              <Meta label="Assigned To"    value={rfi.assigned_to} />
              <Meta label="Answered By"    value={rfi.answered_by} />
              <Meta label="Distribution"   value={rfi.distribution_list} span2 />
            </Section>

            <Section title="Question / Issue">
              <ContentBox accent>{rfi.question || <i style={{ color: "var(--text-muted)" }}>No question text recorded.</i>}</ContentBox>
            </Section>

            <Section title="Response">
              {rfi.answer ? (
                <>
                  <ContentBox success>{rfi.answer}</ContentBox>
                  <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>
                    Answered by {rfi.answered_by || "—"} on {rfi.date_answered || "—"}
                  </div>
                </>
              ) : (
                <div style={{ background: "var(--warning-muted)", border: "1px solid var(--warning-border)", padding: "10px 12px", borderRadius: 4, ...mono, fontSize: 9, color: "var(--status-warning)" }}>
                  ⏱ Awaiting response
                </div>
              )}
            </Section>

            <Section title="Ball in Court">
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {BIC_PARTIES.map((p) => {
                  const cfg = BIC_COLORS[p] || BIC_COLORS.Contractor;
                  const active = rfi.ball_in_court === p;
                  return (
                    <button
                      key={p}
                      onClick={() => onUpdate({ ball_in_court: p })}
                      style={{
                        ...mono,
                        fontSize: 8,
                        fontWeight: 700,
                        padding: "6px 10px",
                        borderRadius: 4,
                        border: active ? `1px solid ${cfg.text}` : "1px solid var(--border-default)",
                        background: active ? cfg.bg : "var(--bg-surface)",
                        color: active ? cfg.text : "var(--text-secondary)",
                        cursor: "pointer",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </Section>

            {rfi.description && (
              <Section title="Description">
                <ContentBox>{rfi.description}</ContentBox>
              </Section>
            )}

            {(rfi.cost_impact || rfi.schedule_impact) && (
              <Section title="Impact Flags">
                {rfi.cost_impact && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ ...mono, fontSize: 8, background: "var(--warning-muted)", border: "1px solid var(--warning-border)", padding: "4px 8px", borderRadius: 4, color: "var(--status-warning)", fontWeight: 700 }}>$ Cost Impact</span>
                    <span style={{ ...mono, fontSize: 10, color: "var(--text-primary)" }}>${rfi.cost_impact_amount || "—"}</span>
                  </div>
                )}
                {rfi.schedule_impact && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ ...mono, fontSize: 8, background: "var(--danger-muted)", border: "1px solid var(--danger-border)", padding: "4px 8px", borderRadius: 4, color: "var(--status-error)", fontWeight: 700 }}>⏱ Schedule</span>
                    <span style={{ ...mono, fontSize: 10, color: "var(--text-primary)" }}>{rfi.schedule_impact_days || 0} days</span>
                  </div>
                )}
              </Section>
            )}

            {/* Threaded conversation — realtime across all users viewing
                this RFI. Lives on `comments` table with entity_type='rfi'. */}
            <Section title="Discussion">
              <div style={{ height: 320 }}>
                <CommentThread
                  entityType="rfi"
                  entityId={rfi.id}
                  projectId={rfi.project_id}
                  compact
                />
              </div>
            </Section>
          </div>

          {/* Footer actions */}
          <div style={{ padding: "12px 20px", borderTop: "1px solid var(--divider)", background: "var(--bg-surface-low)", display: "flex", gap: 8, flexShrink: 0 }}>
            <button
              onClick={onEdit}
              style={{ flex: 1, background: "var(--accent)", color: "var(--accent-text)", border: "none", borderRadius: 4, padding: "10px 12px", ...mono, fontSize: 10, fontWeight: 700, cursor: "pointer", letterSpacing: "0.08em" }}
            >
              Edit Full RFI
            </button>
            <button
              onClick={onDelete}
              style={{ background: "var(--bg-surface)", border: "1px solid rgba(255,61,61,0.25)", color: "var(--status-error)", borderRadius: 4, padding: "10px 12px", ...mono, fontSize: 10, fontWeight: 700, cursor: "pointer" }}
            >
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}
