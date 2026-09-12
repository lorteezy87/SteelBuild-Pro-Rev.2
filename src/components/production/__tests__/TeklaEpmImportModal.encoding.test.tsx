// @vitest-environment jsdom
//
// Regression coverage for Sentry JAVASCRIPT-REACT-2C. The Tekla EPM importer
// read uploads with `file.text()` (UTF-8 only), so a UTF-16 FabSuite export
// decoded with U+0000 between its characters and could not be parsed. jsdom
// supplies the DOMParser the FabSuite parse needs.

import { File as NodeFile } from "node:buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { parseFabSuiteXml } from "@/lib/importFabSuiteXml";
import { TextDecodingError } from "@/lib/textDecoding";

const { bulkCreate, update } = vi.hoisted(() => ({ bulkCreate: vi.fn(), update: vi.fn() }));
vi.mock("@/api/supabaseClient", () => ({ entities: { ModelElement: { bulkCreate, update } } }));
vi.mock("@/lib/ifc/fetchAllModelElements", () => ({
  fetchAllModelElements: async (): Promise<unknown[]> => [],
}));
vi.mock("@/services/cacheRegistry", () => ({ invalidateEntity: () => {} }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

import TeklaEpmImportModal, { readTeklaEpmFile } from "../TeklaEpmImportModal";

const BACKSLASH = String.fromCharCode(92);
/** How JSON.stringify (and so the PostgREST body) spells U+0000. */
const NUL_ESCAPE = `${BACKSLASH}u0000`;

function assembly(mark: string, guid: string, profile: string): string {
  return (
    `<Assembly><AssemblyMark>${mark}</AssemblyMark><AssemblyQuantity>1</AssemblyQuantity>` +
    `<ModelRef>${guid}</ModelRef><AssemblyPart><MainMember>true</MainMember>` +
    `<Dimensions>${profile}</Dimensions><Grade>A992</Grade><WeightEach>100</WeightEach>` +
    `<PartQuantity>1</PartQuantity></AssemblyPart></Assembly>\r\n`
  );
}

function epmXml(encoding: string): string {
  return (
    `<?xml version="1.0" encoding="${encoding}"?>\r\n` +
    `<FabSuiteDataExchange xmlns="http://www.fabsuite.com/xml/fabsuite-xml-v0108.xsd">\r\n` +
    `<ProjectNumber>24-017</ProjectNumber><ProjectName>Skyport</ProjectName>\r\n` +
    `<Drawing><DrawingNumber>E1</DrawingNumber><DrawingTitle>Erection plan</DrawingTitle>` +
    `<DrawingRevision><RevisionNumber>0</RevisionNumber>` +
    `<RevisionDescription>FOR FABRICATION</RevisionDescription></DrawingRevision></Drawing>\r\n` +
    assembly("B1", "ID-0001", "W12X26") +
    assembly("C2", "ID-0002", "W10X33") +
    `</FabSuiteDataExchange>\r\n`
  );
}

const UTF16_XML = epmXml("UTF-16");
const EXPECTED = parseFabSuiteXml(UTF16_XML);

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

/** Starts with the zip local-file signature, as the EPM .zip package does. */
const ZIP_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...utf8("x".repeat(64))]);

// jsdom 25's File has no arrayBuffer(); Node's File is a spec Blob.
function xmlFile(bytes: Uint8Array, name = "Skyport-EPM.xml"): File {
  return new NodeFile([bytes], name, { type: "text/xml" }) as unknown as File;
}

function hasNul(value: unknown): boolean {
  return JSON.stringify(value).includes(NUL_ESCAPE);
}

/** What the old `file.text()` read produced: a UTF-8 decode that drops a UTF-8 BOM. */
function legacyText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

describe("readTeklaEpmFile text encodings", () => {
  it.each([
    ["UTF-16LE with a BOM", "le", true],
    ["UTF-16LE without a BOM", "le", false],
    ["UTF-16BE with a BOM", "be", true],
    ["UTF-16BE without a BOM", "be", false],
  ] as const)("%s: parses the real pieces with no U+0000", async (_label, order, bom) => {
    const res = await readTeklaEpmFile(xmlFile(utf16(UTF16_XML, order, bom)));
    expect(hasNul(res)).toBe(false);
    expect(res).toEqual(EXPECTED);
    expect(res.pieces).toMatchObject([
      { piece_mark: "B1", profile: "W12X26", element_guid: "ID-0001" },
      { piece_mark: "C2", profile: "W10X33", element_guid: "ID-0002" },
    ]);
    expect(res.source.stage).toBe("IFC");
  });

  it("rejects a binary container with the decoder's re-save guidance", async () => {
    const read = readTeklaEpmFile(xmlFile(ZIP_BYTES));
    await expect(read).rejects.toBeInstanceOf(TextDecodingError);
    await expect(read).rejects.toThrow(/CSV UTF-8/);
  });

  it.each([
    ["plain UTF-8", utf8(epmXml("UTF-8"))],
    ["UTF-8 with a BOM", new Uint8Array([0xef, 0xbb, 0xbf, ...utf8(epmXml("UTF-8"))])],
  ])("%s: parses exactly what the old UTF-8 read did", async (_label, bytes) => {
    const res = await readTeklaEpmFile(xmlFile(bytes));
    expect(res).toEqual(parseFabSuiteXml(legacyText(bytes)));
    expect(res.pieces).toHaveLength(2);
  });
});

function fileInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("file input not rendered");
  return input;
}

function renderModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TeklaEpmImportModal
        open
        projectId="p1"
        projectName="Skyport"
        onClose={vi.fn()}
        onImported={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe("TeklaEpmImportModal upload encodings", () => {
  beforeEach(() => {
    bulkCreate.mockReset();
    bulkCreate.mockResolvedValue([]);
    update.mockReset();
  });

  it("imports a BOM-less UTF-16LE export with no U+0000 reaching the writer", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.upload(fileInput(), xmlFile(utf16(UTF16_XML, "le", false)));
    await user.click(await screen.findByRole("button", { name: /Review file/i }));
    await screen.findByText("B1");
    await user.click(screen.getByRole("button", { name: /Import 2 pieces/i }));

    await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(1));
    const [rows] = bulkCreate.mock.calls[0];
    expect(hasNul(rows)).toBe(false);
    expect(rows).toMatchObject([
      { piece_mark: "B1", element_guid: "ID-0001", project_id: "p1" },
      { piece_mark: "C2", element_guid: "ID-0002", project_id: "p1" },
    ]);
  });

  it("shows the decoder's re-save message in the existing error alert and writes nothing", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.upload(fileInput(), xmlFile(ZIP_BYTES));
    await user.click(await screen.findByRole("button", { name: /Review file/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/doesn't look like a text export.*CSV UTF-8/);
    expect(bulkCreate).not.toHaveBeenCalled();
  });
});
