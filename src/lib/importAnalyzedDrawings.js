/**
 * importAnalyzedDrawings.js
 *
 * Promotes a completed drawing_analyses row + its drawing_sheets into the
 * canonical drawing_sets / drawings tables so the sheets show up on the
 * Drawings page and participate in KPI / due-date / stage-advancement
 * workflows.
 *
 * Idempotency: if drawing_analyses.imported_set_id is already set, the
 * import is a no-op and returns the existing set id. The user's manual
 * edits on the target set / sheets are never overwritten by a later
 * re-analysis — they must delete the linked set first if they want to
 * re-import fresh.
 */

import { supabase } from "@/lib/supabase";

// Drawings.stage enum lives at src/components/drawings/drawingsConfig.js
// (OFA, BFA, OFS, BFS, FFF, Released, Not Started). The drawing_analyses
// enum is broader — this map reconciles the two.
const STAGE_FROM_ANALYSIS = {
  "OFA":       "OFA",
  "BFA":       "BFA",
  "OFS":       "OFS",
  "BFS":       "BFS",
  "FFF":       "FFF",
  "Released":  "Released",
  "IFA":       "OFA",       // Issued For Approval → starts at OFA
  "IFC":       "Released",  // Issued For Construction → terminal stage
  "Shop":      "OFS",       // Shop drawings typically enter at OFS (first submit)
  "Revision":  "OFA",       // Revision being re-issued for approval
};

// Discipline derivation from sheet_number prefix. Shop is NOT a discipline
// (it's a classification of a submittal) so shop drawings get their
// discipline from the prefix, same as any other sheet — commonly still
// "Structural" because shop drawings are usually structural details.
function inferDiscipline(sheetNumber) {
  if (!sheetNumber) return "Structural";
  const prefix = String(sheetNumber).trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
  if (prefix.startsWith("SH")) return "Structural";  // SH-series = shop drawings, still structural
  if (prefix.startsWith("S"))  return "Structural";
  if (prefix.startsWith("E"))  return "Erection";
  if (prefix.startsWith("D"))  return "Structural";  // detailing
  if (prefix.startsWith("A"))  return "Architectural";
  if (prefix.startsWith("C"))  return "Civil";
  if (prefix.startsWith("M"))  return "Misc Metals"; // could also be MEP; go with the steel bias
  if (prefix.startsWith("P"))  return "MEP";
  return "Structural";
}

// Default set name from the PDF filename. Strips extension + round-trip
// suffixes like " (1)" that browsers add on re-download.
function deriveSetName(analysis) {
  const raw = (analysis.file_name || "Untitled").replace(/\.[a-z0-9]+$/i, "").trim();
  return raw || "Untitled";
}

/**
 * Run the import. Caller can pass a preloaded sheets array to avoid an
 * extra round-trip; otherwise we fetch them from drawing_sheets.
 *
 * Returns { setId, drawingCount, skipped } — skipped=true when the
 * analysis was already imported.
 */
export async function importAnalyzedDrawings(analysis, { sheets } = {}) {
  if (!analysis?.id) throw new Error("importAnalyzedDrawings: analysis id missing");
  if (analysis.imported_set_id) {
    return { setId: analysis.imported_set_id, drawingCount: 0, skipped: true };
  }
  // Accept both 'complete' (normal re-import via the detail-modal button)
  // and 'processing' (auto-import called from inside analyzeDrawing before
  // the status flip — we want the import to succeed BEFORE the parent row
  // claims 'complete', otherwise a failed import leaves a lying-complete
  // row with no data in the canonical Drawings table).
  if (analysis.analysis_status !== "complete" && analysis.analysis_status !== "processing") {
    throw new Error(`Analysis ${analysis.id} is not ready to import (${analysis.analysis_status}).`);
  }

  // Load sheets if not supplied.
  let sheetRows = sheets;
  if (!sheetRows) {
    const { data, error } = await supabase
      .from("drawing_sheets")
      .select("*")
      .eq("analysis_id", analysis.id)
      .order("page_index", { ascending: true });
    if (error) throw new Error(`Could not load analyzed sheets: ${error.message}`);
    sheetRows = data || [];
  }

  // 1. Create the parent drawing_sets row.
  const setPayload = {
    project_id:  analysis.project_id,
    set_name:    deriveSetName(analysis),
    description: analysis.ai_summary ? analysis.ai_summary.slice(0, 500) : null,
    revision:    analysis.revision || null,
    issued_date: analysis.issue_date || null,
    issued_by:   analysis.uploaded_by || null,
    status:      "Active",
    file_url:    analysis.file_url || null,
    sheet_count: sheetRows.length,
    processed_count: sheetRows.length,
    needs_review_count: 0,
    failed_count: 0,
  };
  const { data: setRow, error: setErr } = await supabase
    .from("drawing_sets")
    .insert(setPayload)
    .select()
    .single();
  if (setErr) throw new Error(`drawing_sets insert failed: ${setErr.message}`);

  const setId = setRow.id;
  const stage = STAGE_FROM_ANALYSIS[analysis.drawing_stage] || "Not Started";
  const setName = setRow.set_name;

  // 2. Insert one drawings row per extracted sheet.
  let drawingCount = 0;
  if (sheetRows.length > 0) {
    const drawingPayload = sheetRows.map(s => ({
      project_id:       analysis.project_id,
      project_name:     analysis.project_name || null,
      drawing_set_id:   setId,
      drawing_set_name: setName,     // denormalized for legacy group-by paths
      sheet_number:     (s.sheet_number || "").slice(0, 64),
      title:            (s.sheet_title || "").slice(0, 500),
      discipline:       inferDiscipline(s.sheet_number),
      revision_number:  analysis.revision || "0",
      stage,
      file_url:         analysis.file_url || null,
      // Leave submitted_date / return_date / due_date NULL — the analysis
      // doesn't know dates. User fills them in from the Drawings page.
      notes:            `Auto-imported from AI analysis of "${analysis.file_name}" on ${new Date().toISOString().slice(0,10)}.`,
    }));
    const { data: inserted, error: dErr } = await supabase
      .from("drawings")
      .insert(drawingPayload)
      .select("id");
    if (dErr) throw new Error(`drawings insert failed: ${dErr.message}`);
    drawingCount = inserted?.length || 0;
  }

  // 3. Back-link analysis → set so we never re-import.
  const { error: linkErr } = await supabase
    .from("drawing_analyses")
    .update({ imported_set_id: setId })
    .eq("id", analysis.id);
  if (linkErr) throw new Error(`Back-link update failed: ${linkErr.message}`);

  return { setId, drawingCount, skipped: false, setName };
}
