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
import { PHASES, PHASE_COLORS } from "@/utils/phases";
import {
  parseScope,
  buildWbs,
  describeScopeItem,
  validateWbsPhases,
} from "@/lib/wbsBuilder";

const mono    = { fontFamily: "var(--font-mono)" };
const display = { fontFamily: "'Space Grotesk', var(--font-display)" };
const AI      = "var(--ai-accent, #22D3EE)";

// Small quick-pick sentences so the user has a starter that matches
// typical steel-shop scopes. Clicking any chip prefills the textarea.
const EXAMPLES = [
  {
    label: "Typical garage",
    text:  "Anchor Bolts - Bldg. 1\nPanel Embeds - Bldg. 1\nMain Steel - Bldg. 1\nStairs - Bldg. 1\nRailings - Bldg. 1\nJoists / Deck - Bldg. 1\nLadders - Bldg. 1\nSite Misc - Bldg. 1",
  },
  {
    label: "Two-building school",
    text:  "Anchor Bolts - Bldg. 1 & 2\nPanel Embeds - Bldg. 1\nPanel Embeds - Bldg. 2\nMain Steel - Bldg. 1\nMain Steel - Bldg. 2\nStairs & Railings - Bldg. 1\nStairs & Railings - Bldg. 2\nSite Misc",
  },
  {
    label: "Canopy retrofit",
    text:  "Entry Canopy\nRailings\nMisc Steel",
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

  if (!open) return null;

  const reset = () => {
    setStep("input"); setScopeText(""); setRemoved(new Set());
    setSavedCount(0); setErr(null);
  };

  const handleExample = (txt) => { setScopeText(txt); setTimeout(() => taRef.current?.focus(), 0); };

  const handleBuild = () => {
    setErr(null);
    if (parsed.hits.length === 0) {
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
      const payload = kept.map((t) => ({
        project_id:       projectId,
        task_name:        t.task_name,
        phase:            t.phase,
        wbs_code:         t.wbs_code,
        start_date:       t.start_date,
        end_date:         t.end_date,
        duration:         t.duration,
        status:           "Not Started",
        percent_complete: 0,
      }));
      // Insert sequentially via the entity client — bulk is nicer but
      // the entity-client abstracts it per-row and we already use the
      // same pattern in BulkAddTaskModal.
      const created = [];
      for (const row of payload) {
        // eslint-disable-next-line no-await-in-loop
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
          // eslint-disable-next-line no-await-in-loop
          await base44.entities.ScheduleTask.update(taskId, {
            dependencies: JSON.stringify([depId]),
          });
        } catch { /* advisory */ }
      }

      setSavedCount(created.length);
      qc.invalidateQueries({ queryKey: ["schedule-tasks", projectId] });
      qc.invalidateQueries({ queryKey: ["schedule-tasks-all"] });
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
  const scopeItemCount = parsed.hits.length;
  const unmatchedCount = parsed.unmatched.length;

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
                  {scopeItemCount} scope item{scopeItemCount === 1 ? "" : "s"} recognized → {wbs.tasks.length} task{wbs.tasks.length === 1 ? "" : "s"} across {Object.values(wbs.summary.tasksByPhase || {}).filter(Boolean).length} phase{Object.values(wbs.summary.tasksByPhase || {}).filter(Boolean).length === 1 ? "" : "s"}
                </span>
                {unmatchedCount > 0 && (
                  <span style={{ ...mono, fontSize: 10, color: "var(--status-warning)" }}>
                    <AlertTriangle size={10} style={{ verticalAlign: "text-bottom", marginRight: 4 }} />
                    {unmatchedCount} line{unmatchedCount === 1 ? "" : "s"} not recognized — will be skipped
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
                    Unrecognized lines
                  </div>
                  {parsed.unmatched.map((l, i) => (
                    <div key={i} style={{ ...mono, fontSize: 11, color: "var(--text-muted)" }}>
                      · {l}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === "preview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
                        {rows.map((t) => (
                          <tr key={t.wbs_code} style={{ borderBottom: "1px solid var(--divider)" }}>
                            <td style={{ ...mono, fontSize: 10, color, padding: "5px 8px", whiteSpace: "nowrap" }}>{t.wbs_code}</td>
                            <td style={{ padding: "5px 8px" }}>{t.task_name}</td>
                            <td style={{ ...mono, fontSize: 10, color: "var(--text-muted)", padding: "5px 8px", whiteSpace: "nowrap" }}>{t.start_date}</td>
                            <td style={{ ...mono, fontSize: 10, color: "var(--text-muted)", padding: "5px 8px", whiteSpace: "nowrap" }}>{t.end_date}</td>
                            <td style={{ ...mono, fontSize: 10, padding: "5px 8px", whiteSpace: "nowrap" }}>{t.duration}d</td>
                            <td style={{ ...mono, fontSize: 10, color: "var(--text-muted)", padding: "5px 8px", whiteSpace: "nowrap" }}>{t.depends_on_wbs || "—"}</td>
                            <td style={{ padding: "5px 8px", textAlign: "right" }}>
                              <button
                                onClick={() => toggleRow(t.wbs_code)}
                                title="Exclude this row"
                                style={{ ...mono, fontSize: 9, padding: "2px 6px", background: "transparent", border: "1px solid var(--divider)", borderRadius: 2, color: "var(--text-muted)", cursor: "pointer" }}
                              >
                                REMOVE
                              </button>
                            </td>
                          </tr>
                        ))}
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
