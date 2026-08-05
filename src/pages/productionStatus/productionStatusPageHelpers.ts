/**
 * Pure helpers for Production Status page shell.
 */
import { downloadTextFile } from "@/lib/exports/fabRelease";


export const PRODUCTION_STATUS_CSV_HEADERS = [
  "Piece Mark",
  "Assembly",
  "Seq",
  "Area",
  "Stage",
  "% Complete",
  "Qty",
  "Ship Date",
  "Weight",
  "External Ref",
] as const;

export type ProductionStatusCsvRow = {
  piece_mark?: string | null;
  assembly_mark?: string | null;
  sequence_number?: string | null;
  erection_area?: string | null;
  status?: string | null;
  percent_complete?: number | string | null;
  quantity?: number | string | null;
  ship_date?: string | null;
  weight?: number | string | null;
  external_ref?: string | null;
};

export function buildProductionStatusCsvRows(
  rows: ProductionStatusCsvRow[],
): Array<Array<string | number>> {
  return (rows || []).map((p) => [
    p.piece_mark ?? "",
    p.assembly_mark || "",
    p.sequence_number || "",
    p.erection_area || "",
    p.status || "",
    p.percent_complete ?? "",
    p.quantity ?? "",
    p.ship_date || "",
    p.weight ?? "",
    p.external_ref || "",
  ]);
}

export function buildProductionStatusCsvString(rows: ProductionStatusCsvRow[]): string {
  const data = buildProductionStatusCsvRows(rows);
  return [PRODUCTION_STATUS_CSV_HEADERS as unknown as Array<string | number>, ...data]
    .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

/** Side-effect CSV download for Production Status page. */
export function downloadProductionStatusCsv(
  rows: Parameters<typeof buildProductionStatusCsvString>[0],
  filename = "production-status.csv",
): void {
  downloadTextFile(
    buildProductionStatusCsvString(rows),
    filename,
    "text/csv;charset=utf-8",
  );
}

export function filterProductionPieces<
  T extends {
    status?: string | null;
    piece_mark?: string | null;
    assembly_mark?: string | null;
    erection_area?: string | null;
    sequence_number?: string | null;
  },
>(
  pieces: T[],
  opts: { search?: string; stageFilter?: string } = {},
): T[] {
  const q = (opts.search || "").trim().toLowerCase();
  return (pieces || []).filter((p) => {
    if (opts.stageFilter && opts.stageFilter !== "All" && p.status !== opts.stageFilter) {
      return false;
    }
    if (!q) return true;
    return (
      (p.piece_mark || "").toLowerCase().includes(q)
      || (p.assembly_mark || "").toLowerCase().includes(q)
      || (p.erection_area || "").toLowerCase().includes(q)
      || (p.sequence_number || "").toLowerCase().includes(q)
    );
  });
}
