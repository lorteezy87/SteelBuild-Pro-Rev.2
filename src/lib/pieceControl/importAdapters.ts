import type { ImportPayload, PieceImportSourceType } from "./reconciliation";

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

export async function readPieceImportFile(file: File): Promise<ImportPayload[]> {
  const text = await file.text();
  if (file.name.toLowerCase().endsWith(".json")) {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error("JSON import must contain an array of rows");
    return parsed as ImportPayload[];
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

