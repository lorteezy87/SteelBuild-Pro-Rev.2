import { File as NodeFile } from "node:buffer";
import * as XLSX from "xlsx";
import { describe, expect, it, vi } from "vitest";
import { stageImportText } from "@/lib/onboardingTemplates";
import { TextDecodingError } from "@/lib/textDecoding";
import { readDataExchangeFile } from "../dataExchange/dataExchangeLogic";

vi.mock("@/api/supabaseClient", () => ({ entities: {} }));
vi.mock("@/components/shared/ProjectContext", () => ({ useProjectContext: () => ({}) }));
vi.mock("@/hooks/useProjectId", () => ({ useProjectId: (): string | null => null }));

// Regression coverage for Sentry JAVASCRIPT-REACT-2C (Postgres 22P05): a UTF-16
// Data Exchange upload read with file.text() put U+0000 into bulk-created rows.

const NUL = String.fromCharCode(0);
/** How JSON.stringify (and so the PostgREST body) spells U+0000. */
const NUL_ESCAPE = `${String.fromCharCode(92)}u0000`;
const CSV =
  "RFI #,Title,Question,Priority,Status\r\n" +
  "001,Anchor bolt projection,Confirm projection at grid B/4,High,Open\r\n";
const ZIP_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function utf16le(text: string, bom: boolean): Uint8Array {
  const out: number[] = bom ? [0xff, 0xfe] : [];
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    out.push(unit & 0xff, unit >> 8);
  }
  return new Uint8Array(out);
}

function file(bytes: Uint8Array, name: string): File {
  return new NodeFile([bytes], name) as unknown as File;
}

describe("readDataExchangeFile", () => {
  it.each([
    { label: "with a BOM", bom: true },
    { label: "without a BOM", bom: false },
  ])("decodes a UTF-16LE CSV $label into clean staged rows", async ({ bom }) => {
    const text = await readDataExchangeFile(file(utf16le(CSV, bom), "rfis.csv"));
    expect(text).toBe(CSV);
    expect(text).not.toContain(NUL);

    const staged = stageImportText({ targetKey: "rfis", text, project: { id: "p1", name: "Job 1" } });
    expect(staged.invalidRows).toEqual([]);
    expect(staged.validRecords).toHaveLength(1);
    expect(staged.validRecords[0]).toMatchObject({ title: "Anchor bolt projection", priority: "High" });
    expect(JSON.stringify(staged.validRecords)).not.toContain(NUL_ESCAPE);
  });

  it("rejects a binary container (zip / .xlsx bytes) named .csv with re-save guidance", async () => {
    const error = await readDataExchangeFile(file(ZIP_BYTES, "rfis.csv")).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(TextDecodingError);
    expect((error as Error).message).toMatch(/CSV UTF-8/);
  });

  it("still reads a real .xlsx workbook through XLSX, not the text decoder", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([["RFI #", "Title"], ["001", "Anchor bolt projection"]]),
      "RFIs",
    );
    const bytes = new Uint8Array(
      XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer,
    );
    const text = await readDataExchangeFile(file(bytes, "rfis.xlsx"));
    expect(text).toContain("Anchor bolt projection");
  });

  it("decodes plain UTF-8, UTF-8 with a BOM and Windows-1252 bytes exactly as file.text() did", async () => {
    const cases = [
      utf8(CSV),
      new Uint8Array([0xef, 0xbb, 0xbf, ...utf8(CSV)]),
      new Uint8Array([...utf8("RFI #,Title\r\n001,PL1/2"), 0xbd, 0x0d, 0x0a]),
    ];
    for (const bytes of cases) {
      const upload = file(bytes, "rfis.csv");
      expect(await readDataExchangeFile(upload)).toBe(await upload.text());
    }
    expect(await readDataExchangeFile(file(utf8(CSV), "rfis.csv"))).toBe(CSV);
  });
});
