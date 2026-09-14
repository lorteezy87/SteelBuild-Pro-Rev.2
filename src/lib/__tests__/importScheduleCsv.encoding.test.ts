import { File as NodeFile } from "node:buffer";
import { describe, expect, it } from "vitest";
import { toUserErrorMessage } from "@/lib/mutations/standardMutation";
import { TextDecodingError } from "@/lib/textDecoding";
import {
  parseScheduleCsv,
  readScheduleCsvFile,
  SCHEDULE_CSV_TEMPLATE,
} from "../importScheduleCsv";

// Regression coverage for Sentry JAVASCRIPT-REACT-2C (Postgres 22P05): a
// UTF-16 schedule export read with `file.text()` (UTF-8 only) put U+0000 into
// task names, and the import modal's commit sent them to schedule_tasks.

const BACKSLASH = String.fromCharCode(92);
/** How JSON.stringify (and so the PostgREST body) spells U+0000. */
const NUL_ESCAPE = `${BACKSLASH}u0000`;
const REPLACEMENT = String.fromCharCode(0xfffd);

type Encoding = "utf8" | "utf8bom" | "utf16le" | "utf16lebom";

function encode(text: string, encoding: Encoding): Uint8Array {
  const utf8 = new TextEncoder().encode(text);
  if (encoding === "utf8") return utf8;
  if (encoding === "utf8bom") return new Uint8Array([0xef, 0xbb, 0xbf, ...utf8]);
  const out: number[] = encoding === "utf16lebom" ? [0xff, 0xfe] : [];
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    out.push(unit & 0xff, unit >> 8);
  }
  return new Uint8Array(out);
}

// Node's File is a spec Blob (arrayBuffer, size, type); jsdom's is not.
function csvFile(bytes: Uint8Array, name = "schedule.csv"): File {
  return new NodeFile([bytes], name, { type: "text/csv" }) as unknown as File;
}

function hasNul(value: unknown): boolean {
  return JSON.stringify(value).includes(NUL_ESCAPE);
}

const TASK_NAMES = ["Fabrication", "Weld beams", "Paint"];
/** Excel "Unicode text" is tab-delimited UTF-16LE with a BOM. */
const TSV = SCHEDULE_CSV_TEMPLATE.split("\n")
  .map((line) => line.split(",").join("\t"))
  .join("\r\n");
/** Local-file-header signature of a zip container (.xlsx, .docx). */
const ZIP_BYTES = new Uint8Array([
  0x50, 0x4b, 0x03, 0x04,
  ...new TextEncoder().encode("[Content_Types].xml"),
]);

describe("readScheduleCsvFile text encodings", () => {
  it("decodes an Excel Unicode-text export (UTF-16LE with a BOM) to clean tasks", async () => {
    const result = await readScheduleCsvFile(csvFile(encode(TSV, "utf16lebom"), "schedule.txt"));
    expect(hasNul(result)).toBe(false);
    expect(result.tasks.map((task) => task.name)).toEqual(TASK_NAMES);
    expect(result).toEqual(parseScheduleCsv(TSV, { fileName: "schedule.txt" }));
  });

  it("decodes a UTF-16LE CSV without a BOM to clean tasks", async () => {
    const result = await readScheduleCsvFile(csvFile(encode(SCHEDULE_CSV_TEMPLATE, "utf16le")));
    expect(hasNul(result)).toBe(false);
    expect(result.tasks.map((task) => task.name)).toEqual(TASK_NAMES);
    expect(result.tasks[2].preds).toEqual([
      { predUid: "1.1", linkType: "1", lagDuration: "4800" },
    ]);
    expect(result).toEqual(
      parseScheduleCsv(SCHEDULE_CSV_TEMPLATE, { fileName: "schedule.csv" }),
    );
  });

  it("strips raw 0x00 bytes and notes the count in the preview warnings", async () => {
    const [head, tail] = SCHEDULE_CSV_TEMPLATE.split("Weld beams");
    const bytes = new Uint8Array([
      ...new TextEncoder().encode(`${head}Weld`),
      0,
      ...new TextEncoder().encode(` beams${tail}`),
      0, 0, 0,
    ]);
    const result = await readScheduleCsvFile(csvFile(bytes));
    expect(hasNul(result)).toBe(false);
    expect(result.tasks.map((task) => task.name)).toEqual(TASK_NAMES);
    expect(result.warnings).toContain("Removed 4 null characters from the file.");
  });

  it("rejects a zip container (.xlsx bytes) with re-save guidance", async () => {
    await expect(readScheduleCsvFile(csvFile(ZIP_BYTES))).rejects.toThrow(/CSV UTF-8/);
  });

  it("keeps the guidance intact through the modal's error path", async () => {
    const error: unknown = await readScheduleCsvFile(csvFile(ZIP_BYTES)).then(
      (): unknown => null,
      (reason: unknown): unknown => reason,
    );
    expect(error).toBeInstanceOf(TextDecodingError);
    // ScheduleCsvImportModal.runParse: setErr(toUserErrorMessage(e, String(e))).
    expect(toUserErrorMessage(error, String(error))).toMatch(/CSV UTF-8/);
  });

  it("keeps plain UTF-8 and UTF-8 with a BOM unchanged", async () => {
    const expected = parseScheduleCsv(SCHEDULE_CSV_TEMPLATE, { fileName: "schedule.csv" });
    for (const encoding of ["utf8", "utf8bom"] as const) {
      const result = await readScheduleCsvFile(csvFile(encode(SCHEDULE_CSV_TEMPLATE, encoding)));
      expect(result).toEqual(expected);
    }
  });

  it("still reads a legacy Windows-1252 byte as U+FFFD, exactly as file.text() did", async () => {
    const bytes = new Uint8Array([
      ...new TextEncoder().encode("Task Name,Notes\r\nPlate,PL1/2"),
      0xbd,
      0x0d,
      0x0a,
    ]);
    const result = await readScheduleCsvFile(csvFile(bytes));
    expect(result).toEqual(
      parseScheduleCsv(new TextDecoder("utf-8").decode(bytes), { fileName: "schedule.csv" }),
    );
    expect(result.tasks[0].notes).toBe(`PL1/2${REPLACEMENT}`);
  });
});
