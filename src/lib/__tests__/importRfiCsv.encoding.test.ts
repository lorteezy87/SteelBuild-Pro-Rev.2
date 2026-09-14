import { File as NodeFile } from "node:buffer";
import { describe, expect, it, vi } from "vitest";

// importRfiLog (the commit step) imports the Supabase client; stub it so the
// DB-bound row builder can run without a network or env.
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
    functions: { invoke: vi.fn() },
    storage: { from: vi.fn() },
  },
}));

vi.mock("@/api/supabaseClient", () => ({
  integrations: { Core: { UploadFile: vi.fn() } },
}));

import { readRfiCsvFile } from "../importRfiCsv";
import { buildRfiImportRows } from "../importRfiLog";
import { TextDecodingError } from "../textDecoding";

// Regression coverage for Sentry JAVASCRIPT-REACT-2C (Postgres 22P05): an RFI
// log saved as UTF-16 (Excel "Unicode text") decoded as UTF-8 put U+0000 into
// the rows commitRfiLog inserts into `rfis`.

const BACKSLASH = String.fromCharCode(92);
/** How JSON.stringify (and so the PostgREST insert body) spells U+0000. */
const NUL_ESCAPE = `${BACKSLASH}u0000`;
const REPLACEMENT = String.fromCharCode(0xfffd);

type Encoding =
  | "utf8"
  | "utf8bom"
  | "utf16le"
  | "utf16lebom"
  | "utf16be"
  | "utf16bebom"
  | "utf32lebom";

function encode(text: string, encoding: Encoding): Uint8Array {
  if (encoding === "utf8") return new TextEncoder().encode(text);
  if (encoding === "utf8bom") {
    return new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(text)]);
  }
  if (encoding === "utf32lebom") {
    const out = [0xff, 0xfe, 0, 0];
    for (const character of text) {
      const code = character.codePointAt(0) ?? 0;
      out.push(code & 0xff, (code >> 8) & 0xff, 0, 0);
    }
    return new Uint8Array(out);
  }
  const littleEndian = encoding.startsWith("utf16le");
  const out: number[] = encoding.endsWith("bom")
    ? littleEndian ? [0xff, 0xfe] : [0xfe, 0xff]
    : [];
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    if (littleEndian) out.push(unit & 0xff, unit >> 8);
    else out.push(unit >> 8, unit & 0xff);
  }
  return new Uint8Array(out);
}

// Node's File is a spec Blob with arrayBuffer(), name, type and size.
function file(bytes: Uint8Array, name: string): File {
  return new NodeFile([bytes], name) as unknown as File;
}

function hasNul(value: unknown): boolean {
  return JSON.stringify(value).includes(NUL_ESCAPE);
}

const HEADER = "RFI #,Subject,Assigned To,Date Submitted,Due Date,Date Answered\r\n";
const ROW_1 = "1,Grid line B conflict,Smith Engineering,5/1/2026,5/8/2026,5/6/2026\r\n";
const ROW_2 = "2,Beam pocket depth,Jones Architects,5/2/2026,5/9/2026,\r\n";
const CSV = HEADER + ROW_1 + ROW_2;

const EXPECTED_RFIS = [
  {
    rfi_number: "1",
    title: "Grid line B conflict",
    assigned_to: "Smith Engineering",
    date_submitted: "5/1/2026",
    iso_submitted: "2026-05-01",
    date_required: "5/8/2026",
    iso_required: "2026-05-08",
    date_answered: "5/6/2026",
    iso_answered: "2026-05-06",
  },
  {
    rfi_number: "2",
    title: "Beam pocket depth",
    assigned_to: "Jones Architects",
    date_submitted: "5/2/2026",
    iso_submitted: "2026-05-02",
    date_required: "5/9/2026",
    iso_required: "2026-05-09",
    date_answered: null,
    iso_answered: null,
  },
];

describe("readRfiCsvFile text encodings", () => {
  const utf16Encodings: Encoding[] = ["utf16lebom", "utf16le", "utf16bebom", "utf16be"];

  it.each(utf16Encodings)(
    "%s RFI log decodes to the real rows with no U+0000",
    async (encoding) => {
      const result = await readRfiCsvFile(file(encode(CSV, encoding), "rfis.csv"));
      expect(hasNul(result)).toBe(false);
      expect(result.rfis).toEqual(EXPECTED_RFIS);
      expect(result.warnings).toEqual([]);
    },
  );

  it("parses an Excel \"Unicode text\" export (UTF-16LE with a BOM, tab-delimited)", async () => {
    const tsv = CSV.split(",").join("\t");
    const result = await readRfiCsvFile(file(encode(tsv, "utf16lebom"), "RFI Log.txt"));
    expect(hasNul(result)).toBe(false);
    expect(result.rfis).toEqual(EXPECTED_RFIS);
  });

  it("builds NUL-free rfis insert rows from a BOM-less UTF-16LE log", async () => {
    const parsed = await readRfiCsvFile(file(encode(CSV, "utf16le"), "rfis.csv"));
    const { rows, skipped } = buildRfiImportRows({
      // importRfiLog.js is untyped: its `rfis = []` default infers never[].
      rfis: parsed.rfis as never[],
      projectId: "project-1",
      projectName: "Test Project",
      existingNumbers: new Set<string>(),
    });
    // `rows` is the body commitRfiLog sends to PostgREST.
    expect(hasNul(rows)).toBe(false);
    expect(skipped).toBe(0);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      rfi_number: "RFI #001",
      title: "Grid line B conflict",
      submitted_date: "2026-05-01",
      date_answered: "2026-05-06",
      status: "Closed",
    });
    expect(rows[1]).toMatchObject({ rfi_number: "RFI #002", status: "Open" });
  });

  it("strips raw 0x00 bytes (one embedded, four trailing padding)", async () => {
    const bytes = new Uint8Array([
      ...new TextEncoder().encode(`${HEADER}1,Grid line B`),
      0,
      ...new TextEncoder().encode(
        ` conflict,Smith Engineering,5/1/2026,5/8/2026,5/6/2026\r\n${ROW_2}`,
      ),
      0, 0, 0, 0,
    ]);
    const result = await readRfiCsvFile(file(bytes, "rfis.csv"));
    expect(hasNul(result)).toBe(false);
    expect(result.rfis).toEqual(EXPECTED_RFIS);
  });

  it("rejects a zip container (.xlsx bytes) named .csv with re-save guidance", async () => {
    const bytes = new Uint8Array([
      0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00,
      ...new TextEncoder().encode("[Content_Types].xml"),
    ]);
    const read = readRfiCsvFile(file(bytes, "rfis.csv"));
    await expect(read).rejects.toBeInstanceOf(TextDecodingError);
    // RfiLogImportModal shows `e.message` in its error box.
    await expect(read).rejects.toThrow(/doesn't look like a text export.*CSV UTF-8/);
  });

  it("rejects a UTF-32 file with re-save guidance", async () => {
    await expect(
      readRfiCsvFile(file(encode(CSV, "utf32lebom"), "rfis.csv")),
    ).rejects.toThrow(/UTF-32.*CSV UTF-8/);
  });

  it("keeps plain UTF-8 and UTF-8 with a BOM unchanged", async () => {
    for (const encoding of ["utf8", "utf8bom"] as const) {
      const result = await readRfiCsvFile(file(encode(CSV, encoding), "rfis.csv"));
      expect(result.rfis).toEqual(EXPECTED_RFIS);
      expect(result.warnings).toEqual([]);
    }
  });

  it("still imports a Windows-1252 byte as U+FFFD, as before", async () => {
    const bytes = new Uint8Array([
      ...new TextEncoder().encode(`${HEADER}3,Plate 1/2`),
      0xbd, // "½" in Windows-1252; not valid UTF-8
      ...new TextEncoder().encode(" thickness,Smith Engineering,5/3/2026,,\r\n"),
    ]);
    const result = await readRfiCsvFile(file(bytes, "legacy.csv"));
    expect(result.rfis).toHaveLength(1);
    expect(result.rfis[0]).toMatchObject({
      rfi_number: "3",
      title: `Plate 1/2${REPLACEMENT} thickness`,
    });
  });
});
