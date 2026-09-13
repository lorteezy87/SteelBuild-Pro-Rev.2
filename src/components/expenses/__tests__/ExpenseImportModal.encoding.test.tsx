// @vitest-environment jsdom
import { File as NodeFile } from "node:buffer";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TextDecodingError } from "@/lib/textDecoding";
import ExpenseImportModal, { readExpenseImportFile } from "../ExpenseImportModal";

vi.mock("@/api/supabaseClient", () => ({ entities: {} }));
vi.mock("@/components/shared/numberSequencing", () => ({ getNextNumber: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// Regression coverage for Sentry JAVASCRIPT-REACT-2C (Postgres 22P05): a UTF-16
// expense export read with file.text() put U+0000 into the Expense rows.

const NUL = String.fromCharCode(0);
const CSV = "Date,Description,Cost Code,Amount\r\n2026-04-01,Wide flange beams,05,45000\r\n";
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

// jsdom 25's File has no arrayBuffer()/text(); Node's File is a spec Blob.
function file(bytes: Uint8Array, name = "expenses.csv"): File {
  return new NodeFile([bytes], name) as unknown as File;
}

function renderModal(): HTMLInputElement {
  const { container } = render(
    <ExpenseImportModal
      open
      onClose={vi.fn()}
      activeProject={{ id: "p1", name: "Job 1" }}
      workPackages={[]}
      onImported={vi.fn()}
    />,
  );
  const input = container.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error("file input not rendered");
  return input;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("readExpenseImportFile", () => {
  it.each([
    { label: "with a BOM", bom: true },
    { label: "without a BOM", bom: false },
  ])("decodes a UTF-16LE CSV $label to the original text with no U+0000", async ({ bom }) => {
    const text = await readExpenseImportFile(file(utf16le(CSV, bom)));
    expect(text).toBe(CSV);
    expect(text).not.toContain(NUL);
  });

  it("strips raw 0x00 bytes from a UTF-8 file", async () => {
    const bytes = new Uint8Array([
      ...utf8("Date,Description\r\n2026-04-01,Beams"),
      0,
      ...utf8("\r\n"),
      0,
      0,
    ]);
    expect(await readExpenseImportFile(file(bytes))).toBe("Date,Description\r\n2026-04-01,Beams\r\n");
  });

  it("rejects a binary container (zip / .xlsx bytes) with re-save guidance", async () => {
    const error = await readExpenseImportFile(file(ZIP_BYTES)).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TextDecodingError);
    expect((error as Error).message).toMatch(/CSV UTF-8/);
  });

  it("decodes plain UTF-8, UTF-8 with a BOM and Windows-1252 bytes exactly as file.text() did", async () => {
    const cases = [
      utf8(CSV),
      new Uint8Array([0xef, 0xbb, 0xbf, ...utf8(CSV)]),
      new Uint8Array([...utf8("Date,Description\r\n2026-04-01,PL1/2"), 0xbd, 0x0d, 0x0a]),
    ];
    for (const bytes of cases) {
      const upload = file(bytes);
      expect(await readExpenseImportFile(upload)).toBe(await upload.text());
    }
    expect(await readExpenseImportFile(file(utf8(CSV)))).toBe(CSV);
  });
});

describe("ExpenseImportModal file upload", () => {
  it("previews a BOM-less UTF-16LE upload with clean values", async () => {
    const input = renderModal();
    fireEvent.change(input, { target: { files: [file(utf16le(CSV, false))] } });

    expect(await screen.findByText("Wide flange beams")).toBeInTheDocument();
    const textarea = screen.getByPlaceholderText(/paste CSV content here/i) as HTMLTextAreaElement;
    expect(textarea.value).not.toContain(NUL);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("reports a binary file through the existing error toast with the re-save message", async () => {
    const input = renderModal();
    fireEvent.change(input, { target: { files: [file(ZIP_BYTES)] } });

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/CSV UTF-8/)),
    );
    expect(screen.queryByText("expenses.csv")).toBeNull();
    expect(screen.queryByText(/Step 3/)).toBeNull();
  });
});
