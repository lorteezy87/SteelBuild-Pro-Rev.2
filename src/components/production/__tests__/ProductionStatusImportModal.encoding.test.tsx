// @vitest-environment jsdom
//
// Regression coverage for Sentry JAVASCRIPT-REACT-2C (Postgres 22P05). The
// production-status importer read uploads with `file.text()`, which is UTF-8
// only, so a UTF-16 or NUL-bearing EPM / FabSuite CSV carried U+0000 into the
// rows written to piece_production.

import { File as NodeFile } from "node:buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { parseProductionCsv } from "@/lib/importProductionStatus";
import { TextDecodingError } from "@/lib/textDecoding";

const { commitProductionRows } = vi.hoisted(() => ({ commitProductionRows: vi.fn() }));
vi.mock("@/lib/production/repository", () => ({ commitProductionRows }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn(), warning: vi.fn() },
}));

import ProductionStatusImportModal, {
  readProductionStatusFile,
} from "../ProductionStatusImportModal";

const BACKSLASH = String.fromCharCode(92);
/** How JSON.stringify (and so the PostgREST body) spells U+0000. */
const NUL_ESCAPE = `${BACKSLASH}u0000`;

const CSV =
  [
    "Piece Mark,Assembly,Status,% Complete,Qty,Weight,Sequence,Area",
    "B-101,A-1,Welding,60,2,450,S1,North",
    "C-200,A-2,Shipped,100,1,300,S2,South",
  ].join("\r\n") + "\r\n";
const EXPECTED = parseProductionCsv(CSV, { existing: [] });

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function utf16(text: string, order: "le" | "be", bom: boolean): Uint8Array {
  const out: number[] = bom ? (order === "le" ? [0xff, 0xfe] : [0xfe, 0xff]) : [];
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    if (order === "le") out.push(unit & 0xff, unit >> 8);
    else out.push(unit >> 8, unit & 0xff);
  }
  return new Uint8Array(out);
}

/** Starts with the zip local-file signature, as an .xlsx does. */
const ZIP_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...utf8("x".repeat(64))]);

const WINDOWS_1252 = new Uint8Array([
  ...utf8("Piece Mark,Status\r\nPL1/2"),
  0xbd,
  ...utf8(",Welding\r\n"),
]);

// jsdom 25's File has no arrayBuffer(); Node's File is a spec Blob.
function csvFile(bytes: Uint8Array, name = "production.csv"): File {
  return new NodeFile([bytes], name, { type: "text/csv" }) as unknown as File;
}

function hasNul(value: unknown): boolean {
  return JSON.stringify(value).includes(NUL_ESCAPE);
}

/** What the old `file.text()` read produced: a UTF-8 decode that drops a UTF-8 BOM. */
function legacyText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

describe("readProductionStatusFile text encodings", () => {
  it.each([
    ["UTF-16LE with a BOM", "le", true],
    ["UTF-16LE without a BOM", "le", false],
    ["UTF-16BE with a BOM", "be", true],
    ["UTF-16BE without a BOM", "be", false],
  ] as const)("%s: stages the real rows with no U+0000", async (_label, order, bom) => {
    const res = await readProductionStatusFile(csvFile(utf16(CSV, order, bom)), []);
    expect(hasNul(res)).toBe(false);
    expect(res).toEqual(EXPECTED);
    expect(res.rows.map((row) => row.piece_mark)).toEqual(["B-101", "C-200"]);
  });

  it("classifies a UTF-16 export against the existing rows it is given", async () => {
    const existing = [{ id: "pp-1", piece_mark: "B-101", is_deleted: false }];
    const res = await readProductionStatusFile(csvFile(utf16(CSV, "le", false)), existing);
    expect(res.rows.find((row) => row.piece_mark === "B-101")).toMatchObject({
      action: "update",
      existing_id: "pp-1",
    });
    expect(res.stats).toEqual({ create: 1, update: 1, skipped: 0 });
  });

  it("strips raw 0x00 bytes inside a cell and as trailing padding", async () => {
    const bytes = new Uint8Array([
      ...utf8("Piece Mark,Assembly,Status,% Complete,Qty,Weight,Sequence,Area\r\nB-1"),
      0,
      ...utf8("01,A-1,Welding,60,2,450,S1,North\r\nC-200,A-2,Shipped,100,1,300,S2,South\r\n"),
      0, 0, 0, 0,
    ]);
    const res = await readProductionStatusFile(csvFile(bytes), []);
    expect(hasNul(res)).toBe(false);
    expect(res).toEqual(EXPECTED);
  });

  it("rejects a binary container with the decoder's re-save guidance", async () => {
    const read = readProductionStatusFile(csvFile(ZIP_BYTES), []);
    await expect(read).rejects.toBeInstanceOf(TextDecodingError);
    await expect(read).rejects.toThrow(/CSV UTF-8/);
  });

  it.each([
    ["plain UTF-8", utf8(CSV)],
    ["UTF-8 with a BOM", new Uint8Array([0xef, 0xbb, 0xbf, ...utf8(CSV)])],
    ["a legacy Windows-1252 byte (U+FFFD, as before)", WINDOWS_1252],
  ])("%s: stages exactly what the old UTF-8 read did", async (_label, bytes) => {
    const res = await readProductionStatusFile(csvFile(bytes), []);
    expect(res).toEqual(parseProductionCsv(legacyText(bytes), { existing: [] }));
    expect(res.rows.length).toBeGreaterThan(0);
  });
});

function fileInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("file input not rendered");
  return input;
}

function renderModal() {
  render(
    <ProductionStatusImportModal
      open
      projectId="p1"
      projectName="Skyport"
      existing={[]}
      onClose={vi.fn()}
      onImported={vi.fn()}
    />,
  );
}

describe("ProductionStatusImportModal upload encodings", () => {
  beforeEach(() => {
    commitProductionRows.mockReset();
    commitProductionRows.mockResolvedValue({ created: 2, updated: 0 });
  });

  it("imports a BOM-less UTF-16LE export with no U+0000 reaching the writer", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.upload(fileInput(), csvFile(utf16(CSV, "le", false)));
    await user.click(await screen.findByRole("button", { name: /Review pieces/i }));
    await screen.findByText("B-101");
    await user.click(screen.getByRole("button", { name: /Import 2 pieces/i }));

    await waitFor(() => expect(commitProductionRows).toHaveBeenCalledTimes(1));
    const [projectId, rows] = commitProductionRows.mock.calls[0];
    expect(projectId).toBe("p1");
    expect(hasNul(rows)).toBe(false);
    expect(rows).toEqual(EXPECTED.rows);
  });

  it("shows the decoder's re-save message in the existing error alert and writes nothing", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.upload(fileInput(), csvFile(ZIP_BYTES));
    await user.click(await screen.findByRole("button", { name: /Review pieces/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/doesn't look like a text export.*CSV UTF-8/);
    expect(commitProductionRows).not.toHaveBeenCalled();
  });
});
