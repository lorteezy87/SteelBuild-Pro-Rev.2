/**
 * exportToCSV — render a header row + data rows into a downloaded CSV file.
 *
 * Cells are coerced to strings, doubled-up double-quotes are escaped per
 * RFC 4180 (the rule the prior inline copies in Vendors / Drawings missed),
 * and every value is wrapped in quotes so embedded commas and newlines
 * stay inside their cell.
 *
 * Caller passes plain values; Date / number / boolean coerce naturally,
 * `null` / `undefined` render as an empty string.
 */
export type CsvCell = string | number | boolean | Date | null | undefined;

export type ExportToCSVArgs = {
  /** File name including the `.csv` extension. */
  filename: string;
  /** Header row — single-row labels rendered as the first line. */
  headers: ReadonlyArray<string>;
  /** Data rows. Each row should have the same length as `headers`. */
  rows: ReadonlyArray<ReadonlyArray<CsvCell>>;
};

const escapeCell = (cell: CsvCell): string => {
  const raw = cell == null ? "" : String(cell);
  // Per RFC 4180: double-up internal quotes, then wrap the whole thing in quotes.
  return `"${raw.replace(/"/g, '""')}"`;
};

export function exportToCSV({ filename, headers, rows }: ExportToCSVArgs): void {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    // No-op on the server. Nothing else this helper would do is meaningful.
    return;
  }

  const csv = [headers, ...rows]
    .map((row) => row.map(escapeCell).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
