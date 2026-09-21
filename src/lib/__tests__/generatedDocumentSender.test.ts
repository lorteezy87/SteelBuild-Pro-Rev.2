import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildIcs } from "../icsExport";

/**
 * Outward-facing documents must identify the sender from the signed-in org,
 * never from a literal. Both files below shipped one customer's name to every
 * other customer: the transmittal letterhead read "S&H Steel", and every
 * exported .ics carried "-//S&H Steel Co//..." in its PRODID.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the transmittal takes its letterhead from the signed-in org", () => {
  it("refuses to render without a sender rather than printing a blank one", async () => {
    const { generateTransmittal } = await import("../generateTransmittal");
    // A transmittal is the record of what was issued, to whom and when. The
    // one thing it cannot be vague about is who sent it, so this throws
    // instead of defaulting -- a default is how the old literal survived.
    // `undefined` is cast in deliberately: the JSDoc now types senderName as
    // required, but the only caller is untyped .jsx, so a missing org really
    // can arrive here at runtime. The throw is what makes that safe.
    for (const senderName of [undefined, "", "   "] as unknown as string[]) {
      expect(() => generateTransmittal({ senderName, docs: [] })).toThrow(
        /without a sending organization/i,
      );
    }
  });

  it("prints the org name it was given", async () => {
    // generateTransmittal ends in pdf.save() and returns nothing, so the
    // letterhead is observed at the jsPDF boundary rather than by changing a
    // public signature to suit a test.
    const drawn: string[] = [];
    vi.doMock("jspdf", () => ({
      jsPDF: class {
        internal = { pageSize: { getWidth: () => 612, getHeight: () => 792 } };
        setFontSize() {} setFont() {} setTextColor() {} setFillColor() {}
        setDrawColor() {} setLineWidth() {} rect() {} line() {} addPage() {}
        splitTextToSize(t: string) { return [t]; }
        getTextWidth() { return 0; }
        save() {}
        text(value: unknown) { drawn.push(String(value)); }
      },
    }));
    vi.resetModules();
    const { generateTransmittal } = await import("../generateTransmittal");
    generateTransmittal({ senderName: "Acme Steel Fabricators", docs: [] });
    vi.doUnmock("jspdf");
    vi.resetModules();

    expect(drawn).toContain("Acme Steel Fabricators");
    expect(drawn.join("\n")).not.toContain("S&H");
  });

  it("names no company of its own, in any branch", () => {
    const code = stripComments(read("src/lib/generateTransmittal.js"));
    expect(code).not.toContain("S&H");
    // The old letterhead also printed THIS PRODUCT's domain directly beneath
    // the sender, where a reader takes it for the sender's own website.
    expect(code).not.toContain("steelbuildpro.com");
    expect(code).not.toContain("Structural Steel Construction");
  });

  it("is passed the org by its only caller", () => {
    const modal = read("src/pages/documents/TransmittalModal.jsx");
    expect(modal).toContain("useOrg");
    expect(modal).toContain("senderName");
    // Disabled rather than throwing under the user's cursor.
    expect(modal).toContain("disabled={!senderName}");
  });
});

describe("the .ics PRODID identifies the product, not a company", () => {
  it("emits exactly one PRODID and it names no customer", () => {
    const ics = buildIcs({ events: [], calendarName: "Project 1234" });
    const prodids = ics.split("\r\n").filter((l) => l.startsWith("PRODID:"));
    expect(prodids).toHaveLength(1);
    expect(prodids[0]).toBe("PRODID:-//SteelBuild Pro//SteelBuild Pro//EN");
    expect(ics).not.toContain("S&H");
  });

  it("still carries the caller's calendar name, which is where a workspace label belongs", () => {
    // PRODID is the producing SOFTWARE (RFC 5545 s3.7.3). Putting the org
    // there would swap one wrong value for another, so the org-facing label
    // stays on X-WR-CALNAME.
    expect(buildIcs({ events: [], calendarName: "Acme Steel — Project 1234" }))
      .toContain("X-WR-CALNAME:Acme Steel");
  });
});

describe("no generated document hardcodes a company name", () => {
  // These are the files that produce something a third party receives. A
  // literal company name in any of them is the same defect in a new place.
  const GENERATED = [
    "src/lib/generateTransmittal.js",
    "src/lib/icsExport.js",
    "src/lib/exports/markupPDF.js",
  ];

  it("keeps every outward-facing producer free of a company literal", () => {
    const offenders = GENERATED.filter((f) => stripComments(read(f)).includes("S&H"));
    expect(offenders, "these ship one customer's name to every other customer")
      .toEqual([]);
  });
});
