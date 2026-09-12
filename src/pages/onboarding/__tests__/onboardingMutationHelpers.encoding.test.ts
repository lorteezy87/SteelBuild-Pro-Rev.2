import { File as NodeFile } from "node:buffer";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { stageImportText } from "@/lib/onboardingTemplates";
import { TextDecodingError } from "@/lib/textDecoding";
import { readOnboardingImportFile } from "../onboardingMutationHelpers";

// Regression coverage for Sentry JAVASCRIPT-REACT-2C (Postgres 22P05): a UTF-16
// onboarding upload read with file.text() put U+0000 into bulk-created rows.

const NUL = String.fromCharCode(0);
/** How JSON.stringify (and so the PostgREST body) spells U+0000. */
const NUL_ESCAPE = `${String.fromCharCode(92)}u0000`;
const CSV =
  "WP Number,Name,Phase,Status,Tonnage,Crew\r\n" +
  "WP-001,Anchor Bolts,Detailing,Not Started,18,Detailing\r\n";
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

describe("readOnboardingImportFile", () => {
  it.each([
    { label: "with a BOM", bom: true },
    { label: "without a BOM", bom: false },
  ])("decodes a UTF-16LE CSV $label into clean staged rows", async ({ bom }) => {
    const { text, sourceName } = await readOnboardingImportFile(
      file(utf16le(CSV, bom), "work-packages.csv"),
    );
    expect(sourceName).toBe("work-packages.csv");
    expect(text).toBe(CSV);
    expect(text).not.toContain(NUL);

    const staged = stageImportText({
      targetKey: "workPackages",
      text,
      project: { id: "p1", name: "Job 1" },
    });
    expect(staged.invalidRows).toEqual([]);
    expect(staged.validRecords).toHaveLength(1);
    expect(staged.validRecords[0]).toMatchObject({ name: "Anchor Bolts" });
    expect(JSON.stringify(staged.validRecords)).not.toContain(NUL_ESCAPE);
  });

  it("rejects a binary container (zip / .xlsx bytes) named .csv with re-save guidance", async () => {
    const error = await readOnboardingImportFile(file(ZIP_BYTES, "work-packages.csv")).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(TextDecodingError);
    expect((error as Error).message).toMatch(/CSV UTF-8/);
  });

  it("still reads a real .xlsx workbook through XLSX, not the text decoder", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([["WP Number", "Name"], ["WP-001", "Anchor Bolts"]]),
      "Packages",
    );
    const bytes = new Uint8Array(
      XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer,
    );
    const { text, sourceName } = await readOnboardingImportFile(file(bytes, "wp.xlsx"));
    expect(sourceName).toBe("wp.xlsx / Packages");
    expect(text).toContain("Anchor Bolts");
  });

  it("decodes plain UTF-8, UTF-8 with a BOM and Windows-1252 bytes exactly as file.text() did", async () => {
    const cases = [
      utf8(CSV),
      new Uint8Array([0xef, 0xbb, 0xbf, ...utf8(CSV)]),
      new Uint8Array([...utf8("WP Number,Name\r\nWP-001,PL1/2"), 0xbd, 0x0d, 0x0a]),
    ];
    for (const bytes of cases) {
      const upload = file(bytes, "work-packages.csv");
      expect((await readOnboardingImportFile(upload)).text).toBe(await upload.text());
    }
    expect((await readOnboardingImportFile(file(utf8(CSV), "work-packages.csv"))).text).toBe(CSV);
  });
});
