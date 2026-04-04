import { isOverdue, parseUTCDate } from "../shared/formatters";

const CLOSED_DRAWING_STAGES = new Set([
  "Released",
  "IFC",
  "Issued for Construction",
  "Approved",
]);

function normalizeStage(value) {
  return String(value || "").trim();
}

export function getDrawingDueDate(drawing) {
  const candidates = [drawing?.due_date, drawing?.return_date]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .map((value) => ({ value, parsed: parseUTCDate(value) }))
    .filter((entry) => entry.parsed);

  if (!candidates.length) return "";
  candidates.sort((a, b) => a.parsed - b.parsed);
  return candidates[0].value;
}

export function isClosedDrawingStage(drawing) {
  return CLOSED_DRAWING_STAGES.has(normalizeStage(drawing?.stage || drawing?.status));
}

export function isLateDrawing(drawing) {
  if (!drawing || drawing.is_superseded) return false;
  if (isClosedDrawingStage(drawing)) return false;
  const dueDate = getDrawingDueDate(drawing);
  return isOverdue(dueDate, normalizeStage(drawing?.stage || drawing?.status), [...CLOSED_DRAWING_STAGES]);
}

export function isOpenConstraint(item) {
  return (
    String(item?.category || "").toUpperCase() === "CONSTRAINT" &&
    !["Complete", "Closed", "Cancelled", "Resolved"].includes(item?.status)
  );
}
