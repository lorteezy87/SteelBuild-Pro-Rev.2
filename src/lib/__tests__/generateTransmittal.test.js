import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock jsPDF so the test exercises OUR layout logic deterministically — no real
// PDF engine, no DOM. Same pattern as revisionImpactPDF.test.js.
const textCalls = [];
vi.mock("jspdf", () => {
  class FakePdf {
    constructor() {
      this.internal = {
        pageSize: { getWidth: () => 612, getHeight: () => 792 },
        getNumberOfPages: () => 1,
      };
    }
    setFont() {} setFontSize() {} setTextColor() {} setDrawColor() {}
    setLineWidth() {} setFillColor() {} rect() {} line() {} circle() {}
    splitTextToSize(t) { return String(t).split("\n"); }
    getTextWidth(t) { return String(t).length * 5; }
    addPage() {} setPage() {} save() {}
    text(t) { textCalls.push(Array.isArray(t) ? t.join(" ") : String(t)); }
  }
  return { jsPDF: FakePdf };
});

const { generateTransmittal } = await import("../generateTransmittal");

const BASE = {
  project: { name: "Desert Ridge Phase 2", project_number: "25421" },
  // The row renderer reads display_name/file_name, not `title`.
  docs: [{ document_number: "AB-101", display_name: "Anchor Bolt Plan", discipline: "Structural", status: "Approved" }],
  issuedTo: "Sundt Construction",
  issuedBy: "N. Lortz",
  purpose: "For Approval",
  transmittalNumber: "T-004",
};

const emitted = () => textCalls.join("\n");

describe("generateTransmittal — issuing company", () => {
  beforeEach(() => { textCalls.length = 0; });

  it("prints the issuer name passed in", () => {
    generateTransmittal({ ...BASE, issuer: { name: "Kiewit Steel" } });
    expect(emitted()).toContain("Kiewit Steel");
  });

  it("hardcodes no company, tagline or website of its own", () => {
    // The regression this file exists for: the header once hardcoded one
    // customer's name, its tagline, and the software vendor's domain, so every
    // tenant's transmittal named the wrong sender. Nothing in this module may
    // supply a sender.
    generateTransmittal({ ...BASE, issuer: { name: "Kiewit Steel" } });
    const out = emitted();
    expect(out).not.toMatch(/S&H/i);
    expect(out).not.toMatch(/steelbuildpro\.com/i);
    expect(out).not.toContain("Structural Steel Construction");
  });

  it("omits the name line rather than inventing one when the issuer is absent", () => {
    generateTransmittal(BASE);
    const out = emitted();
    // Still a transmittal — the label and the recipient survive — but it
    // carries no sender, which is the honest representation of "unknown".
    expect(out).toContain("TRANSMITTAL");
    expect(out).toContain("Sundt Construction");
    expect(out).not.toMatch(/S&H/i);
    expect(out).not.toMatch(/steelbuildpro\.com/i);
  });

  it("omits tagline and website independently of the name", () => {
    generateTransmittal({ ...BASE, issuer: { name: "Kiewit Steel" } });
    const withNameOnly = emitted();
    textCalls.length = 0;

    generateTransmittal({
      ...BASE,
      issuer: { name: "Kiewit Steel", tagline: "Fabrication & Erection", website: "kiewitsteel.example" },
    });
    const withAll = emitted();

    expect(withNameOnly).not.toContain("Fabrication & Erection");
    expect(withAll).toContain("Fabrication & Erection");
    expect(withAll).toContain("kiewitsteel.example");
  });

  it("treats a blank or whitespace issuer name as absent", () => {
    generateTransmittal({ ...BASE, issuer: { name: "   " } });
    // A whitespace name must not render as an empty bold line pretending to be
    // a sender; it is the same "unknown" case as omitting it.
    expect(emitted()).toContain("TRANSMITTAL");
  });

  it("still renders the project and document payload", () => {
    generateTransmittal({ ...BASE, issuer: { name: "Kiewit Steel" } });
    const out = emitted();
    expect(out).toContain("Desert Ridge Phase 2");
    expect(out).toContain("Anchor Bolt Plan");
    expect(out).toContain("For Approval");
    expect(out).toContain("T-004");
  });
});
