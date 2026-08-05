import { describe, expect, it } from "vitest";
import { findDuplicateRfis, jaccard, normalizeQuestion } from "../rfiDedup";

const existing = [
  { id: "1", rfi_number: "RFI #007", title: "Bolt grade at moment connection", question: "Confirm the bolt grade for the moment connection at gridline C.", drawing_reference: "S-2.3" },
  { id: "2", rfi_number: "RFI #010", title: "Galvanizing spec for stairs", question: "What galvanizing thickness is required for the egress stairs?", drawing_reference: "A-5.1" },
];

describe("normalizeQuestion", () => {
  it("lowercases, strips punctuation, and drops filler/stopwords", () => {
    const t = normalizeQuestion("Please confirm the BOLT grade?!");
    expect(t).toContain("bolt");
    expect(t).toContain("grade");
    expect(t).not.toContain("the");
    expect(t).not.toContain("confirm");
  });
});

describe("jaccard", () => {
  it("is 1 for identical token sets and 0 for disjoint", () => {
    expect(jaccard(new Set(["a", "b"]), new Set(["a", "b"]))).toBe(1);
    expect(jaccard(new Set(["a"]), new Set(["b"]))).toBe(0);
  });
});

describe("findDuplicateRfis", () => {
  it("flags a near-identical re-asked RFI", () => {
    const draft = { title: "Bolt grade moment connection", question: "What bolt grade for the moment connection at gridline C?", drawing_reference: "S-2.3" };
    const matches = findDuplicateRfis(draft, existing);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].rfi.rfi_number).toBe("RFI #007");
    expect(matches[0].reasons.some((r) => /Same drawing/.test(r))).toBe(true);
  });

  it("returns nothing for an unrelated question", () => {
    const draft = { title: "Crane pick plan", question: "Where is the laydown yard for the tower crane?" };
    expect(findDuplicateRfis(draft, existing)).toHaveLength(0);
  });

  it("ignores the draft itself, deleted RFIs, and too-thin drafts", () => {
    const self = { id: "1", title: "Bolt grade", question: "Confirm the bolt grade for the moment connection at gridline C." };
    expect(findDuplicateRfis(self, existing).find((m) => m.rfi.id === "1")).toBeUndefined();
    expect(findDuplicateRfis({ title: "bolt" }, existing)).toHaveLength(0);
    const withDeleted = [{ ...existing[0], is_deleted: true }];
    expect(findDuplicateRfis({ title: "Bolt grade moment connection", question: "What bolt grade at the moment connection gridline C?" }, withDeleted)).toHaveLength(0);
  });

  it("ranks by score and respects the limit", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ id: String(i), title: "Bolt grade moment connection", question: "bolt grade moment connection gridline" }));
    const matches = findDuplicateRfis({ title: "Bolt grade moment connection", question: "bolt grade moment connection gridline" }, many, { limit: 3 });
    expect(matches.length).toBe(3);
  });
});

describe("findDuplicateRfis — structural signals (slice 2)", () => {
  it("surfaces a duplicate on structure alone (same drawing + work package) with ~no wording overlap", () => {
    const draft = { title: "Anchor embedment", question: "anchor embedment depth value", drawing_reference: "S-2.3", work_package_id: "wp-1" };
    const ex = [{ id: "z", rfi_number: "RFI #099", title: "Coating thickness", question: "galvanizing microns coating system", drawing_reference: "S-2.3", work_package_id: "wp-1" }];
    const m = findDuplicateRfis(draft, ex);
    expect(m).toHaveLength(1);
    expect(m[0].score).toBeGreaterThanOrEqual(0.4);
    expect(m[0].reasons.some((r) => /Same drawing \(S-2\.3\)/.test(r))).toBe(true);
    expect(m[0].reasons.some((r) => /Same work package/.test(r))).toBe(true);
  });

  it("boosts and explains overlapping piece marks", () => {
    const draft = { title: "Connection at C-12", question: "weld size question for piece", drawing_reference: "S-9.9", piece_marks: "C-12, B-7" };
    const ex = [{ id: "p", rfi_number: "RFI #077", title: "Bolt callout", question: "totally different topic about bolts", drawing_reference: "S-9.9", piece_marks: "C-12" }];
    const m = findDuplicateRfis(draft, ex);
    expect(m).toHaveLength(1);
    expect(m[0].reasons.some((r) => /Shared piece mark/.test(r))).toBe(true);
    expect(m[0].reasons.some((r) => /C-12/.test(r))).toBe(true);
  });

  it("explains a spec-section match", () => {
    const draft = { title: "Stair galvanizing", question: "galvanizing thickness for egress stairs required", spec_section: "05500" };
    const ex = [{ id: "s", rfi_number: "RFI #010", title: "Galvanizing spec for stairs", question: "what galvanizing thickness is required for the egress stairs", spec_section: "05500" }];
    const m = findDuplicateRfis(draft, ex);
    expect(m).toHaveLength(1);
    expect(m[0].reasons.some((r) => /Same spec \(05500\)/.test(r))).toBe(true);
  });

  it("does NOT surface on a single broad signal alone (same drawing set, no wording overlap)", () => {
    const draft = { title: "Anchor embedment", question: "anchor embedment depth value", drawing_set_id: "set-1" };
    const ex = [{ id: "q", title: "Coating thickness", question: "galvanizing microns coating system", drawing_set_id: "set-1" }];
    expect(findDuplicateRfis(draft, ex)).toHaveLength(0);
  });
});
