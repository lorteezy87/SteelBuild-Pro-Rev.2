/**
 * intakeReview — deterministic per-sheet "needs review" signal for the AI
 * drawing-intake review screen (DrawingSetUploadModal → StepReview).
 *
 * The extractor (pdfSheetExtractor) returns NO per-field model confidence, so
 * rather than fabricate a percentage we surface concrete quality signals the
 * reviewer can act on:
 *   - the sheet's source PDF failed text extraction / was scanned / was too
 *     large (the row was pre-populated for manual entry);
 *   - the extractor attached a fallback note (_note);
 *   - the sheet has no sheet number (can't be identified — clearly incomplete).
 *
 * Used in BOTH StepReview (the per-sheet badge + summary count) and
 * handleCreate's buildRecord (the persisted ai_extraction_status gate) so the
 * badge the user sees and the status written to the row never disagree.
 *
 * @param {object} sheet         a review-stage sheet ({ sheetNumber, _note, ... })
 * @param {object} [sourceResult] the matching fileResults entry for sheet.sourceFile
 * @returns {{ needsReview: boolean, reasons: string[] }}
 */
export function sheetReviewFlags(sheet, sourceResult) {
  const reasons = [];
  let hasSourceFlag = false;

  if (sourceResult?.extractFailed) {
    reasons.push("extraction failed");
    hasSourceFlag = true;
  } else if (sourceResult?.scanned) {
    reasons.push("scanned — manual entry");
    hasSourceFlag = true;
  } else if (sourceResult?.tooLarge) {
    reasons.push("PDF too large");
    hasSourceFlag = true;
  }

  // A fallback row carries _note; only add it when a source flag didn't already
  // explain the situation (avoids a redundant reason on scanned/failed rows).
  if (sheet?._note && !hasSourceFlag) reasons.push("needs manual entry");

  if (!String(sheet?.sheetNumber || "").trim()) reasons.push("missing sheet #");

  return { needsReview: reasons.length > 0, reasons };
}
