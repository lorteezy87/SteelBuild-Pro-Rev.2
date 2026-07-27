import type { ImportPayload, PieceImportSourceType } from "./reconciliation";
import { aggregatePieceRowsByMark } from "./aggregateImportRows";

function parseCsv(text: string): ImportPayload[] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      record.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      record.push(field);
      if (record.some((value) => value.trim() !== "")) records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }
  record.push(field);
  if (record.some((value) => value.trim() !== "")) records.push(record);
  if (records.length < 2) return [];

  const headers = records[0].map((header) =>
    header.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
  );
  return records.slice(1).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""])),
  );
}

const KISS_HEADER_ALIASES: Record<string, string[]> = {
  piece_mark: ["piece_mark", "mark", "piecemark", "assembly_mark", "member", "memb"],
  quantity: ["quantity", "qty", "count", "pcs"],
  profile: ["profile", "section", "shape", "size"],
  material_grade: ["material_grade", "grade", "matl", "material"],
  weight_total_lbs: ["weight_total_lbs", "weight", "wt", "weight_lbs", "total_weight"],
  length_inches: ["length_inches", "length", "len"],
  sequence_number: ["sequence_number", "sequence", "seq", "lot"],
  erection_area: ["erection_area", "area", "zone"],
};

function mapKissHeaders(headers: string[]): Record<string, number> | null {
  const map: Record<string, number> = {};
  headers.forEach((header, index) => {
    const norm = header.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    for (const [field, aliases] of Object.entries(KISS_HEADER_ALIASES)) {
      if (map[field] !== undefined) continue;
      if (aliases.includes(norm)) map[field] = index;
    }
  });
  return map.piece_mark !== undefined ? map : null;
}

/**
 * Parse tabular KISS / SDS-style member exports. Accepts CSV with recognizable
 * mark headers, or whitespace/comma member lines after a MEMBER/DETAIL banner.
 * Never guesses marks from free text — unparseable files fail closed.
 */
export function parseKissPieceRows(text: string): ImportPayload[] {
  const firstContentLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  // Only treat as CSV when the header row is comma-separated. Space-delimited
  // MEMBER dumps must not be misread as a one-column CSV (mark aliases include
  // "member", which would swallow the whole data line as a mark).
  if (firstContentLine?.includes(",")) {
    const csvRows = parseCsv(text);
    if (csvRows.length > 0) {
      const headers = Object.keys(csvRows[0]);
      if (mapKissHeaders(headers)) {
        return csvRows.map((row) => {
          const mapped: ImportPayload = {};
          for (const [field, aliases] of Object.entries(KISS_HEADER_ALIASES)) {
            for (const alias of aliases) {
              if (row[alias] != null && String(row[alias]).trim() !== "") {
                mapped[field] = row[alias];
                break;
              }
            }
          }
          return mapped;
        }).filter((row) => String(row.piece_mark || "").trim() !== "");
      }
    }
  }

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const memberStart = lines.findIndex((line) =>
    /^(member|detail|pieces?)\b/i.test(line),
  );
  const dataLines = memberStart >= 0 ? lines.slice(memberStart + 1) : lines;
  const rows: ImportPayload[] = [];

  for (const line of dataLines) {
    if (/^(end_|job|version|\*)/i.test(line)) continue;
    const parts = line.includes(",")
      ? line.split(",").map((part) => part.trim())
      : line.split(/\s+/);
    if (parts.length < 2) continue;
    const mark = parts[0];
    if (!mark || mark.length > 32) continue;
    if (!/^[A-Za-z0-9][A-Za-z0-9\-_/]*$/.test(mark)) continue;
    const quantity = Number(parts[1]);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    rows.push({
      piece_mark: mark,
      quantity,
      profile: parts[2] || null,
      material_grade: parts[3] || null,
      length_inches: parts[4] ? Number(parts[4]) : null,
      weight_total_lbs: parts[5] ? Number(parts[5]) : null,
    });
  }

  if (rows.length === 0) {
    throw new Error(
      "Could not parse KISS members. Provide a CSV with a piece mark column, or MEMBER lines as mark,qty,profile,grade,length,weight.",
    );
  }
  return rows;
}

async function parsePowerFabOrFabSuite(file: File): Promise<ImportPayload[]> {
  const { parseFabSuiteXml } = await import("@/lib/importFabSuiteXml");
  const parsed = parseFabSuiteXml(await file.text());
  if (!parsed.ok) {
    throw new Error(parsed.error || "Could not parse PowerFab / FabSuite XML");
  }
  if (!parsed.pieces.length) {
    throw new Error("PowerFab / FabSuite file contained no assembly pieces");
  }
  return aggregatePieceRowsByMark(
    parsed.pieces.map((piece: {
      piece_mark: string;
      assembly_mark?: string | null;
      quantity?: number | null;
      profile?: string | null;
      material_grade?: string | null;
      weight_kg?: number | null;
      sequence_number?: string | null;
      erection_area?: string | null;
      element_guid?: string | null;
    }) => ({
      piece_mark: piece.piece_mark,
      assembly_mark: piece.assembly_mark,
      quantity: piece.quantity,
      profile: piece.profile,
      material_grade: piece.material_grade,
      weight_kg: piece.weight_kg,
      sequence_number: piece.sequence_number,
      erection_area: piece.erection_area,
      external_ref: piece.element_guid,
      element_guid: piece.element_guid,
    })),
  );
}

async function parseIfcRoster(file: File): Promise<ImportPayload[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".json") || name.endsWith(".csv")) {
    const text = await file.text();
    const rows = name.endsWith(".json")
      ? (JSON.parse(text) as ImportPayload[])
      : parseCsv(text);
    if (!Array.isArray(rows)) throw new Error("IFC roster JSON must be an array of rows");
    return aggregatePieceRowsByMark(rows);
  }
  if (!name.endsWith(".ifc")) {
    throw new Error("IFC roster import expects a .ifc model or a roster .csv/.json export");
  }
  const { extractIfcRoster } = await import("@/lib/ifc/extractIfcRoster");
  const buffer = await file.arrayBuffer();
  const roster = await extractIfcRoster(buffer);
  if (!roster.rows.length) {
    throw new Error("IFC model contained no piece marks with GlobalIds");
  }
  // Part-grain roster → one register row per exact assembly mark (qty = unique mark).
  // Do not count parts as quantity — that would inflate assemblies.
  const byMark = new Map<string, ImportPayload>();
  for (const row of roster.rows as Array<{
    piece_mark?: string;
    sequence_number?: string | null;
    element_guid?: string | null;
  }>) {
    const mark = String(row.piece_mark || "").trim();
    if (!mark) continue;
    const key = mark.toUpperCase();
    if (byMark.has(key)) continue;
    byMark.set(key, {
      piece_mark: mark,
      quantity: 1,
      sequence_number: row.sequence_number ?? null,
      external_ref: row.element_guid ?? null,
      element_guid: row.element_guid ?? null,
    });
  }
  return Array.from(byMark.values());
}

export async function readPieceImportFile(
  file: File,
  sourceType: PieceImportSourceType = "csv",
): Promise<ImportPayload[]> {
  const name = file.name.toLowerCase();

  if (sourceType === "powerfab_xml" || sourceType === "fabsuite_xml" || name.endsWith(".xml")) {
    return parsePowerFabOrFabSuite(file);
  }
  if (sourceType === "ifc" || name.endsWith(".ifc")) {
    return parseIfcRoster(file);
  }
  if (sourceType === "kiss" || name.endsWith(".kss") || name.endsWith(".kiss")) {
    return parseKissPieceRows(await file.text());
  }

  const text = await file.text();
  if (name.endsWith(".json") || sourceType === "manual") {
    if (name.endsWith(".json") || text.trim().startsWith("[")) {
      const parsed: unknown = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error("JSON import must contain an array of rows");
      return parsed as ImportPayload[];
    }
  }
  return parseCsv(text);
}

export const PIECE_IMPORT_SOURCE_OPTIONS: Array<{ value: PieceImportSourceType; label: string }> = [
  { value: "csv", label: "Piece Register CSV" },
  { value: "ifc", label: "IFC roster" },
  { value: "kiss", label: "KISS" },
  { value: "powerfab_xml", label: "PowerFab XML" },
  { value: "fabsuite_xml", label: "FabSuite XML" },
  { value: "model_elements", label: "Model elements" },
  { value: "production_status", label: "Production status" },
  { value: "shipping_list", label: "Shipping list" },
  { value: "manual", label: "Manual/JSON" },
];
