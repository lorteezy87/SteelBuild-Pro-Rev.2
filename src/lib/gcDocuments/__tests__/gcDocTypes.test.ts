import { describe, expect, it } from "vitest";
import {
  DEFAULT_GC_DOC_TYPE,
  DEFAULT_STEEL_IMPACT,
  GC_DOC_TYPES,
  GC_DOC_TYPE_LABELS,
  GC_SET_CATEGORIES,
  POST_AWARD_GC_DOC_TYPES,
  STEEL_IMPACT_LABELS,
  STEEL_IMPACT_STATES,
  coerceGcDocType,
  coerceSteelImpact,
  gcDocTypeLabel,
  sanitizeGcDrawingSetPayload,
  steelImpactIsDecided,
  steelImpactLabel,
  steelImpactNeedsReview,
} from "../gcDocTypes";

// These lists mirror CHECK constraints in production. If a value here drifts
// from the database, the INSERT fails and the user loses their save — so the
// lists are asserted literally, not derived.
describe("gc doc type vocabulary", () => {
  it("matches gc_drawing_sets_doc_type_check exactly", () => {
    expect([...GC_DOC_TYPES]).toEqual([
      "gc_drawing",
      "asi",
      "addendum",
      "bulletin",
      "ccd",
      "revision",
      "contract_document",
      "specification",
    ]);
  });

  it("matches gc_drawing_sets_category_check exactly", () => {
    expect([...GC_SET_CATEGORIES]).toEqual([
      "architectural",
      "structural",
      "civil",
      "mechanical",
      "electrical",
      "plumbing",
      "specifications",
      "other",
    ]);
  });

  it("labels every type", () => {
    for (const t of GC_DOC_TYPES) {
      expect(GC_DOC_TYPE_LABELS[t]).toBeTruthy();
    }
  });

  it("defaults an unknown value to gc_drawing rather than dropping the row", () => {
    expect(coerceGcDocType("not-a-type")).toBe(DEFAULT_GC_DOC_TYPE);
    expect(coerceGcDocType(null)).toBe("gc_drawing");
    expect(coerceGcDocType(undefined)).toBe("gc_drawing");
    expect(coerceGcDocType("asi")).toBe("asi");
    expect(gcDocTypeLabel("asi")).toBe("ASI");
  });

  it("flags only post-award issuances as cost/schedule exposure", () => {
    expect(POST_AWARD_GC_DOC_TYPES.has("asi")).toBe(true);
    expect(POST_AWARD_GC_DOC_TYPES.has("ccd")).toBe(true);
    // An addendum is pre-award: it is priced in the bid, not a change to it.
    expect(POST_AWARD_GC_DOC_TYPES.has("addendum")).toBe(false);
    expect(POST_AWARD_GC_DOC_TYPES.has("gc_drawing")).toBe(false);
  });
});

describe("steel impact — absence is not evidence", () => {
  it("matches gc_drawing_sets_steel_impact_check exactly", () => {
    expect([...STEEL_IMPACT_STATES]).toEqual([
      "unknown",
      "pending_review",
      "none",
      "impacted",
    ]);
  });

  it("defaults to unknown, never none", () => {
    expect(DEFAULT_STEEL_IMPACT).toBe("unknown");
    expect(coerceSteelImpact(undefined)).toBe("unknown");
    expect(coerceSteelImpact(null)).toBe("unknown");
    expect(coerceSteelImpact("")).toBe("unknown");
    expect(coerceSteelImpact("no")).toBe("unknown");
  });

  it("never renders an un-reviewed issuance as cleared", () => {
    // The whole point: "Not reviewed" must not read like "No steel impact".
    expect(steelImpactLabel(undefined)).toBe("Not reviewed");
    expect(steelImpactLabel("pending_review")).toBe("Pending review");
    expect(steelImpactLabel("none")).toBe("No steel impact");
    expect(STEEL_IMPACT_LABELS.unknown).not.toBe(STEEL_IMPACT_LABELS.none);
  });

  it("treats unknown and pending_review as open questions, not answers", () => {
    expect(steelImpactIsDecided(undefined)).toBe(false);
    expect(steelImpactIsDecided("unknown")).toBe(false);
    expect(steelImpactIsDecided("pending_review")).toBe(false);
    expect(steelImpactIsDecided("none")).toBe(true);
    expect(steelImpactIsDecided("impacted")).toBe(true);

    expect(steelImpactNeedsReview("unknown")).toBe(true);
    expect(steelImpactNeedsReview("pending_review")).toBe(true);
    expect(steelImpactNeedsReview("impacted")).toBe(false);
  });
});

describe("sanitizeGcDrawingSetPayload", () => {
  it("corrects constrained values and reports what it changed", () => {
    const { record, warnings } = sanitizeGcDrawingSetPayload({
      set_name: "ASI 012",
      doc_type: "ASI",          // wrong case — not the stored value
      steel_impact: "maybe",
      category: "Structural",   // wrong case
    });
    expect(record.doc_type).toBe("gc_drawing");
    expect(record.steel_impact).toBe("unknown");
    expect(record.category).toBe("architectural");
    expect(warnings).toHaveLength(3);
    expect(record.set_name).toBe("ASI 012");
  });

  it("leaves valid values and unrelated keys untouched", () => {
    const { record, warnings } = sanitizeGcDrawingSetPayload({
      doc_type: "asi",
      steel_impact: "impacted",
      category: "structural",
      doc_number: "ASI 012",
      impact_notes: "New embeds at grid C.",
    });
    expect(warnings).toEqual([]);
    expect(record).toEqual({
      doc_type: "asi",
      steel_impact: "impacted",
      category: "structural",
      doc_number: "ASI 012",
      impact_notes: "New embeds at grid C.",
    });
  });

  it("does not invent keys on a partial update", () => {
    // A PATCH that only touches notes must not also write doc_type, or every
    // edit would silently reset the issuance type to its default.
    const { record } = sanitizeGcDrawingSetPayload({ impact_notes: "Reviewed." });
    expect(record).not.toHaveProperty("doc_type");
    expect(record).not.toHaveProperty("steel_impact");
    expect(record).not.toHaveProperty("category");
  });
});
