import { describe, it, expect } from "vitest";
import {
  bumpRevision,
  shouldBumpRevisionOnResubmit,
} from "@/lib/submittalRevision";

// Ported from the S&H Submittal Tracker (src/lib/lifecycle.test.ts) so the two
// apps stay in lockstep on the revision sequence.
describe("bumpRevision", () => {
  it("increments a numeric revision", () => {
    expect(bumpRevision("0")).toBe("1");
    expect(bumpRevision("9")).toBe("10");
  });
  it("advances a single-letter revision", () => {
    expect(bumpRevision("A")).toBe("B");
    expect(bumpRevision("Z")).toBe("AA");
  });
  it("advances a lowercase single-letter revision", () => {
    expect(bumpRevision("a")).toBe("b");
    expect(bumpRevision("z")).toBe("aa");
  });
  it("increments a trailing number on a labeled revision", () => {
    expect(bumpRevision("Rev 2")).toBe("Rev 3");
  });
  it("appends 1 to a label with no trailing number", () => {
    expect(bumpRevision("Rev")).toBe("Rev1");
  });
  it("defaults an empty revision to 1", () => {
    expect(bumpRevision("")).toBe("1");
    expect(bumpRevision("   ")).toBe("1");
    expect(bumpRevision(null)).toBe("1");
    expect(bumpRevision(undefined)).toBe("1");
  });
});

describe("shouldBumpRevisionOnResubmit", () => {
  it("is false whenever the flag is off, regardless of prior status", () => {
    expect(shouldBumpRevisionOnResubmit("Revise and Resubmit", false)).toBe(false);
    expect(shouldBumpRevisionOnResubmit("Rejected", false)).toBe(false);
    expect(shouldBumpRevisionOnResubmit("Approved", false)).toBe(false);
    expect(shouldBumpRevisionOnResubmit(null, false)).toBe(false);
  });

  it("is true with the flag on only for a genuine resubmit (R&R / Rejected)", () => {
    expect(shouldBumpRevisionOnResubmit("Revise and Resubmit", true)).toBe(true);
    expect(shouldBumpRevisionOnResubmit("Rejected", true)).toBe(true);
  });

  it("is false with the flag on for a non-resubmit prior status", () => {
    for (const s of [
      "Submitted",
      "Under Review",
      "Approved",
      "Approved as Noted",
      "Released for Fabrication",
      "Draft",
      "Void",
      null,
      undefined,
    ]) {
      expect(shouldBumpRevisionOnResubmit(s, true)).toBe(false);
    }
  });
});
