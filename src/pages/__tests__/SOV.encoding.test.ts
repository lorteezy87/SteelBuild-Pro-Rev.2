import { File as NodeFile } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import { aoaToRows, parseCsvToAoa } from "@/lib/importSovSpreadsheet";
import { TextDecodingError } from "@/lib/textDecoding";
import { readSovCsvRows } from "../SOV";

// The page module loads the data layer at import time; the CSV helper never
// touches it.
vi.mock("@/api/supabaseClient", () => ({ entities: {} }));

// Regression coverage for Sentry JAVASCRIPT-REACT-2C (Postgres 22P05): the SOV
// page read CSV imports with file.text(), which decodes as UTF-8, so a UTF-16
// export put U+0000 into the rows handed to SOVItem.bulkCreate.

const BACKSLASH = String.fromCharCode(92);
/** How JSON.stringify (and so the PostgREST request body) spells U+0000. */
const NUL_ESCAPE = `${BACKSLASH}u0000`;
const REPLACEMENT_CHARACTER = String.fromCharCode(0xfffd);

const CSV =
  "Description,Scheduled Value\r\n" +
  "Structural steel,125000.00\r\n" +
  '"Deck, 20 ga",48000\r\n';

const EXPECTED = [
  { description: "Structural steel", scheduled_value: "125000.00" },
  { description: "Deck, 20 ga", scheduled_value: "48000" },
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

// Node's File is a spec Blob with arrayBuffer() and text().
function csvFile(bytes: Uint8Array): File {
  return new NodeFile([bytes], "sov.csv", { type: "text/csv" }) as unknown as File;
}

describe("readSovCsvRows text encodings", () => {
  it.each([
    ["UTF-16LE with a BOM", utf16le(CSV, true)],
    ["UTF-16LE without a BOM", utf16le(CSV, false)],
  ] as const)("decodes a %s SOV CSV to the real rows with no U+0000", async (_label, bytes) => {
    const rows = await readSovCsvRows(csvFile(bytes));
    expect(JSON.stringify(rows).includes(NUL_ESCAPE)).toBe(false);
    expect(rows).toEqual(EXPECTED);
  });

  it("rejects a zip container (an .xlsx renamed .csv) with re-save guidance", async () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...utf8("xl/workbook.xml")]);
    const error: unknown = await readSovCsvRows(csvFile(bytes)).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(TextDecodingError);
    // handleImportFile toasts "Could not read file: " + err.message.
    expect((error as Error).message).toMatch(/CSV UTF-8/);
  });

  it.each([
    ["plain UTF-8", utf8(CSV)],
    ["UTF-8 with a BOM", new Uint8Array([0xef, 0xbb, 0xbf, ...utf8(CSV)])],
  ] as const)("parses %s exactly as before", async (_label, bytes) => {
    const rows = await readSovCsvRows(csvFile(bytes));
    expect(rows).toEqual(aoaToRows(parseCsvToAoa(CSV)));
    expect(rows).toEqual(EXPECTED);
  });

  it("still decodes a Windows-1252 byte to U+FFFD, as file.text() did", async () => {
    const bytes = new Uint8Array([
      ...utf8("Description,Scheduled Value\r\nPL1/2"),
      0xbd,
      ...utf8(" plate,900\r\n"),
    ]);
    const before = aoaToRows(parseCsvToAoa(await csvFile(bytes).text()));
    const rows = await readSovCsvRows(csvFile(bytes));
    expect(rows).toEqual(before);
    expect(rows).toEqual([
      { description: `PL1/2${REPLACEMENT_CHARACTER} plate`, scheduled_value: "900" },
    ]);
  });
});
