/**
 * Pure header-alias catalog for Tekla/SDS2 model-element CSV import.
 */

export const MODEL_ELEMENT_HEADER_ALIASES: Record<string, string[]> = {
  piece_mark: [
    "piece mark", "piecemark", "mark", "part mark", "main part mark",
    "member mark", "piece", "mk",
  ],
  assembly_mark: [
    "assembly mark", "assembly", "assy mark", "assembly no", "assembly number",
    "assembly pos",
  ],
  profile: ["profile", "section", "size", "shape", "member size"],
  material_grade: ["material", "grade", "material grade", "steel grade"],
  quantity: ["qty", "quantity", "pcs", "count", "no of pieces", "number"],
  weight_kg: [
    "weight", "weight kg", "weight (kg)", "total weight", "weight lbs",
    "weight (lbs)", "wt",
  ],
  sequence_number: ["sequence", "seq", "lot", "lot no", "phase", "sequence no"],
  erection_area: ["area", "erection area", "zone", "building", "bldg"],
  drawing_no: [
    "drawing", "dwg", "drawing no", "drawing number", "sheet", "sheet number",
    "sheet no", "detail drawing",
  ],
  element_guid: ["guid", "ifc guid", "globalid", "global id", "ifc globalid"],
};
