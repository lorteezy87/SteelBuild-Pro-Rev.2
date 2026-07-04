import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronLeft, AlertTriangle } from "lucide-react";
import { sheetReviewFlags } from "@/components/drawings/intakeReview";
import { DISCIPLINES } from "./uploadWizardConstants";

// ─── Step 4: Review Sheets ────────────────────────────────────────────
export default function StepReview({ sheets, setSheets, fileResults, meta, setMeta, aiFilledFields = {}, onBack, onCreate, existingDrawings = [] }) {
  const [search, setSearch]         = useState("");
  const [discFilter, setDiscFilter] = useState("all");
  const [fileFilter, setFileFilter] = useState("all");

  const setMetaField = (k, v) => setMeta(prev => ({ ...prev, [k]: v }));
  const anyAiFilled = Object.values(aiFilledFields).some(Boolean);

  const multiFile = fileResults.length > 1;

  const filtered = sheets.filter(s => {
    const matchSearch = !search || s.sheetNumber?.toLowerCase().includes(search.toLowerCase()) || s.sheetTitle?.toLowerCase().includes(search.toLowerCase());
    const matchDisc   = discFilter === "all" || s.discipline === discFilter;
    const matchFile   = fileFilter === "all" || s.sourceFile === fileFilter;
    return matchSearch && matchDisc && matchFile;
  });

  const selectedCount = sheets.filter(s => s.selected).length;
  const toggleAll = (val) => setSheets(prev => prev.map(s => ({ ...s, selected: val })));
  const toggleOne = (filteredIdx) => {
    const realIdx = sheets.indexOf(filtered[filteredIdx]);
    setSheets(prev => prev.map((s, i) => i === realIdx ? { ...s, selected: !s.selected } : s));
  };
  const updateSheet = (filteredIdx, key, val) => {
    const realIdx = sheets.indexOf(filtered[filteredIdx]);
    setSheets(prev => prev.map((s, i) => i === realIdx ? { ...s, [key]: val } : s));
  };

  const uniqueFiles = [...new Set(sheets.map(s => s.sourceFile).filter(Boolean))];
  // Every soft problem (scanned, too large, extraction timed out) shows the
  // same amber "manual entry required" warning. Uploads are still allowed —
  // extractFailed PDFs produce a single pre-populated sheet row the user can
  // edit inline, so blocking the Create button here would dead-end them.
  const warnedFiles = fileResults.filter(r => r.scanned || r.tooLarge || r.extractFailed);

  // Per-sheet review signal (intakeReview) — the honest "confidence" surface:
  // the extractor returns no model confidence, so we flag sheets with a concrete
  // quality problem (bad-source row, fallback, or missing sheet #) for a closer
  // look before commit. Same fn the persisted ai_extraction_status uses, so the
  // badge and the saved status never disagree.
  const fileResultsByName = new Map(fileResults.map(r => [r.fileName, r]));
  const reviewCount = sheets.reduce(
    (n, s) => n + (sheetReviewFlags(s, fileResultsByName.get(s.sourceFile)).needsReview ? 1 : 0),
    0,
  );

  const aiBadge = (filled) => filled ? (
    <span title="Auto-filled by AI — edit if wrong" style={{
      fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "0.1em",
      padding: "1px 4px", borderRadius: 3, marginLeft: 6,
      background: "rgba(132,204,22,0.12)", color: "#84CC16",
      border: "1px solid rgba(132,204,22,0.3)", verticalAlign: "middle",
    }}>✦ AI</span>
  ) : null;

  const metaFieldStyle = {
    width: "100%",
    background: "var(--bg-surface-low)",
    border: "1px solid var(--bg-surface-high)",
    borderRadius: 6,
    padding: "5px 8px",
    color: "var(--text-primary)",
    fontFamily: "var(--font-body)",
    fontSize: 12,
    boxSizing: "border-box",
  };
  const metaLabelStyle = {
    display: "block",
    fontFamily: "var(--font-mono)",
    fontSize: 8,
    letterSpacing: "0.12em",
    color: "var(--text-muted)",
    marginBottom: 3,
    textTransform: "uppercase",
  };

  return (
    <div>
      {/* AI-detected set metadata — editable */}
      <div style={{
        padding: "10px 12px",
        border: `1px solid ${anyAiFilled ? "rgba(132,204,22,0.30)" : "var(--bg-surface-high)"}`,
        background: anyAiFilled ? "rgba(132,204,22,0.05)" : "var(--bg-surface-low)",
        borderRadius: 8,
        marginBottom: 10,
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 6, marginBottom: 8,
          fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em",
          color: anyAiFilled ? "#84CC16" : "var(--text-muted)", textTransform: "uppercase", fontWeight: 700,
        }}>
          {anyAiFilled ? "✦ AI-DETECTED SET METADATA" : "SET METADATA"}
          <span style={{ fontWeight: 400, color: "var(--text-muted)", letterSpacing: "0.04em", textTransform: "none" }}>
            — verify before creating
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <div style={{ gridColumn: "1 / 3" }}>
            <label style={metaLabelStyle}>Drawing Set Name{aiBadge(aiFilledFields.setName)}</label>
            <input style={metaFieldStyle} value={meta.setName}
              onChange={e => setMetaField("setName", e.target.value)}
              placeholder="e.g. 100% CD Set — Rev 2" />
          </div>
          <div>
            <label style={metaLabelStyle}>Drawing Set #</label>
            <input style={metaFieldStyle} value={meta.setNumber || ""}
              onChange={e => setMetaField("setNumber", e.target.value)}
              placeholder="e.g. 1 / 02 / P-03" />
          </div>
          <div>
            <label style={metaLabelStyle}>Revision{aiBadge(aiFilledFields.revision)}</label>
            <input style={metaFieldStyle} value={meta.revision}
              onChange={e => setMetaField("revision", e.target.value)}
              placeholder="Rev 2 / IFC" />
          </div>
          <div>
            <label style={metaLabelStyle}>Issue Date{aiBadge(aiFilledFields.issueDate)}</label>
            <input type="date" style={metaFieldStyle} value={meta.issueDate}
              onChange={e => setMetaField("issueDate", e.target.value)} />
          </div>
          <div>
            <label style={metaLabelStyle}>Issued By{aiBadge(aiFilledFields.issuedBy)}</label>
            <input style={metaFieldStyle} value={meta.issuedBy}
              onChange={e => setMetaField("issuedBy", e.target.value)}
              placeholder="Smith Engineering" />
          </div>
          <div>
            <label style={metaLabelStyle}>Default Discipline{aiBadge(aiFilledFields.discipline)}</label>
            <select style={metaFieldStyle} value={meta.discipline}
              onChange={e => setMetaField("discipline", e.target.value)}>
              {DISCIPLINES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Warnings — all soft failures share the amber "fill in manually" treatment */}
      {warnedFiles.map(r => (
        <div key={r.fileName} style={{
          display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 12px",
          background: "var(--warning-muted)", border: "1px solid var(--warning-border)",
          borderRadius: 8, marginBottom: 10,
        }}>
          <AlertTriangle style={{ width: 14, height: 14, color: "var(--status-warning)", flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)", flex: 1 }}>
            {r.extractFailed ? (
              <>
                <span style={{ color: "var(--status-warning)", fontWeight: 600 }}>{r.fileName}</span> could not be auto-extracted by AI. A blank sheet row has been added below — please fill in the sheet details manually, then click Create.
                {r.error && (
                  <div style={{ marginTop: 4, padding: "4px 6px", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", background: "rgba(0,0,0,0.2)", borderRadius: 4, letterSpacing: "0.04em" }}>
                    {r.error}
                  </div>
                )}
              </>
            ) : r.scanned ? (
              <><span style={{ color: "var(--status-warning)", fontWeight: 600 }}>{r.fileName}</span> appears to be a scanned image PDF. AI text extraction is not available. Please enter sheet details manually or upload a digitally-created PDF.</>
            ) : (
              <><span style={{ color: "var(--status-warning)", fontWeight: 600 }}>{r.fileName}</span> is too large ({r.sizeMB?.toFixed(1)}MB) for AI extraction. Please fill in sheet details manually.</>
            )}
          </div>
        </div>
      ))}

      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <button onClick={() => toggleAll(true)} style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-warning)", background: "none", border: "1px solid var(--warning-border)", borderRadius: 6, padding: "3px 8px", cursor: "pointer", letterSpacing: "0.08em" }}>☑ ALL</button>
        <button onClick={() => toggleAll(false)} style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)", background: "none", border: "1px solid var(--bg-surface-high)", borderRadius: 6, padding: "3px 8px", cursor: "pointer", letterSpacing: "0.08em" }}>☐ NONE</button>
        <input placeholder="Search sheets..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 100, background: "var(--bg-surface-low)", border: "1px solid var(--bg-surface-high)", borderRadius: 6, padding: "4px 10px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12 }} />
        <select value={discFilter} onChange={e => setDiscFilter(e.target.value)}
          style={{ background: "var(--bg-surface-low)", border: "1px solid var(--bg-surface-high)", borderRadius: 6, padding: "4px 8px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 9 }}>
          <option value="all">All Disciplines</option>
          {DISCIPLINES.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        {multiFile && (
          <select value={fileFilter} onChange={e => setFileFilter(e.target.value)}
            style={{ background: "var(--bg-surface-low)", border: "1px solid var(--bg-surface-high)", borderRadius: 6, padding: "4px 8px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 9, maxWidth: 140 }}>
            <option value="all">All Files</option>
            {uniqueFiles.map(f => <option key={f} value={f}>{f.replace(/\.pdf$/i, "")}</option>)}
          </select>
        )}
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
          {sheets.length} sheets · <span style={{ color: "var(--status-warning)" }}>{selectedCount} selected</span>
          {reviewCount > 0 && <> · <span style={{ color: "#D97706" }}>{reviewCount} to review</span></>}
        </span>
      </div>

      {/* Table */}
      <div style={{ maxHeight: 320, overflowY: "auto", background: "var(--bg-surface-low)", border: "1px solid var(--bg-surface-high)", borderRadius: 8, marginBottom: 14 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--bg-surface-low)", position: "sticky", top: 0, zIndex: 1 }}>
              <th style={{ width: 32, padding: "7px 10px" }}></th>
              <th style={{ padding: "7px 10px", textAlign: "left", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.12em" }}>SHEET #</th>
              <th style={{ padding: "7px 10px", textAlign: "left", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.12em" }}>TITLE</th>
              <th style={{ padding: "7px 10px", textAlign: "left", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.12em" }}>DISCIPLINE</th>
              <th style={{ padding: "7px 10px", textAlign: "left", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.12em" }}>REV</th>
              {multiFile && <th style={{ padding: "7px 10px", textAlign: "left", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.12em" }}>SOURCE</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((s, i) => {
              const review = sheetReviewFlags(s, fileResultsByName.get(s.sourceFile));
              return (
              <tr key={i} style={{ borderBottom: "1px solid var(--divider)", background: s.selected ? "var(--warning-muted)" : "transparent" }}>
                <td style={{ padding: "6px 10px", textAlign: "center" }}>
                  <input type="checkbox" checked={!!s.selected} onChange={() => toggleOne(i)} style={{ accentColor: "var(--accent)", cursor: "pointer" }} />
                </td>
                <td style={{ padding: "6px 10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <input value={s.sheetNumber || ""} onChange={e => updateSheet(i, "sheetNumber", e.target.value)}
                      style={{ background: "transparent", border: "1px solid transparent", borderRadius: 4, padding: "2px 6px", color: "var(--status-warning)", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, width: 76 }}
                      onFocus={e => e.target.style.borderColor = "rgba(245,158,11,0.4)"}
                      onBlur={e => e.target.style.borderColor = "transparent"} />
                    {s.sheetNumber && existingDrawings.some(d => d.sheet_number === s.sheetNumber) && (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#D97706", background: "rgba(217,119,6,0.10)", border: "1px solid rgba(217,119,6,0.25)", borderRadius: 4, padding: "1px 5px", whiteSpace: "nowrap", letterSpacing: "0.06em", fontWeight: 600 }}>
                        ⚠ EXISTS IN PROJECT
                      </span>
                    )}
                    {review.needsReview && (
                      <span title={`Needs review: ${review.reasons.join(", ")}`}
                        style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#D97706", background: "rgba(217,119,6,0.10)", border: "1px solid rgba(217,119,6,0.25)", borderRadius: 4, padding: "1px 5px", whiteSpace: "nowrap", letterSpacing: "0.06em", fontWeight: 600 }}>
                        ⚠ REVIEW
                      </span>
                    )}
                  </div>
                </td>
                <td style={{ padding: "6px 10px" }}>
                  <input value={s.sheetTitle || ""} onChange={e => updateSheet(i, "sheetTitle", e.target.value)}
                    style={{ background: "transparent", border: "1px solid transparent", borderRadius: 4, padding: "2px 6px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, width: "100%", minWidth: 140 }}
                    onFocus={e => e.target.style.borderColor = "rgba(245,158,11,0.4)"}
                    onBlur={e => e.target.style.borderColor = "transparent"} />
                </td>
                <td style={{ padding: "6px 10px" }}>
                  <select value={s.discipline || "Structural"} onChange={e => updateSheet(i, "discipline", e.target.value)}
                    style={{ background: "var(--bg-surface-low)", border: "1px solid var(--bg-surface-high)", borderRadius: 4, padding: "2px 6px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 9 }}>
                    {DISCIPLINES.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </td>
                <td style={{ padding: "6px 10px" }}>
                  <input value={s.revision || "0"} onChange={e => updateSheet(i, "revision", e.target.value)}
                    style={{ background: "transparent", border: "1px solid transparent", borderRadius: 4, padding: "2px 6px", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 11, width: 36 }}
                    onFocus={e => e.target.style.borderColor = "rgba(245,158,11,0.4)"}
                    onBlur={e => e.target.style.borderColor = "transparent"} />
                </td>
                {multiFile && (
                  <td style={{ padding: "6px 10px", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.sourceFile?.replace(/\.pdf$/i, "") || "—"}
                  </td>
                )}
              </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>No sheets match filter</div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <Button variant="outline" onClick={onBack}><ChevronLeft style={{ width: 14, height: 14, marginRight: 4 }} /> Back</Button>
        <Button
          onClick={() => onCreate(sheets.filter(s => s.selected))}
          disabled={selectedCount === 0}
          style={{ background: "var(--accent)", color: "#fff", border: "none" }}
        >
          Create {selectedCount} {selectedCount === 1 ? "Entry" : "Entries"} <ChevronRight style={{ width: 14, height: 14, marginLeft: 4 }} />
        </Button>
      </div>
    </div>
  );
}
