import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ALL,
  NEEDS_REVIEW,
  buildIssuances,
  buildReviewQueue,
  computeDocTypeCounts,
  computeStats,
  deriveGcDocumentsPageModel,
  effectiveIssuanceDate,
  filterIssuances,
  issuanceLabel,
  noticeDaysFor,
  planSupersession,
  sortIssuances,
  type GcDrawingRow,
  type GcDrawingSetRow,
} from "../gcDocumentsPageDerive";

const set = (over: Partial<GcDrawingSetRow> = {}): GcDrawingSetRow =>
  ({
    id: "s1",
    project_id: "p1",
    set_name: "Set",
    doc_type: "gc_drawing",
    doc_number: null,
    category: "architectural",
    steel_impact: "unknown",
    issued_date: null,
    received_date: null,
    issued_by: null,
    revision: null,
    description: null,
    impact_notes: null,
    is_deleted: false,
    sheet_count: 0,
    created_at: "2026-01-01T12:00:00.000Z",
    ...over,
  }) as unknown as GcDrawingSetRow;

const sheet = (over: Partial<GcDrawingRow> = {}): GcDrawingRow =>
  ({
    id: "d1",
    project_id: "p1",
    gc_drawing_set_id: "s1",
    drawing_number: "S-101",
    title: "Framing plan",
    revision: "0",
    is_deleted: false,
    is_superseded: false,
    superseded_by_id: null,
    ...over,
  }) as unknown as GcDrawingRow;

describe("issuance grouping", () => {
  it("attaches sheets to their set and splits current from superseded", () => {
    const issuances = buildIssuances(
      [set({ id: "s1" })],
      [
        sheet({ id: "d1", gc_drawing_set_id: "s1" }),
        sheet({ id: "d2", gc_drawing_set_id: "s1", drawing_number: "S-102", is_superseded: true }),
        sheet({ id: "d3", gc_drawing_set_id: "other" }),
      ],
    );
    expect(issuances).toHaveLength(1);
    expect(issuances[0].sheets.map((s) => s.id)).toEqual(["d1", "d2"]);
    expect(issuances[0].currentSheets.map((s) => s.id)).toEqual(["d1"]);
    expect(issuances[0].supersededCount).toBe(1);
  });

  it("sorts sheets by drawing number naturally, not lexically", () => {
    const [issuance] = buildIssuances(
      [set()],
      [
        sheet({ id: "a", drawing_number: "S-10" }),
        sheet({ id: "b", drawing_number: "S-2" }),
        sheet({ id: "c", drawing_number: "S-1" }),
      ],
    );
    expect(issuance.sheets.map((s) => s.drawing_number)).toEqual(["S-1", "S-2", "S-10"]);
  });

  it("marks post-award types and carries the impact state through", () => {
    const [asi] = buildIssuances([set({ doc_type: "asi", steel_impact: "impacted" })], []);
    expect(asi.isPostAward).toBe(true);
    expect(asi.needsReview).toBe(false);
    expect(asi.steelImpact).toBe("impacted");

    const [cd] = buildIssuances([set({ doc_type: "gc_drawing" })], []);
    expect(cd.isPostAward).toBe(false);
    expect(cd.needsReview).toBe(true);
  });
});

describe("dates", () => {
  it("files an issuance under received_date, falling back to issued then created", () => {
    expect(effectiveIssuanceDate(set({ received_date: "2026-03-05", issued_date: "2026-03-01" })))
      .toBe("2026-03-05");
    expect(effectiveIssuanceDate(set({ issued_date: "2026-03-01" }))).toBe("2026-03-01");
    // created_at falls back to its LOCAL calendar day, so the register does not
    // shift by a day for anyone west of UTC.
    expect(effectiveIssuanceDate(set())).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  describe("created_at fallback, in a non-UTC zone", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("takes the viewer's local calendar day, not the UTC date part", () => {
      // The suite runs with TZ=UTC (vite.config.js), so a local-vs-UTC bug is
      // invisible here unless the zone is injected. Stub the local getters to
      // stand in for UTC-07:00, where 2026-01-01T02:00Z is still 2025-12-31.
      vi.spyOn(Date.prototype, "getFullYear").mockReturnValue(2025);
      vi.spyOn(Date.prototype, "getMonth").mockReturnValue(11);
      vi.spyOn(Date.prototype, "getDate").mockReturnValue(31);

      const result = effectiveIssuanceDate(set({ created_at: "2026-01-01T02:00:00.000Z" }));

      // A `created_at.slice(0, 10)` implementation would answer 2026-01-01 and
      // file the issuance a day late for every Phoenix user.
      expect(result).toBe("2025-12-31");
    });
  });

  it("reports notice as null unless BOTH dates exist — unknown is not zero", () => {
    // daysBetween() returns 0 for a missing input, which would render as
    // "same-day notice". Absence is not evidence.
    expect(noticeDaysFor(set({ issued_date: "2026-03-01" }))).toBeNull();
    expect(noticeDaysFor(set({ received_date: "2026-03-05" }))).toBeNull();
    expect(noticeDaysFor(set())).toBeNull();
    expect(noticeDaysFor(set({ issued_date: "2026-03-01", received_date: "2026-03-05" }))).toBe(4);
  });

  it("sorts newest first and sinks undated issuances to the bottom", () => {
    const issuances = buildIssuances(
      [
        set({ id: "a", set_name: "A", received_date: "2026-01-10" }),
        set({ id: "b", set_name: "B", received_date: "2026-05-01" }),
        set({ id: "c", set_name: "C", created_at: "" }),
      ],
      [],
    );
    expect(issuances.map((i) => i.id)).toEqual(["b", "a", "c"]);
  });

  it("is stable when two issuances share a date", () => {
    const sorted = sortIssuances(
      buildIssuances(
        [
          set({ id: "x", doc_number: "ASI 010", received_date: "2026-02-02" }),
          set({ id: "y", doc_number: "ASI 002", received_date: "2026-02-02" }),
        ],
        [],
      ),
    );
    expect(sorted.map((i) => i.label)).toEqual(["ASI 002", "ASI 010"]);
  });
});

describe("labels", () => {
  it("prefers the issuing party's own number", () => {
    expect(issuanceLabel(set({ doc_number: "ASI 012", set_name: "Canopy" }))).toBe("ASI 012");
    expect(issuanceLabel(set({ set_name: "100% CD Set" }))).toBe("100% CD Set");
    expect(issuanceLabel(set({ set_name: "  " }))).toBe("Untitled issuance");
  });
});

describe("filtering", () => {
  const issuances = buildIssuances(
    [
      set({ id: "s1", doc_type: "asi", doc_number: "ASI 012", steel_impact: "impacted" }),
      set({ id: "s2", doc_type: "addendum", set_name: "Addendum 3", steel_impact: "unknown" }),
      set({ id: "s3", doc_type: "gc_drawing", set_name: "CD Set", steel_impact: "none" }),
    ],
    [sheet({ id: "d1", gc_drawing_set_id: "s1", drawing_number: "S-301", title: "Canopy" })],
  );

  it("filters by document type", () => {
    const out = filterIssuances(issuances, { search: "", docType: "asi", impact: ALL });
    expect(out.map((i) => i.id)).toEqual(["s1"]);
  });

  it("treats NEEDS_REVIEW as unknown OR pending_review, not a stored value", () => {
    const out = filterIssuances(issuances, { search: "", docType: ALL, impact: NEEDS_REVIEW });
    expect(out.map((i) => i.id)).toEqual(["s2"]);
  });

  it("filters by an exact impact state", () => {
    const out = filterIssuances(issuances, { search: "", docType: ALL, impact: "none" });
    expect(out.map((i) => i.id)).toEqual(["s3"]);
  });

  it("finds the issuance that carried a sheet number", () => {
    // "Which ASI changed S-301?" is the question this answers.
    const out = filterIssuances(issuances, { search: "s-301", docType: ALL, impact: ALL });
    expect(out.map((i) => i.id)).toEqual(["s1"]);
  });

  it("searches the issuance's own fields case-insensitively", () => {
    expect(filterIssuances(issuances, { search: "asi 012", docType: ALL, impact: ALL }))
      .toHaveLength(1);
    expect(filterIssuances(issuances, { search: "   ", docType: ALL, impact: ALL }))
      .toHaveLength(3);
  });
});

describe("aggregates", () => {
  const issuances = buildIssuances(
    [
      set({ id: "s1", doc_type: "asi", steel_impact: "impacted" }),
      set({ id: "s2", doc_type: "asi", steel_impact: "unknown" }),
      set({ id: "s3", doc_type: "gc_drawing", steel_impact: "pending_review" }),
    ],
    [
      sheet({ id: "d1", gc_drawing_set_id: "s1" }),
      sheet({ id: "d2", gc_drawing_set_id: "s1", is_superseded: true }),
    ],
  );

  it("counts what a PM acts on", () => {
    const stats = computeStats(issuances);
    expect(stats).toEqual({
      total: 3,
      needsReview: 2,      // unknown + pending_review
      impacted: 1,
      postAward: 2,        // two ASIs
      sheetCount: 2,
      supersededCount: 1,
    });
  });

  it("counts by document type", () => {
    const counts = computeDocTypeCounts(issuances);
    expect(counts.get("asi")).toBe(2);
    expect(counts.get("gc_drawing")).toBe(1);
    expect(counts.get("bulletin")).toBeUndefined();
  });

  it("queues post-award issuances first, then oldest", () => {
    const queue = buildReviewQueue(
      buildIssuances(
        [
          set({ id: "old-cd", doc_type: "gc_drawing", received_date: "2026-01-01" }),
          set({ id: "new-asi", doc_type: "asi", received_date: "2026-06-01" }),
          set({ id: "old-asi", doc_type: "asi", received_date: "2026-02-01" }),
        ],
        [],
      ),
    );
    expect(queue.map((i) => i.id)).toEqual(["old-asi", "new-asi", "old-cd"]);
  });
});

describe("planSupersession", () => {
  const existing = [
    sheet({ id: "old-301", gc_drawing_set_id: "cd", drawing_number: "S-301" }),
    sheet({ id: "old-302", gc_drawing_set_id: "cd", drawing_number: "S-302" }),
  ];

  it("matches an incoming sheet to its live prior by exact number", () => {
    const plan = planSupersession(
      [sheet({ id: "new-301", gc_drawing_set_id: "asi", drawing_number: "S-301" })],
      existing,
      "asi",
    );
    expect(plan.replacements).toEqual([
      { priorId: "old-301", priorNumber: "S-301", incomingNumber: "S-301" },
    ]);
    expect(plan.added).toEqual([]);
    expect(plan.ambiguous).toEqual([]);
  });

  it("normalizes punctuation and case before matching", () => {
    const plan = planSupersession(
      [sheet({ id: "n", gc_drawing_set_id: "asi", drawing_number: "s301" })],
      existing,
      "asi",
    );
    expect(plan.replacements.map((r) => r.priorId)).toEqual(["old-301"]);
  });

  it("reports a sheet with no prior as added, not as a replacement", () => {
    const plan = planSupersession(
      [sheet({ id: "n", gc_drawing_set_id: "asi", drawing_number: "S-999" })],
      existing,
      "asi",
    );
    expect(plan.added).toEqual(["S-999"]);
    expect(plan.replacements).toEqual([]);
  });

  it("never supersedes a sheet in the incoming issuance's own set", () => {
    const plan = planSupersession(
      [sheet({ id: "n", gc_drawing_set_id: "asi", drawing_number: "S-301" })],
      [sheet({ id: "sibling", gc_drawing_set_id: "asi", drawing_number: "S-301" })],
      "asi",
    );
    expect(plan.replacements).toEqual([]);
    expect(plan.added).toEqual(["S-301"]);
  });

  it("ignores priors that are already superseded", () => {
    const plan = planSupersession(
      [sheet({ id: "n", gc_drawing_set_id: "asi", drawing_number: "S-301" })],
      [sheet({ id: "dead", gc_drawing_set_id: "cd", drawing_number: "S-301", is_superseded: true })],
      "asi",
    );
    expect(plan.replacements).toEqual([]);
    expect(plan.added).toEqual(["S-301"]);
  });

  it("refuses to guess when two live priors share a number", () => {
    // The register is already inconsistent. Picking one would silently bury
    // the other — report it and let a person decide.
    const plan = planSupersession(
      [sheet({ id: "n", gc_drawing_set_id: "asi", drawing_number: "S-301" })],
      [
        sheet({ id: "a", gc_drawing_set_id: "cd", drawing_number: "S-301" }),
        sheet({ id: "b", gc_drawing_set_id: "addendum", drawing_number: "S-301" }),
      ],
      "asi",
    );
    expect(plan.ambiguous).toEqual(["S-301"]);
    expect(plan.replacements).toEqual([]);
  });

  it("skips incoming sheets with no usable number", () => {
    const plan = planSupersession(
      [sheet({ id: "n", gc_drawing_set_id: "asi", drawing_number: "  " })],
      existing,
      "asi",
    );
    expect(plan.replacements).toEqual([]);
    expect(plan.added).toEqual([]);
  });
});

describe("deriveGcDocumentsPageModel", () => {
  it("assembles the whole model", () => {
    const model = deriveGcDocumentsPageModel({
      sets: [set({ id: "s1", doc_type: "asi" })],
      sheets: [sheet({ gc_drawing_set_id: "s1", is_superseded: true })],
      filters: { search: "", docType: ALL, impact: ALL },
    });
    expect(model.issuances).toHaveLength(1);
    expect(model.filtered).toHaveLength(1);
    expect(model.stats.needsReview).toBe(1);
    expect(model.hasSupersededSheets).toBe(true);
    expect(model.reviewQueue.map((i) => i.id)).toEqual(["s1"]);
  });

  it("reports no superseded sheets when there are none", () => {
    const model = deriveGcDocumentsPageModel({
      sets: [set()],
      sheets: [sheet()],
      filters: { search: "", docType: ALL, impact: ALL },
    });
    expect(model.hasSupersededSheets).toBe(false);
  });
});
