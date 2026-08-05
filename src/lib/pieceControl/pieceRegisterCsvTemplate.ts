/**
 * Standard Piece Register CSV template — one file for marks, WP, and drawing sheet.
 * Apply still only writes piece attrs (Slice 1); wp_number / sheet_number are
 * post-apply assignment / link hints carried in original_payload.
 */

export const PIECE_REGISTER_CSV_HEADERS = [
  "piece_mark",
  "quantity",
  "profile",
  "material_grade",
  "weight_each_lbs",
  "weight_total_lbs",
  "length_inches",
  "sequence_number",
  "erection_area",
  "wp_number",
  "sheet_number",
] as const;

export const PIECE_REGISTER_CSV_EXAMPLES: string[][] = [
  [
    "B1",
    "2",
    "W12X26",
    "A992",
    "100",
    "200",
    "240",
    "1",
    "Area A",
    "WP-001",
    "S-101",
  ],
  [
    "C1",
    "1",
    "W14X61",
    "A992",
    "180",
    "180",
    "360",
    "1",
    "Area A",
    "WP-001",
    "S-101",
  ],
  [
    "L1",
    "4",
    "L4X4X3/8",
    "A36",
    "25",
    "100",
    "96",
    "2",
    "Area B",
    "WP-004",
    "S-204",
  ],
];

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildPieceRegisterCsvTemplate(): string {
  const lines = [
    PIECE_REGISTER_CSV_HEADERS.join(","),
    ...PIECE_REGISTER_CSV_EXAMPLES.map((row) =>
      row.map((cell) => escapeCsvCell(cell)).join(","),
    ),
  ];
  return `${lines.join("\n")}\n`;
}

export function downloadPieceRegisterCsvTemplate(
  filename = "steelbuild-piece-register-template.csv",
): void {
  const csv = buildPieceRegisterCsvTemplate();
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
