// @vitest-environment jsdom
import { File as NodeFile } from "node:buffer";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PreferencesDataTab } from "../PreferencesDataTab";
import { sanitizeUserPreferences, type UserPreferences } from "@/lib/userPreferences/schema";
import { serializeUserPreferences } from "@/lib/userPreferences/portability";

// Regression coverage for Sentry JAVASCRIPT-REACT-2C (Postgres 22P05): imported
// settings are saved to jsonb, which rejects U+0000.

const NUL = String.fromCharCode(0);
/** How JSON.stringify (and so the PostgREST body) spells U+0000. */
const NUL_ESCAPE = `${String.fromCharCode(92)}u0000`;
const PAYLOAD = serializeUserPreferences(
  sanitizeUserPreferences({ theme: "light", pinned_modules: ["RFIs"] }),
);
const ZIP_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);

function utf16le(text: string, bom: boolean) {
  const out: number[] = bom ? [0xff, 0xfe] : [];
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    out.push(unit & 0xff, unit >> 8);
  }
  return new Uint8Array(out);
}

/** A spec Blob with arrayBuffer() (jsdom 25's File has none). */
function nodeFile(bytes: Uint8Array): File {
  return new NodeFile([bytes], "settings.json", { type: "application/json" }) as unknown as File;
}

function renderTab() {
  const onSave = vi.fn<(preferences: UserPreferences) => void>();
  render(
    <PreferencesDataTab
      preferences={sanitizeUserPreferences({})}
      onSave={onSave}
      onPatch={vi.fn()}
      isSaving={false}
    />,
  );
  return onSave;
}

function upload(file: File) {
  fireEvent.change(screen.getByLabelText(/import settings file/i), { target: { files: [file] } });
}

async function applyImport(): Promise<void> {
  await screen.findByText(/ready to import/i);
  fireEvent.click(screen.getByRole("button", { name: /apply imported settings/i }));
}

describe("PreferencesDataTab settings import encodings", () => {
  it("imports a UTF-16LE settings file with a BOM", async () => {
    const onSave = renderTab();
    upload(nodeFile(utf16le(PAYLOAD, true)));
    await applyImport();

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ theme: "light", pinned_modules: ["RFIs"] }),
    );
    expect(JSON.stringify(onSave.mock.calls[0][0])).not.toContain(NUL_ESCAPE);
  });

  it("imports a BOM-less UTF-16LE file through the FileReader fallback", async () => {
    const onSave = renderTab();
    const file = new File([utf16le(PAYLOAD, false)], "settings.json", { type: "application/json" });
    // Force the path for Blob implementations without arrayBuffer().
    Object.defineProperty(file, "arrayBuffer", { value: undefined });
    upload(file);
    await applyImport();

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ theme: "light", pinned_modules: ["RFIs"] }),
    );
    expect(JSON.stringify(onSave.mock.calls[0][0])).not.toContain(NUL_ESCAPE);
  });

  it("shows the re-save guidance for a binary container instead of a generic error", async () => {
    const onSave = renderTab();
    upload(nodeFile(ZIP_BYTES));

    expect(await screen.findByRole("alert")).toHaveTextContent(/CSV UTF-8/);
    expect(screen.queryByText(/ready to import/i)).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("strips a JSON-escaped U+0000 from a free-text preference before saving", async () => {
    const text = serializeUserPreferences(
      sanitizeUserPreferences({ theme: "light", default_project_id: `proj-1${NUL}` }),
    );
    expect(text).toContain(NUL_ESCAPE);
    const onSave = renderTab();
    upload(nodeFile(new TextEncoder().encode(text)));
    await applyImport();

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ theme: "light", default_project_id: "proj-1" }),
    );
    expect(JSON.stringify(onSave.mock.calls[0][0])).not.toContain(NUL_ESCAPE);
  });

  it("imports plain UTF-8 unchanged", async () => {
    const onSave = renderTab();
    upload(nodeFile(new TextEncoder().encode(PAYLOAD)));
    await applyImport();

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ theme: "light", pinned_modules: ["RFIs"] }),
    );
  });
});
