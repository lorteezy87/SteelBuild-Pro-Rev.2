/**
 * Guards the fix for "can't see the top of the compare popout".
 *
 * Both revision dialogs render through Radix DialogContent, which centres the
 * box with translateY(-50%). A box TALLER than the viewport therefore pushes
 * half its overflow ABOVE the viewport top, where no scroll can reach it — the
 * header and revision selectors become permanently invisible. The fix is a
 * bounded max-height plus overflow:hidden, with the scroll moved inside.
 *
 * Asserted at source level: a jsdom render would need pdf.js + Supabase
 * mocks and still couldn't measure layout (jsdom has no box model).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (file) => fs.readFileSync(path.join(here, "..", file), "utf8");

const CASES = [
  { file: "RevisionCompareModal.jsx", cls: "rev-compare-dialog" },
  { file: "RevisionImpactReportModal.jsx", cls: "rev-impact-dialog" },
];

describe.each(CASES)("$file viewport bounds", ({ file, cls }) => {
  const source = read(file);

  it("never sets an unbounded fixed height on the dialog", () => {
    // A bare `height: "92vh"` inline with no max-height is what allowed the
    // box to exceed the viewport and clip its own top edge.
    expect(source).not.toMatch(/height:\s*"9\d(vh|dvh)"/);
  });

  it("bounds height AND max-height together, vh fallback then dvh", () => {
    expect(source).toMatch(new RegExp(`\\.${cls}\\s*\\{[^}]*height:\\s*92vh[^}]*max-height:\\s*92vh`));
    expect(source).toMatch(/@supports \(height: 92dvh\)/);
    expect(source).toMatch(new RegExp(`\\.${cls}\\s*\\{[^}]*height:\\s*92dvh[^}]*max-height:\\s*92dvh`));
  });

  it("clips at the dialog boundary so overflow can't escape upward", () => {
    expect(source).toMatch(/overflow:\s*"hidden"/);
    expect(source).toMatch(/minHeight:\s*0/);
  });

  it("applies the bounding class to the DialogContent", () => {
    expect(source).toMatch(new RegExp(`className="detailing-cc ${cls}"`));
  });

  it("keeps the header pinned outside the scroll region", () => {
    expect(source).toMatch(/<DialogHeader style=\{\{ flexShrink: 0 \}\}>/);
  });
});

describe("RevisionCompareModal scrollable body", () => {
  const source = read("RevisionCompareModal.jsx");

  it("moves the scroll inside so tall control rows stay reachable", () => {
    expect(source).toMatch(/overflowY:\s*"auto"/);
  });

  it("gives the sheet viewport a usable minimum height floor", () => {
    expect(source).toMatch(/flex: 1, minHeight: 260/);
  });
});
