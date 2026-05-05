/**
 * WbsBuilderModal — scope-of-work → WBS wizard.
 *
 * Flow:
 *   1. INPUT    — user pastes their scope, picks a start date
 *   2. PREVIEW  — parser + builder render a phase-grouped task list;
 *                 user can delete rows or edit durations inline
 *   3. SAVE     — bulk insert schedule_tasks via base44.entities,
 *                 invalidate the Schedule query, toast "N tasks added"
 *
 * Phase containment: the UI groups tasks by the canonical PHASES
 * array from utils/phases.js. The builder already guards against
 * non-canonical phases at module load; this modal additionally
 * calls validateWbsPhases() before enabling the Save button so a
 * user-tweaked preview can't sneak an invalid phase into the DB.
 *
 * The modal is deliberately self-contained: no navigation, no
 * side-effects besides the insert. If the user hits ESC mid-draft,
 * nothing persists.
 */

import React, { useMemo, useState, useRef } from "react";
import { X, Sparkles, Play, Check, AlertTriangle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { invalidateEntity } from "@/services/cacheRegistry";
import { PHASES, PHASE_COLORS } from "@/utils/phases";
import {
  parseScope,
  buildWbs,
  validateWbsPhases,
} from "@/lib/wbsBuilder";

const mono    = { fontFamily: "var(--font-mono)" };
const display = { fontFamily: "'Space Grotesk', var(--font-display)" };
const AI      = "var(--ai-accent, #22D3EE)";

// Quick-pick scope starters. The first two show the bid-style format
// (numbered, drawing-refs preserved) — that's the richer of the two
// input modes. The short category list still works and is kept for
// users who just want a quick scope-to-schedule mapping.
const EXAMPLES = [
  {
    label: "Bid-style base bid",
    text:  [
      "1. SC1 columns per P-S1.010 and P-S1.011",
      "2. W27x84 beams per P-S1.012 and P-S1.013",
      "3. Canopy per P-S1.012 and P-S1.013 ref detail 308",
      "4. Ledger at canopies ref detail 305",
      "5. Elevator spreader beams per P-S1.015",
      "6. Elevator spreader columns full height per keynote 107/P-S1.015",
      "7. Elevator hoist beams per 4/P-S1.015",
      "8. North Stair A and B per PA6.001A and PA6.003 ref P-S6.001",
      "8a. Railing per details on PA8.005A",
      "9. Moment Frame - Grid Line A per detail S1/P-S2.005",
      "10. X-Brace at North Bay per detail 301/P-S2.006",
      "11. Bollards per detail 5/PA8.002",
      "12. Bike Racks per keynote 7/PA1.101A",
      "13. Shear Studs - Level 2 Composite Beams per detail 704/P-S3.005",
      "14. Floor Deck - Level 2 Composite Deck per detail 701/P-S3.003",
      "15. RTU Dunnage Framing - Roof Level per detail 603/P-S5.004",
    ].join("\n"),
  },
  {
    label: "Two-building school (bid-style)",
    text:  [
      "1. Anchor Bolts - Bldg. 1 & 2",
      "2. Embed Plates - Bldg. 1",
      "3. Embed Plates - Bldg. 2",
      "4. Main Steel Frame - Bldg. 1",
      "5. Main Steel Frame - Bldg. 2",
      "6. North Stair A - Bldg. 1 ref P-S6.001",
      "6a. Railing per PA8.005A",
      "7. South Stair B - Bldg. 2 ref P-S6.001",
      "7a. Railing per PA8.005A",
      "8. Site Misc - Bldg. 1 & 2",
    ].join("\n"),
  },
  {
    label: "Short category list",
    text:  "Anchor Bolts - Bldg. 1\nPanel Embeds - Bldg. 1\nMain Steel - Bldg. 1\nStairs - Bldg. 1\nRailings - Bldg. 1\nJoists / Deck - Bldg. 1\nLadders - Bldg. 1\nSite Misc - Bldg. 1",
  },
  {
    label: "Canopy retrofit",
    text:  "1. Entry Canopy\n2. Railings\n3. Misc Steel",
  },
];

export default function WbsBuilderModal({ open, projectId, onClose, onSaved }) {
  const qc = useQueryClient();
  const taRef = useRef(null);

  const [step, setStep]           = useState("input"); // "input" | "preview" | "saving" | "done"
  const [scopeText, setScopeText] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [removed, setRemoved]     = useState(new Set()); // wbs_codes user toggled off
  const [savedCount, setSavedCount] = useState(0);
  const [err, setErr]             = useState(null);

  // Run the parser every render — cheap enough for interactive feel,
  // means the summary chips and the disabled state stay in sync with
  // whatever's typed. Null input yields empty results safely.
  const parsed = useMemo(() => parseScope(scopeText), [scopeText]);
  const wbs = useMemo(
    () => buildWbs(parsed, { startDate }),
    [parsed, startDate],
  );

  // Filter out user-removed rows for both preview + save.
  const kept = useMemo(
    () => wbs.tasks.filter((t) => !removed.has(t.wbs_code)),
    [wbs, removed],
  );
  const validation = useMemo(() => validateWbsPhases(kept), [kept]);

  // Group kept tasks by canonical phase. This is the containment
  // affordance the user asked for — every task is filed under one
  // of the PHASES headings, and a phase with zero tasks simply
  // doesn't render. We never manufacture phase headings outside the
  // canonical list.
  const byPhase = useMemo(() => {
    const out = {};
    for (const p of PHASES) out[p] = [];
    for (const t of kept) {
      if (!out[t.phase]) continue; // validateWbsPhases catches this too
      out[t.phase].push(t);
    }
    return out;
  }, [kept]);

  // Forecast — one rollup row per source scope item (grouped by
  // _scopeGroupIndex). For each item we surface the earliest start,
  // the latest finish, and the working-day span across its four
  // phase rows. The project-level summary picks the latest finish
  // across all items. These numbers come from the builder's default
  // per-scope-type durations; the wording in the UI calls them
  // "rough estimates" so PMs treat them as a starting point rather
  // than a contractual schedule.
  const forecast = useMemo(() => buildForecast(kept), [kept]);

  if (!open) return null;

  const reset = () => {
    setStep("input"); setScopeText(""); setRemoved(new Set());
    setSavedCount(0); setErr(null);
  };

  const handleExample = (txt) => { setScopeText(txt); setTimeout(() => taRef.current?.focus(), 0); };

  const handleBuild = () => {
    setErr(null);
    if (parsed.items.length === 0) {
      setErr("Nothing recognized yet — try listing items like “Anchor Bolts - Bldg. 1”, “Main Steel - Bldg. 2”, “Stairs”, etc.");
      return;
    }
    if (!validation.ok) {
      setErr(`Internal: ${validation.violations[0]}`);
      return;
    }
    setStep("preview");
  };

  const toggleRow = (wbsCode) => {
    setRemoved((prev) => {
      const next = new Set(prev);
      if (next.has(wbsCode)) next.delete(wbsCode);
      else next.add(wbsCode);
      return next;
    });
  };

  const handleSave = async () => {
    if (!projectId) { setErr("Select a project first."); return; }
    if (kept.length === 0) { setErr("Nothing to save — all rows are excluded."); return; }
    if (!validation.ok)    { setErr(`Blocked by phase validation: ${validation.violations[0]}`); return; }
    setStep("saving");
    setErr(null);
    try {
      // Two-pass: insert tasks first (without dependencies), then
      // UPDATE each task that has a dependsOn wbs to set its
      // `dependencies` column to [predecessor_id]. PostgREST doesn't
      // defer FKs, and task_dependencies live elsewhere, so the
      // simplest reliable path is inserts-then-update.
      const payload = kept.map((t) => {
        // Preserve the scope source + drawing/detail refs in metadata
        // so the Task Detail Drawer can surface them later and auto-
        // extracted refs aren't lost if the user edits the task_name.
        const drawingRefs = t._drawingRefs || [];
        const detailRefs  = t._detailRefs  || [];
        const sourceText  = t._sourceText  || null;
        const meta = {};
        if (drawingRefs.length) meta.drawing_refs = drawingRefs;
        if (detailRefs.length)  meta.detail_refs  = detailRefs;
        if (sourceText)         meta.scope_source = sourceText;
        if (t._scopeTypeKey)    meta.scope_type   = t._scopeTypeKey;
        return {
          project_id:       projectId,
          task_name:        t.task_name,
          phase:            t.phase,
          wbs_code:         t.wbs_code,
          start_date:       t.start_date,
          end_date:         t.end_date,
          duration:         t.duration,
          status:           "Not Started",
          percent_complete: 0,
          ...(Object.keys(meta).length ? { metadata: meta } : {}),
        };
      });
      // Insert sequentially via the entity client — bulk is nicer but
      // the entity-client abstracts it per-row and we already use the
      // same pattern in BulkAddTaskModal.
      const created = [];
      for (const row of payload) {
         
        const row2 = await base44.entities.ScheduleTask.create(row);
        created.push(row2);
      }
      // Resolve dependsOn wbs → real id, then update. Silent on per-
      // row failures so one bad link doesn't erase a whole successful
      // insert pass — the user can wire deps manually in the detail
      // drawer later.
      const idByWbs = new Map(created.map((r) => [r.wbs_code, r.id]));
      for (const t of kept) {
        if (!t.depends_on_wbs) continue;
        const taskId = idByWbs.get(t.wbs_code);
        const depId  = idByWbs.get(t.depends_on_wbs);
        if (!taskId || !depId) continue;
        try {
           
          await base44.entities.ScheduleTask.update(taskId, {
            dependencies: JSON.stringify([depId]),
          });
        } catch { /* advisory */ }
      }

      setSavedCount(created.length);
      // Use the registry so every cache that reads schedule tasks
       // (Schedule, GanttChart, LookAhead, Command Center, etc.) lights
       // up at once instead of just the project-scoped key.
      invalidateEntity(qc, "schedule_task", projectId);
      toast.success(`WBS created — ${created.length} tasks added to the schedule`);
      setStep("done");
      onSaved?.(created.length);
      setTimeout(() => { reset(); onClose(); }, 1500);
    } catch (e) {
      setErr(e?.message || String(e));
      setStep("preview");
    }
  };

  // ── Render ────────────────────────────────────────────────────────
  const scopeItemCount = parsed.items.length;
  // Generics are classified but not recognized as a specific type —
  // we surface them so the user can refine ambiguous lines. The old
  // `unmatched` list is no longer produced by the parser (every line
  // classifies into SOMETHING via the classifier fallback).
  const genericLines = parsed.items.filter((i) => i.typeKey === "generic");
  const unmatchedCount = genericLines.length;

  return (
    <>
      <div
        onClick={() => { if (step !== "saving") onClose(); }}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 1200 }}
      />
      <div
        style={{
          position: "fixed",
          top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: 940, maxWidth: "96vw", maxHeight: "92vh",
          background: "var(--bg-surface-secondary)",
          border: "1px solid var(--border-default)",
          borderLeft: `3px solid ${AI}`,
          borderRadius: 4,
          zIndex: 1201,
          display: "flex", flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid var(--divider)",
            display: "flex", alignItems: "center", gap: 12,
            flexShrink: 0,
          }}
        >
          <Sparkles size={16} color={AI} />
          <div style={{ flex: 1 }}>
            <div style={{ ...display, fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
              WBS Builder
            </div>
            <div style={{ ...mono, fontSize: 9, color: AI, letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 2 }}>
              {step === "input"   && "STEP 1 · SCOPE"}
              {step === "preview" && `STEP 2 · PREVIEW · ${kept.length} TASKS ACROSS ${Object.values(byPhase).filter((g) => g.length > 0).length} PHASES`}
              {step === "saving"  && "STEP 3 · SAVING"}
              {step === "done"    && "DONE"}
            </div>
          </div>
          <button
            onClick={() => { if (step !== "saving") onClose(); }}
            disabled={step === "saving"}
            aria-label="Close"
            style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {step === "input" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                Describe the scope — one item per line
              </div>
              <textarea
                ref={taRef}
                value={scopeText}
                onChange={(e) => setScopeText(e.target.value)}
                autoFocus
                rows={10}
                spellCheck="false"
                placeholder={"Anchor Bolts - Bldg. 1 & 2\nMain Steel - Bldg. 1\nStairs & Railings - Bldg. 1\nJoists / Deck - Bldg. 1\nSite Misc"}
                style={{
                  padding: "10px 12px",
                  fontFamily: "var(--font-mono)", fontSize: 12,
                  lineHeight: 1.5,
                  background: "var(--bg-page)",
                  border: "1px solid var(--border-default)",
                  borderRadius: 3,
                  color: "var(--text-primary)",
                  resize: "vertical",
                }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  Examples:
                </span>
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex.label}
                    onClick={() => handleExample(ex.text)}
                    style={{
                      ...mono, fontSize: 10, letterSpacing: "0.06em",
                      padding: "4px 10px",
                      background: "transparent",
                      color: AI,
                      border: `1px dashed ${AI}`,
                      borderRadius: 3,
                      cursor: "pointer",
                    }}
                  >
                    {ex.label}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                <label style={{ ...mono, fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Start date
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    style={{
                      marginLeft: 8, padding: "4px 8px",
                      fontFamily: "var(--font-mono)", fontSize: 11,
                      background: "var(--bg-page)",
                      border: "1px solid var(--border-default)",
                      borderRadius: 2,
                      color: "var(--text-primary)",
                    }}
                  />
                </label>
                <span style={{ ...mono, fontSize: 10, color: scopeItemCount > 0 ? "var(--status-success)" : "var(--text-muted)" }}>
                  <span className="sbd-num">{scopeItemCount}</span> scope item{scopeItemCount === 1 ? "" : "s"} recognized → <span className="sbd-num">{wbs.tasks.length}</span> task{wbs.tasks.length === 1 ? "" : "s"} across <span className="sbd-num">{Object.values(wbs.summary.tasksByPhase || {}).filter(Boolean).length}</span> phase{Object.values(wbs.summary.tasksByPhase || {}).filter(Boolean).length === 1 ? "" : "s"}
                </span>
                {unmatchedCount > 0 && (
                  <span style={{ ...mono, fontSize: 10, color: "var(--status-warning)" }}>
                    <AlertTriangle size={10} style={{ verticalAlign: "text-bottom", marginRight: 4 }} />
                    {unmatchedCount} line{unmatchedCount === 1 ? "" : "s"} classified as generic — review below
                  </span>
                )}
              </div>
              {unmatchedCount > 0 && (
                <div
                  style={{
                    padding: "8px 12px",
                    background: "color-mix(in srgb, var(--status-warning) 6%, transparent)",
                    border: "1px solid var(--status-warning)",
                    borderRadius: 3,
                    maxHeight: 100, overflowY: "auto",
                  }}
                >
                  <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--status-warning)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
                    Generic items (no specific type matched)
                  </div>
                  {genericLines.map((it, i) => (
                    <div key={i} style={{ ...mono, fontSize: 11, color: "var(--text-muted)" }}>
                      · {it.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === "preview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {forecast.items.length > 0 && (
                <ForecastBlock forecast={forecast} startDate={startDate} />
              )}
              <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                Tasks will be filed under the canonical project phases only
              </div>
              {PHASES.map((phase) => {
                const rows = byPhase[phase] || [];
                if (rows.length === 0) return null;
                const color = PHASE_COLORS[phase] || "var(--accent)";
                return (
                  <div
                    key={phase}
                    style={{
                      border: `1px solid ${color}`,
                      borderRadius: 3,
                      overflow: "hidden",
                      background: `color-mix(in srgb, ${color} 5%, transparent)`,
                    }}
                  >
                    <div
                      style={{
                        padding: "6px 10px",
                        background: `color-mix(in srgb, ${color} 14%, transparent)`,
                        borderBottom: `1px solid ${color}`,
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                      }}
                    >
                      <div style={{ ...mono, fontSize: 10, fontWeight: 800, color, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                        {phase}
                      </div>
                      <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
                        {rows.length} task{rows.length === 1 ? "" : "s"}
                      </div>
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                      <thead>
                        <tr style={{ background: "var(--bg-surface-low)" }}>
                          {["WBS", "Task", "Start", "Finish", "Dur", "Deps", ""].map((h) => (
                            <th key={h} style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", padding: "6px 8px", textAlign: "left", borderBottom: "1px solid var(--divider)", whiteSpace: "nowrap" }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((t) => {
                          const refs = [...(t._drawingRefs || []), ...(t._detailRefs || [])];
                          return (
                            <tr key={t.wbs_code} style={{ borderBottom: "1px solid var(--divider)" }}>
                              <td className="sbd-num" style={{ ...mono, fontSize: 10, color, padding: "5px 8px", whiteSpace: "nowrap", verticalAlign: "top" }}>{t.wbs_code}</td>
                              <td style={{ padding: "5px 8px", verticalAlign: "top" }}>
                                <div>{t.task_name}</div>
                                {refs.length > 0 && (
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 3 }}>
                                    {refs.map((r, i) => (
                                      <span
                                        key={i}
                                        title="Drawing / detail reference extracted from the scope line"
                                        style={{
                                          ...mono,
                                          fontSize: 9,
                                          padding: "1px 5px",
                                          background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                                          color: "var(--accent)",
                                          border: "1px solid color-mix(in srgb, var(--accent) 35%, transparent)",
                                          borderRadius: 2,
                                          letterSpacing: "0.04em",
                                        }}
                                      >
                                        {r}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="sbd-num" style={{ ...mono, fontSize: 10, color: "var(--text-muted)", padding: "5px 8px", whiteSpace: "nowrap", verticalAlign: "top" }}>{t.start_date}</td>
                              <td className="sbd-num" style={{ ...mono, fontSize: 10, color: "var(--text-muted)", padding: "5px 8px", whiteSpace: "nowrap", verticalAlign: "top" }}>{t.end_date}</td>
                              <td className="sbd-num" style={{ ...mono, fontSize: 10, padding: "5px 8px", whiteSpace: "nowrap", verticalAlign: "top" }}>{t.duration}d</td>
                              <td className="sbd-num" style={{ ...mono, fontSize: 10, color: "var(--text-muted)", padding: "5px 8px", whiteSpace: "nowrap", verticalAlign: "top" }}>{t.depends_on_wbs || "—"}</td>
                              <td style={{ padding: "5px 8px", textAlign: "right", verticalAlign: "top" }}>
                                <button
                                  onClick={() => toggleRow(t.wbs_code)}
                                  title="Exclude this row"
                                  style={{ ...mono, fontSize: 9, padding: "2px 6px", background: "transparent", border: "1px solid var(--divider)", borderRadius: 2, color: "var(--text-muted)", cursor: "pointer" }}
                                >
                                  REMOVE
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
              {removed.size > 0 && (
                <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>
                  {removed.size} row{removed.size === 1 ? "" : "s"} excluded ·{" "}
                  <button
                    onClick={() => setRemoved(new Set())}
                    style={{ background: "transparent", border: "none", color: AI, cursor: "pointer", padding: 0, ...mono, fontSize: 10, textDecoration: "underline" }}
                  >
                    restore all
                  </button>
                </div>
              )}
              {wbs.summary?.rejected > 0 && (
                <div style={{ ...mono, fontSize: 10, color: "var(--status-warning)" }}>
                  <AlertTriangle size={10} style={{ verticalAlign: "text-bottom", marginRight: 4 }} />
                  {wbs.summary.rejected} task{wbs.summary.rejected === 1 ? "" : "s"} dropped by phase validation
                </div>
              )}
            </div>
          )}

          {step === "saving" && (
            <div style={{ textAlign: "center", padding: "48px 20px", ...mono, fontSize: 12, color: AI }}>
              ● SAVING {kept.length} TASKS…
            </div>
          )}

          {step === "done" && (
            <div style={{ textAlign: "center", padding: "48px 20px" }}>
              <Check size={32} color="var(--status-success)" style={{ marginBottom: 10 }} />
              <div style={{ ...mono, fontSize: 12, color: "var(--status-success)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                {savedCount} task{savedCount === 1 ? "" : "s"} added
              </div>
            </div>
          )}

          {err && (
            <div
              style={{
                marginTop: 12,
                padding: "8px 12px",
                border: "1px solid var(--status-error)",
                background: "color-mix(in srgb, var(--status-error) 10%, transparent)",
                color: "var(--status-error)",
                ...mono, fontSize: 11,
              }}
            >
              {err}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid var(--divider)",
            display: "flex", gap: 10, justifyContent: "flex-end",
            flexShrink: 0,
          }}
        >
          {step === "input" && (
            <>
              <button onClick={onClose} style={btnGhost}>CANCEL</button>
              <button
                onClick={handleBuild}
                disabled={scopeItemCount === 0}
                style={{ ...btnPrimary, opacity: scopeItemCount === 0 ? 0.5 : 1, cursor: scopeItemCount === 0 ? "not-allowed" : "pointer" }}
              >
                <Play size={12} style={{ verticalAlign: "text-bottom", marginRight: 6 }} />
                BUILD WBS
              </button>
            </>
          )}
          {step === "preview" && (
            <>
              <button onClick={() => setStep("input")} style={btnGhost}>BACK</button>
              <button
                onClick={handleSave}
                disabled={kept.length === 0 || !validation.ok}
                style={{ ...btnPrimary, opacity: kept.length === 0 || !validation.ok ? 0.5 : 1 }}
              >
                ADD {kept.length} TASK{kept.length === 1 ? "" : "S"} TO SCHEDULE
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ── Forecast summary ──────────────────────────────────────────────────
//
// Roll the kept tasks back up to one row per source scope item so the
// PM can see "Anchor Bolts - Bldg. 1 → done by ~MMM DD (X working
// days)" without having to mentally sum the four phase rows. Project-
// level completion = the latest end_date across all items.

function buildForecast(tasks) {
  const groups = new Map();
  for (const t of tasks) {
    const key = t._scopeGroupIndex ?? `wbs:${t.wbs_code}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        // Strip the trailing phase verb so the row reads as the source
        // scope item rather than the last phase that fell into the
        // group ("Anchor Bolts - Bldg. 1" rather than
        // "Anchor Bolts - Bldg. 1 — Erection").
        label: stripPhaseVerb(t.task_name),
        scopeType: t._scopeLabel || null,
        start: t.start_date,
        end:   t.end_date,
        durationDays: 0,
      });
    }
    const g = groups.get(key);
    if (!g.start || t.start_date < g.start) g.start = t.start_date;
    if (!g.end   || t.end_date   > g.end)   g.end   = t.end_date;
    g.durationDays += Number(t.duration) || 0;
  }
  const items = Array.from(groups.values()).sort((a, b) =>
    String(a.start || "").localeCompare(String(b.start || ""))
  );
  // Project-level totals: span = first start → last end.
  const allStarts = items.map((i) => i.start).filter(Boolean).sort();
  const allEnds   = items.map((i) => i.end).filter(Boolean).sort();
  const projectStart = allStarts[0] || null;
  const projectEnd   = allEnds[allEnds.length - 1] || null;
  const projectSpan  = (projectStart && projectEnd) ? daysSpan(projectStart, projectEnd) : 0;
  return { items, projectStart, projectEnd, projectSpan };
}

function stripPhaseVerb(name) {
  if (!name) return "";
  // Builder format is "<base> — <verb>" with em-dash. Drop everything
  // after the LAST em-dash so the rollup reads as the scope label.
  const idx = name.lastIndexOf(" — ");
  return idx > 0 ? name.slice(0, idx) : name;
}

function daysSpan(startIso, endIso) {
  if (!startIso || !endIso) return 0;
  const s = new Date(startIso + "T00:00:00Z");
  const e = new Date(endIso + "T00:00:00Z");
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
  return Math.round((e - s) / 86400000) + 1;
}

function formatPretty(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso + "T00:00:00Z");
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  } catch { return iso; }
}

function ForecastBlock({ forecast }) {
  const { items, projectEnd, projectSpan } = forecast;
  return (
    <div
      style={{
        border: `1px solid ${AI}`,
        borderLeft: `3px solid ${AI}`,
        background: "color-mix(in srgb, var(--ai-accent, #22D3EE) 6%, transparent)",
        borderRadius: 3,
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ ...mono, fontSize: 10, fontWeight: 800, color: AI, letterSpacing: "0.16em", textTransform: "uppercase" }}>
          ◆ Forecast · Rough Predicted Timeframe
        </div>
        <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
          Estimates only — based on default durations per scope type. Refine in the task drawer once the schedule is in place.
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        <ForecastTile label="Scope Items" value={String(items.length)} />
        <ForecastTile label="Project Span" value={`${projectSpan}d`} sub={projectSpan ? `${Math.ceil(projectSpan / 7)} wk` : null} />
        <ForecastTile label="Predicted Completion" value={formatPretty(projectEnd)} sub={projectEnd ? "earliest finish, all phases" : null} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 0, marginTop: 4, border: "1px solid var(--divider)", borderRadius: 3, overflow: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 100px 100px 70px",
            gap: 0,
            padding: "5px 8px",
            background: "var(--bg-surface-low)",
            ...mono, fontSize: 9, fontWeight: 700, color: "var(--text-muted)",
            letterSpacing: "0.10em", textTransform: "uppercase",
            borderBottom: "1px solid var(--divider)",
          }}
        >
          <div>Item</div>
          <div>Start</div>
          <div>Done by</div>
          <div style={{ textAlign: "right" }}>Span</div>
        </div>
        {items.map((g) => (
          <div
            key={g.key}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 100px 100px 70px",
              gap: 0,
              padding: "5px 8px",
              borderBottom: "1px solid var(--divider)",
              background: "transparent",
            }}
          >
            <div style={{ ...mono, fontSize: 11, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={g.label}>
              {g.label}
              {g.scopeType && (
                <span style={{ marginLeft: 6, ...mono, fontSize: 9, color: "var(--text-muted)" }}>
                  · {g.scopeType}
                </span>
              )}
            </div>
            <div className="sbd-num" style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>{formatPretty(g.start)}</div>
            <div className="sbd-num" style={{ ...mono, fontSize: 10, color: "var(--text-secondary)" }}>{formatPretty(g.end)}</div>
            <div className="sbd-num" style={{ ...mono, fontSize: 10, color: "var(--text-secondary)", textAlign: "right" }}>
              {daysSpan(g.start, g.end)}d
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ForecastTile({ label, value, sub }) {
  return (
    <div
      style={{
        padding: "8px 10px",
        background: "var(--bg-page)",
        border: "1px solid var(--divider)",
        borderRadius: 3,
      }}
    >
      <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 4 }}>
        {label}
      </div>
      <div className="sbd-num" style={{ ...mono, fontSize: 16, fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 3 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

const btnPrimary = {
  padding: "8px 22px",
  background: AI,
  color: "#000",
  border: "none",
  borderRadius: 2,
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  cursor: "pointer",
};
const btnGhost = {
  padding: "8px 18px",
  background: "transparent",
  border: "1px solid var(--border-default)",
  borderRadius: 2,
  color: "var(--text-muted)",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  cursor: "pointer",
};
