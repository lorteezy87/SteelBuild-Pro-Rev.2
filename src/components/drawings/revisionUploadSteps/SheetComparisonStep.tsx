import React from "react";
import { ChevronRight, ChevronLeft, AlertTriangle } from "lucide-react";
import { CHANGE_STYLE } from "../revisionUploadHelpers";
import { DocControlIntakePanel } from "../DocControlReviewPanel";
import { AuthContext } from "@/lib/AuthContext";
// ── Step D: Sheet Comparison ───────────────────────────────────────
export default function StepSheetComparison(props: any) {
  const { selectedSet, revMeta, extraction, activeProject, matchedSheets, setMatchedSheets, supersedeUnlisted, setSupersedeUnlisted, onBack, onConfirm, busy = false } = props;
  const counts = {
    same: matchedSheets.filter((m: any) => m.change === "revised" && m.oldSheet?.sheetTitle === m.newSheet?.sheetTitle).length,
    revised: matchedSheets.filter((m: any) => m.change === "revised").length,
    added: matchedSheets.filter((m: any) => m.change === "added").length,
    removed: matchedSheets.filter((m: any) => m.change === "removed").length,
    ambiguous: matchedSheets.filter((m: any) => m.change === "ambiguous").length,
  };
  const totalOld = matchedSheets.filter((m: any) => m.oldSheet).length;
  const totalNew = matchedSheets.reduce((count: number, m: any) => count + (m.newSheets?.length ?? (m.newSheet ? 1 : 0)), 0);
  const removedSheets = matchedSheets.filter((m: any) => m.change === "removed");
  const ambiguousSheets = matchedSheets.filter((m: any) => m.change === "ambiguous");

  const updateTitle = (idx: any, val: any) => {
    setMatchedSheets((prev: any) => prev.map((m: any, i: any) => i === idx ? { ...m, newSheet: { ...m.newSheet, sheetTitle: val, reviewed: false, manual: undefined } } : m));
  };

  const user = React.useContext(AuthContext)?.user;
  const edit = (index: number, patch: Record<string, unknown>) => setMatchedSheets((previous: any[]) => previous.map((match, i) => i === index
    ? { ...match, newSheet: { ...match.newSheet, ...patch } } : match));

  // Document Control intake for this upload. Memoised on the inputs the engine
  // actually reads so attesting a seal on one sheet does not rebuild the others.
  const docControlIntake = React.useMemo(
    () => ({
      matches: matchedSheets,
      setMeta: extraction?.setMeta ?? null,
      scanned: extraction?.scanned === true,
      revisionFromRect: !!selectedSet?.titleblock_revision_rect,
      existingSet: selectedSet ?? null,
      projectId: activeProject?.id ?? null,
    }),
    [matchedSheets, extraction, selectedSet, activeProject],
  );

  return (
    <div>
      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
      {/* Summary bar */}
      <div style={{ display: "flex", gap: 8, padding: "8px 14px", borderRadius: 8, background: "var(--hover-bg)", border: "1px solid var(--divider)", marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.06em" }}>{totalOld} → {totalNew} sheets</span>
        <span style={{ color: "var(--text-muted)" }}>·</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-warning-bright)", letterSpacing: "0.06em" }}>{counts.revised} revised</span>
        <span style={{ color: "var(--text-muted)" }}>·</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-success-bright)", letterSpacing: "0.06em" }}>{counts.added} added</span>
        <span style={{ color: "var(--text-muted)" }}>·</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: supersedeUnlisted ? "var(--status-error-bright)" : "var(--text-muted)", letterSpacing: "0.06em" }}>{counts.removed} {supersedeUnlisted ? "removed" : "kept"}</span>
        {counts.ambiguous > 0 && (
          <>
            <span style={{ color: "var(--text-muted)" }}>·</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-error-bright)", letterSpacing: "0.06em" }}>{counts.ambiguous} need review</span>
          </>
        )}
      </div>

      {ambiguousSheets.length > 0 && (
        <div style={{ padding: "10px 12px", borderRadius: 8, marginBottom: 12, background: "rgba(255,61,61,0.07)", border: "1px solid rgba(255,61,61,0.20)" }}>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
            Ambiguous sheet matches — exact numbers only, no automatic guessing
          </div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)" }}>
            Resolve duplicate or blank sheet numbers before applying.{" "}
            {ambiguousSheets.map((m: any) => m.ambiguousReason || `Sheet "${m.sheetNumber || "(blank)"}"`).join(" · ")}
            {ambiguousSheets.some((m: any) => m.newSheets?.length > 1) && (
              <p>All incoming pages are retained. Edit the displayed member of each duplicate group to its actual sheet number; the remaining members stay held for review.</p>
            )}
          </div>
        </div>
      )}

      {/* Document Control read — title block, seal, register verdict, findings.
          Sits above the sheet diff because a held document should stop a
          reviewer before they scroll into the row-by-row comparison. */}
      <DocControlIntakePanel
        intake={docControlIntake}
        reviewerName={user?.full_name || user?.email || ""}
      />

      {/* Sheets in the set but NOT in this upload. Retiring them is OPT-IN: the
          default treats the upload as a PARTIAL revision and leaves those sheets
          current. Only a deliberate full re-issue supersedes them. */}
      {removedSheets.length > 0 && (
        <div style={{ padding: "10px 12px", borderRadius: 8, marginBottom: 12,
          background: supersedeUnlisted ? "rgba(255,61,61,0.07)" : "var(--hover-bg)",
          border: `1px solid ${supersedeUnlisted ? "rgba(255,61,61,0.20)" : "var(--divider)"}` }}>
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
            <input type="checkbox" checked={supersedeUnlisted}
              onChange={e => setSupersedeUnlisted(e.target.checked)}
              style={{ marginTop: 2, accentColor: "var(--status-error-bright)" }} />
            <div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 700, color: "var(--text-primary)" }}>
                Full re-issue — retire the {removedSheets.length} sheet{removedSheets.length > 1 ? "s" : ""} not in this upload
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 4, fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)" }}>
                {supersedeUnlisted && <AlertTriangle style={{ width: 13, height: 13, color: "var(--status-error-bright)", flexShrink: 0, marginTop: 1 }} />}
                <span>
                  {supersedeUnlisted
                    ? <>Will be marked superseded and leave the current set: {removedSheets.map((m: any) => m.sheetNumber).join(", ")}.</>
                    : <>Partial revision (default) — these stay current and untouched: {removedSheets.map((m: any) => m.sheetNumber).join(", ")}. Only tick this if the upload is the complete new set.</>}
                </span>
              </div>
            </div>
          </label>
        </div>
      )}

      {/* Comparison table */}
      <div style={{ maxHeight: 300, overflowY: "auto", background: "var(--bg-surface-low)", border: "1px solid var(--divider)", borderRadius: 8, marginBottom: 14 }}>
        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 80px 1fr", alignItems: "center", padding: "7px 12px", background: "var(--bg-surface-low)", borderBottom: "1px solid var(--divider)", position: "sticky", top: 0, zIndex: 1, gap: 8 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em" }}>PREV ({selectedSet.revision || "—"})</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em" }}>TITLE</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em" }}>CHANGE</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-warning)", letterSpacing: "0.12em" }}>NEW ({revMeta.revisionLabel})</div>
        </div>
        {matchedSheets.map((m: any, i: any) => {
          const keptNotRemoved = m.change === "removed" && !supersedeUnlisted;
          const cs = (CHANGE_STYLE as Record<string, any>)[m.change] || CHANGE_STYLE.same;
          const changeLabel = keptNotRemoved ? "KEPT" : cs.label;
          const changeColor = keptNotRemoved ? "var(--text-muted)" : cs.color;
          return (
            <div key={m.sheetNumber} style={{ display: "grid", gridTemplateColumns: "80px 1fr 80px 1fr", alignItems: "center", padding: "5px 12px", borderBottom: "1px solid var(--divider)", background: cs.bg, gap: 8 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {m.oldSheet?.sheetNumber || "—"}
              </span>
              <span style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {m.oldSheet?.sheetTitle || "—"}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: changeColor, letterSpacing: "0.06em", fontWeight: 700 }}>{changeLabel}</span>
              <div>
                {m.newSheet ? (
                  <div>
                  <input aria-label={`Sheet number for ${m.sheetNumber || 'manual sheet'}`} value={m.newSheet.sheetNumber || ''}
                    onChange={event => edit(i, { sheetNumber: event.target.value, reviewed: false, manual: undefined })} />
                  <input
                    aria-label={`Title for ${m.sheetNumber || 'manual sheet'}`}
                    value={m.newSheet.sheetTitle || ""}
                    onChange={e => updateTitle(i, e.target.value)}
                    style={{ background: "transparent", border: "1px solid transparent", borderRadius: 3, padding: "1px 4px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 10, width: "100%" }}
                    onFocus={e => e.target.style.borderColor = "rgba(245,158,11,0.4)"}
                    onBlur={e => e.target.style.borderColor = "transparent"}
                  />
                  <input aria-label={`Revision code for ${m.sheetNumber || 'manual sheet'}`} value={m.newSheet.revision || ''}
                    onChange={event => edit(i, { revision: event.target.value, reviewed: false, manual: undefined })} />
                  <input aria-label={`PDF page for ${m.sheetNumber || 'manual sheet'}`} type="number" min="1" value={m.newSheet.pdfPage ?? ''}
                    onChange={event => edit(i, { pdfPage: event.target.value === '' ? null : Number(event.target.value) })} />
                  <label><input type="checkbox" checked={m.newSheet.reviewed === true && !m.newSheet.sourceReviewRequired}
                    onChange={event => edit(i, { reviewed: event.target.checked, sourceReviewRequired: !event.target.checked,
                      manual: event.target.checked ? { sheetNumber: m.newSheet.sheetNumber, title: m.newSheet.sheetTitle, revision: m.newSheet.revision } : undefined })} />
                    I reviewed {m.sheetNumber || 'this sheet'}, its revision code and physical PDF page
                  </label>
                  </div>
                ) : (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{keptNotRemoved ? "— kept (not in upload)" : "— REMOVED"}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <button onClick={() => setMatchedSheets((previous: any[]) => {
        const original = previous.find(match => match.newSheet)?.newSheet;
        if (!original) return previous;
        return [...previous, { change: 'ambiguous', sheetNumber: '', newSheet: { sheetNumber: '', sheetTitle: '', revision: '', pdfPage: null,
          sourceFileUrl: original.sourceFileUrl, fileUrl: original.fileUrl, sourceSnapshot: original.sourceSnapshot, reviewed: false } }];
      })}>Add manually reviewed sheet</button>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <button onClick={onBack} style={{ padding: "7px 14px", borderRadius: 8, cursor: "pointer", background: "transparent", border: "1px solid var(--border-default)", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 5 }}>
          <ChevronLeft style={{ width: 13, height: 13 }} /> Back
        </button>
        <button onClick={onConfirm} style={{
          padding: "7px 16px", borderRadius: 8, cursor: "pointer",
          background: "var(--accent)", border: "none", color: "var(--on-accent)",
          fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
          display: "flex", alignItems: "center", gap: 6
        }}>
          Apply Revision <ChevronRight style={{ width: 13, height: 13 }} />
        </button>
      </div>
      </fieldset>
    </div>
  );
}
