// @vitest-environment jsdom
// jsdom renders the modal for the error-banner and commit-payload tests.

import { File as NodeFile } from "node:buffer";
import { createElement, type ComponentType } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression coverage for Sentry JAVASCRIPT-REACT-2C (Postgres 22P05): the
// member importer read its CSV with `file.text()` (UTF-8 only), so a UTF-16
// Tekla / SDS2 export staged piece marks full of U+0000 into model_elements.

const mocks = vi.hoisted(() => ({
  bulkCreate: vi.fn(async (rows: unknown[]) => rows),
  update: vi.fn(async (id: string, patch: unknown) => ({ id, patch })),
}));

vi.mock("@/api/supabaseClient", () => ({ entities: { ModelElement: mocks } }));
vi.mock("@/lib/ifc/fetchAllModelElements", () => ({ fetchAllModelElements: vi.fn(async () => []) }));
vi.mock("@/services/cacheRegistry", () => ({ invalidateEntity: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));

import ModelElementImportModalRaw, { readModelElementCsv } from "../ModelElementImportModal";
import { parseModelElementsCsv } from "@/lib/importModelElements";
import { TextDecodingError } from "@/lib/textDecoding";

const ModelElementImportModal = ModelElementImportModalRaw as unknown as ComponentType<
  Record<string, unknown>
>;

const BACKSLASH = String.fromCharCode(92);
/** How JSON.stringify (and so the PostgREST body) spells U+0000. */
const NUL_ESCAPE = `${BACKSLASH}u0000`;

type Encoding = "utf8" | "utf8bom" | "utf16le" | "utf16lebom" | "utf16bebom";

function encode(text: string, encoding: Encoding): Uint8Array {
  if (encoding === "utf8") return new TextEncoder().encode(text);
  if (encoding === "utf8bom") {
    return new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(text)]);
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
function csvFile(bytes: Uint8Array, name = "members.csv"): File {
  return new NodeFile([bytes], name, { type: "text/csv" }) as unknown as File;
}

function hasNul(value: unknown): boolean {
  return JSON.stringify(value).includes(NUL_ESCAPE);
}

type StagedRow = Record<string, unknown>;
const rowsOf = (result: { rows: unknown }): StagedRow[] => result.rows as StagedRow[];

/** A zip local-file header: what an .xlsx picked as "CSV" starts with. */
const ZIP_BYTES = new Uint8Array([
  0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00,
  ...new TextEncoder().encode("[Content_Types].xml"),
]);

const CSV =
  [
    "Piece Mark,Assembly Mark,Profile,Grade,Qty,Drawing,GUID",
    "1B1,A1,W12X26,A992,2,S-101,2O2Fr$t4X7Zf8NOew3FNr1",
    "2C1,A2,HSS6X6X1/2,A500,4,S-102,",
  ].join("\r\n") + "\r\n";
const DRAWINGS = [
  { id: "d-101", sheet_number: "S-101", drawing_set_id: "set-1" },
  { id: "d-102", sheet_number: "S-102", drawing_set_id: "set-1" },
];
const CONTEXT = { drawings: DRAWINGS, existingElements: [{ id: "el-1", piece_mark: "1B1" }] };
/** What the importer stages for this CSV when it arrives as plain UTF-8. */
const EXPECTED = parseModelElementsCsv(CSV, CONTEXT);

describe("readModelElementCsv text encodings", () => {
  it("fixture: the UTF-8 parse links both sheets and dedupes 1B1 against the roster", () => {
    expect(rowsOf(EXPECTED).map((row) => [row.piece_mark, row.action, row.drawing_id])).toEqual([
      ["1B1", "update", "d-101"],
      ["2C1", "create", "d-102"],
    ]);
  });

  it.each<Encoding>(["utf16lebom", "utf16le", "utf16bebom"])(
    "%s CSV: stages the same rows as UTF-8, with no U+0000",
    async (encoding) => {
      const res = await readModelElementCsv(csvFile(encode(CSV, encoding)), CONTEXT);
      expect(hasNul(res)).toBe(false);
      expect(res).toEqual(EXPECTED);
    },
  );

  it("strips raw 0x00 bytes (one embedded, four trailing padding) before staging", async () => {
    const cut = CSV.indexOf(",A1");
    const bytes = new Uint8Array([
      ...encode(CSV.slice(0, cut), "utf8"),
      0,
      ...encode(CSV.slice(cut), "utf8"),
      0, 0, 0, 0,
    ]);
    const res = await readModelElementCsv(csvFile(bytes), CONTEXT);
    expect(hasNul(res)).toBe(false);
    expect(res).toEqual(EXPECTED);
  });

  it("rejects a binary container (zip / .xlsx) with re-save guidance", async () => {
    const read = readModelElementCsv(csvFile(ZIP_BYTES), CONTEXT);
    await expect(read).rejects.toBeInstanceOf(TextDecodingError);
    await expect(read).rejects.toThrow(/CSV UTF-8/);
  });

  it("keeps plain UTF-8 and UTF-8 with a BOM unchanged", async () => {
    for (const encoding of ["utf8", "utf8bom"] as const) {
      expect(await readModelElementCsv(csvFile(encode(CSV, encoding)), CONTEXT)).toEqual(EXPECTED);
    }
  });

  it("still stages a legacy Windows-1252 byte as U+FFFD, exactly as a UTF-8 read did", async () => {
    const bytes = new Uint8Array([
      ...encode("Piece Mark,Profile\r\n1B1,PL1/2", "utf8"),
      0xbd,
      0x0d,
      0x0a,
    ]);
    const res = await readModelElementCsv(csvFile(bytes), CONTEXT);
    expect(res).toEqual(parseModelElementsCsv(new TextDecoder().decode(bytes), CONTEXT));
    expect(rowsOf(res)[0]?.profile).toBe(`PL1/2${String.fromCharCode(0xfffd)}`);
  });

  it("keeps the existing parse errors for a CSV with no usable rows", async () => {
    await expect(
      readModelElementCsv(csvFile(encode("Profile,Qty\r\nW12X26,2\r\n", "utf8")), CONTEXT),
    ).rejects.toThrow(/No piece-mark column/);
    await expect(
      readModelElementCsv(csvFile(encode("Piece Mark,Profile\r\n", "utf8")), CONTEXT),
    ).rejects.toThrow("No member rows found in the CSV.");
  });
});

describe("ModelElementImportModal file reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function pickAndReview(bytes: Uint8Array): Promise<void> {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(ModelElementImportModal, {
          open: true,
          projectId: "p1",
          projectName: "Test Project",
          drawings: DRAWINGS,
          onClose: () => {},
        }),
      ),
    );
    const input = document.querySelector('input[type="file"]');
    if (!input) throw new Error("file input not rendered");
    fireEvent.change(input, { target: { files: [csvFile(bytes)] } });
    const review = await screen.findByRole("button", { name: /Review members/i });
    await waitFor(() => expect((review as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(review);
  }

  it("shows the re-save guidance in the error banner when a binary file is picked", async () => {
    await pickAndReview(ZIP_BYTES);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/CSV UTF-8/);
    // Still on the upload step: nothing staged, nothing written.
    expect(screen.getByRole("button", { name: /Review members/i })).toBeTruthy();
    expect(mocks.bulkCreate).not.toHaveBeenCalled();
  });

  it("commits a UTF-16LE export with no U+0000 in the insert payload", async () => {
    await pickAndReview(encode(CSV, "utf16le"));
    fireEvent.click(await screen.findByRole("button", { name: /Import 2 members/i }));
    await waitFor(() => expect(mocks.bulkCreate).toHaveBeenCalledTimes(1));
    const payload = mocks.bulkCreate.mock.calls[0]?.[0] ?? [];
    expect(hasNul(payload)).toBe(false);
    expect((payload as StagedRow[]).map((row) => [row.piece_mark, row.project_id])).toEqual([
      ["1B1", "p1"],
      ["2C1", "p1"],
    ]);
  });
});
