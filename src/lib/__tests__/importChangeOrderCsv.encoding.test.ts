import { File as NodeFile } from "node:buffer";
import { describe, expect, it } from "vitest";
import { toUserErrorMessage } from "@/lib/mutations/standardMutation";
import { TextDecodingError } from "@/lib/textDecoding";
import { parseChangeOrderCsv, readChangeOrderCsvFile } from "../importChangeOrderCsv";

// Regression coverage for Sentry JAVASCRIPT-REACT-2C (Postgres 22P05): the CO
// log was read with file.text(), which decodes as UTF-8, so a UTF-16 export
// (Excel "Unicode text", Sage, Vista) put U+0000 into the values that
// ChangeOrderImportModal sends to ChangeOrder.create.

const BACKSLASH = String.fromCharCode(92);
/** How JSON.stringify (and so the PostgREST request body) spells U+0000. */
const NUL_ESCAPE = `${BACKSLASH}u0000`;
const REPLACEMENT_CHARACTER = String.fromCharCode(0xfffd);
const FILE_NAME = "co-log.csv";

const CSV =
  "CO Number,Title,Status,Amount\r\n" +
  '14,Extra beams,Approved,"$1,500.00"\r\n' +
  "15,Deck change,Submitted,900\r\n";

type CoSummary = {
  co_number: string;
  title: string;
  status: string;
  co_amount: number | null;
};

const EXPECTED: CoSummary[] = [
  { co_number: "14", title: "Extra beams", status: "Approved", co_amount: 1500 },
  { co_number: "15", title: "Deck change", status: "Submitted", co_amount: 900 },
];

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

function utf32leWithBom(text: string): Uint8Array {
  const out: number[] = [0xff, 0xfe, 0, 0];
  for (let index = 0; index < text.length; index += 1) {
    out.push(text.charCodeAt(index), 0, 0, 0);
  }
  return new Uint8Array(out);
}

// Node's File is a spec Blob with arrayBuffer() and text().
function csvFile(bytes: Uint8Array): File {
  return new NodeFile([bytes], FILE_NAME, { type: "text/csv" }) as unknown as File;
}

function summarize(cos: readonly CoSummary[]): CoSummary[] {
  return cos.map(({ co_number, title, status, co_amount }) => ({
    co_number,
    title,
    status,
    co_amount,
  }));
}

function hasNul(value: unknown): boolean {
  return JSON.stringify(value).includes(NUL_ESCAPE);
}

describe("readChangeOrderCsvFile text encodings", () => {
  it.each([
    ["UTF-16LE with a BOM", utf16le(CSV, true)],
    ["UTF-16LE without a BOM", utf16le(CSV, false)],
  ] as const)("decodes a %s CO log to the real rows with no U+0000", async (_label, bytes) => {
    const result = await readChangeOrderCsvFile(csvFile(bytes));
    expect(hasNul(result)).toBe(false);
    expect(summarize(result.cos)).toEqual(EXPECTED);
    expect(result.warnings).toEqual([]);
  });

  it("strips a raw 0x00 byte and notes the removal in the preview warnings", async () => {
    const bytes = new Uint8Array([
      ...utf8("CO Number,Title,Status,Amount\r\n14,Extra"),
      0,
      ...utf8(" beams,Approved,1500\r\n"),
    ]);
    const result = await readChangeOrderCsvFile(csvFile(bytes));
    expect(hasNul(result)).toBe(false);
    expect(result.cos[0]?.title).toBe("Extra beams");
    expect(result.warnings).toEqual(["Removed 1 null character from the file."]);
  });

  it("rejects a zip container (an .xlsx renamed .csv) with a message the modal shows as-is", async () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...utf8("xl/workbook.xml")]);
    const error: unknown = await readChangeOrderCsvFile(csvFile(bytes)).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(TextDecodingError);
    // ChangeOrderImportModal.runParse: setErr(toUserErrorMessage(e, String(e))).
    const shown = toUserErrorMessage(error, "fallback");
    expect(shown).toBe((error as Error).message);
    expect(shown).toMatch(/CSV UTF-8/);
  });

  it("rejects a UTF-32 CO log with re-save guidance", async () => {
    await expect(readChangeOrderCsvFile(csvFile(utf32leWithBom(CSV)))).rejects.toThrow(
      /UTF-32.*CSV UTF-8/,
    );
  });

  it.each([
    ["plain UTF-8", utf8(CSV)],
    ["UTF-8 with a BOM", new Uint8Array([0xef, 0xbb, 0xbf, ...utf8(CSV)])],
  ] as const)("parses %s exactly as before", async (_label, bytes) => {
    const result = await readChangeOrderCsvFile(csvFile(bytes));
    expect(result).toEqual(parseChangeOrderCsv(CSV, { fileName: FILE_NAME }));
    expect(summarize(result.cos)).toEqual(EXPECTED);
  });

  it("still decodes a Windows-1252 byte to U+FFFD, as file.text() did", async () => {
    const bytes = new Uint8Array([
      ...utf8("CO Number,Title,Status,Amount\r\n14,PL1/2"),
      0xbd,
      ...utf8(" plate,Approved,1500\r\n"),
    ]);
    const before = parseChangeOrderCsv(await csvFile(bytes).text(), { fileName: FILE_NAME });
    const result = await readChangeOrderCsvFile(csvFile(bytes));
    expect(result).toEqual(before);
    expect(result.cos[0]?.title).toBe(`PL1/2${REPLACEMENT_CHARACTER} plate`);
  });
});
