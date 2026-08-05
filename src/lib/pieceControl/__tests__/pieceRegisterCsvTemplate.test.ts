import { describe, expect, it } from "vitest";
import {
  buildPieceRegisterCsvTemplate,
  PIECE_REGISTER_CSV_HEADERS,
} from "../pieceRegisterCsvTemplate";

describe("pieceRegisterCsvTemplate", () => {
  it("includes piece, WP, and sheet columns in one header row", () => {
    const csv = buildPieceRegisterCsvTemplate();
    const [header] = csv.trim().split("\n");
    expect(header.split(",")).toEqual([...PIECE_REGISTER_CSV_HEADERS]);
    expect(header).toContain("wp_number");
    expect(header).toContain("sheet_number");
    expect(header).toContain("piece_mark");
  });

  it("ships example rows so the download is fillable immediately", () => {
    const lines = buildPieceRegisterCsvTemplate().trim().split("\n");
    expect(lines.length).toBeGreaterThan(2);
    expect(lines[1]).toContain("B1");
    expect(lines[1]).toContain("WP-001");
    expect(lines[1]).toContain("S-101");
  });
});
