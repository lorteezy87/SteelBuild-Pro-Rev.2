// @vitest-environment jsdom
// jsdom supplies DOMParser for the FabSuite XML path.

import { File as NodeFile } from "node:buffer";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { readPieceImportFile } from "../importAdapters";
import type { PieceImportSourceType } from "../reconciliation";

// Regression coverage for Sentry JAVASCRIPT-REACT-2C (Postgres 22P05): a
// UTF-16 / NUL-bearing import decoded as UTF-8 put U+0000 into the jsonb
// `p_rows` sent to stage_piece_import_batch.

const BACKSLASH = String.fromCharCode(92);
/** How JSON.stringify (and so the RPC body) spells U+0000. */
const NUL_ESCAPE = `${BACKSLASH}u0000`;

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

// jsdom 25's File has no arrayBuffer()/text(); Node's File is a spec Blob.
function file(bytes: Uint8Array, name: string): File {
  return new NodeFile([bytes], name) as unknown as File;
}

function hasNul(value: unknown): boolean {
  return JSON.stringify(value).includes(NUL_ESCAPE);
}

const CSV = "piece_mark,quantity,profile\r\nB1,2,W12X26\r\nC2,1,W10X33\r\n";
const EXPECTED = [
  { piece_mark: "B1", quantity: "2", profile: "W12X26" },
  { piece_mark: "C2", quantity: "1", profile: "W10X33" },
];

describe("readPieceImportFile text encodings", () => {
  const utf16Encodings: Encoding[] = ["utf16le", "utf16lebom", "utf16be", "utf16bebom"];
  const csvSources: PieceImportSourceType[] = [
    "csv",
    "production_status",
    "shipping_list",
    "model_elements",
    "manual",
  ];
  const cases = utf16Encodings.flatMap((encoding) =>
    csvSources.map((source) => ({ encoding, source })),
  );

  it.each(cases)(
    "$source source, $encoding CSV: decodes to the real rows with no U+0000",
    async ({ encoding, source }) => {
      const { rows, nulsRemoved } = await readPieceImportFile(
        file(encode(CSV, encoding), "pieces.csv"),
        source,
      );
      expect(hasNul(rows)).toBe(false);
      expect(rows).toEqual(EXPECTED);
      expect(nulsRemoved).toBe(0);
    },
  );

  it("strips raw 0x00 bytes (one embedded, four trailing padding) and counts them", async () => {
    const bytes = new Uint8Array([
      ...new TextEncoder().encode("piece_mark,quantity,profile\r\nB1"),
      0,
      ...new TextEncoder().encode(",2,W12X26\r\nC2,1,W10X33\r\n"),
      0, 0, 0, 0,
    ]);
    const { rows, nulsRemoved } = await readPieceImportFile(file(bytes, "pieces.csv"), "csv");
    expect(hasNul(rows)).toBe(false);
    expect(rows).toEqual(EXPECTED);
    expect(nulsRemoved).toBe(5);
  });

  it("strips a JSON-escaped U+0000 in a manual .json import", async () => {
    const json = `[{"piece_mark":"B1${NUL_ESCAPE}","quantity":2}]`;
    const { rows, nulsRemoved } = await readPieceImportFile(
      file(encode(json, "utf8"), "rows.json"),
      "manual",
    );
    expect(rows).toEqual([{ piece_mark: "B1", quantity: 2 }]);
    expect(hasNul(rows)).toBe(false);
    expect(nulsRemoved).toBe(1);
  });

  it("parses a KISS MEMBER dump saved as UTF-16LE without a BOM", async () => {
    const text = "MEMBER\r\nC1 2 W10X12 A992 120 400\r\nEND_MEMBER\r\n";
    const { rows } = await readPieceImportFile(file(encode(text, "utf16le"), "job.kss"), "kiss");
    expect(rows.map((row) => row.piece_mark)).toEqual(["C1"]);
  });

  it("parses a KISS CSV saved as UTF-16LE with a BOM", async () => {
    const text = "Mark,Qty,Shape,Grade\r\nB-10,4,W12X26,A992\r\n";
    const { rows } = await readPieceImportFile(file(encode(text, "utf16lebom"), "job.csv"), "kiss");
    expect(rows.map((row) => row.piece_mark)).toEqual(["B-10"]);
  });

  it("aggregates an IFC roster CSV saved as UTF-16LE", async () => {
    const { rows } = await readPieceImportFile(file(encode(CSV, "utf16le"), "roster.csv"), "ifc");
    expect(rows.map((row) => row.piece_mark)).toEqual(["B1", "C2"]);
    expect(hasNul(rows)).toBe(false);
  });

  it("parses FabSuite XML saved as UTF-16LE without a BOM", async () => {
    const xml =
      `<?xml version="1.0" encoding="UTF-16"?>\r\n` +
      `<FabSuiteDataExchange xmlns="http://www.fabsuite.com/xml/fabsuite-xml-v0108.xsd">\r\n` +
      `<Assembly><AssemblyMark>B1</AssemblyMark><AssemblyQuantity>2</AssemblyQuantity>` +
      `<ModelRef>ID-0001</ModelRef><AssemblyPart><MainMember>true</MainMember>` +
      `<Dimensions>W12X26</Dimensions><Grade>A992</Grade><WeightEach>100</WeightEach>` +
      `<PartQuantity>1</PartQuantity></AssemblyPart></Assembly>\r\n</FabSuiteDataExchange>\r\n`;
    const { rows } = await readPieceImportFile(
      file(encode(xml, "utf16le"), "export.xml"),
      "fabsuite_xml",
    );
    expect(rows[0]?.piece_mark).toBe("B1");
    expect(hasNul(rows)).toBe(false);
  });

  it("rejects a UTF-32 file with re-save guidance", async () => {
    await expect(
      readPieceImportFile(file(encode(CSV, "utf32lebom"), "pieces.csv"), "csv"),
    ).rejects.toThrow(/UTF-32.*CSV UTF-8/);
  });

  it("rejects an .xlsx workbook picked under the CSV source instead of staging garbage", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([["piece_mark", "quantity"], ["B1", 2], ["C2", 1]]),
      "Pieces",
    );
    const bytes = new Uint8Array(
      XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer,
    );
    await expect(readPieceImportFile(file(bytes, "pieces.xlsx"), "csv")).rejects.toThrow(
      /CSV UTF-8/,
    );
  });

  it("keeps plain UTF-8 and UTF-8 with a BOM unchanged", async () => {
    for (const encoding of ["utf8", "utf8bom"] as const) {
      const { rows, nulsRemoved } = await readPieceImportFile(
        file(encode(CSV, encoding), "pieces.csv"),
        "csv",
      );
      expect(rows).toEqual(EXPECTED);
      expect(nulsRemoved).toBe(0);
    }
  });

  it("still imports a Windows-1252 byte without throwing, as before", async () => {
    const bytes = new Uint8Array([
      ...new TextEncoder().encode("piece_mark,profile\r\nB1,PL1/2"),
      0xbd,
      0x0d,
      0x0a,
    ]);
    const { rows } = await readPieceImportFile(file(bytes, "legacy.csv"), "csv");
    expect(rows).toHaveLength(1);
    expect(rows[0].piece_mark).toBe("B1");
  });
});
