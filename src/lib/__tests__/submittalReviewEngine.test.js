/**
 * submittalReviewEngine.test.js — Coverage for the deterministic review
 * pipeline's Intake stage, specifically related-RFI resolution.
 *
 * Regression guard for the "set-assigned RFIs don't show up" bug: the real
 * submittal↔RFI link is the scalar `rfis.drawing_set_id` matched against the
 * submittal's `drawing_set_ids[]`. The old code read nonexistent
 * `rfi.drawing_ids` / `rfi.drawing_set_ids` columns and never matched.
 */

import { describe, it, expect } from "vitest";
import { runIntake } from "../submittalReviewEngine.js";

describe("runIntake — related RFIs via drawing set", () => {
  it("matches an RFI whose scalar drawing_set_id is in the submittal's drawing_set_ids", () => {
    const submittal = { id: "s1", drawing_set_ids: ["set-A", "set-B"] };
    const rfis = [
      { id: "r1", drawing_set_id: "set-B" }, // in the package → related
      { id: "r2", drawing_set_id: "set-Z" }, // different set → not related
    ];
    const out = runIntake(submittal, [], [], rfis);
    expect(out.relatedRFIs).toHaveLength(1);
    expect(out.relatedRFIs[0].id).toBe("r1");
  });

  it("returns 0 when the RFI's drawing_set_id is not in the submittal's sets", () => {
    const submittal = { id: "s1", drawing_set_ids: ["set-A"] };
    const rfis = [{ id: "r1", drawing_set_id: "set-Z" }];
    const out = runIntake(submittal, [], [], rfis);
    expect(out.relatedRFIs).toHaveLength(0);
  });

  it("matches via spec_section regardless of drawing set (regression guard)", () => {
    const submittal = { id: "s1", spec_section: "05 12 00", drawing_set_ids: ["set-A"] };
    const rfis = [{ id: "r1", spec_section: "05 12 00", drawing_set_id: "set-Z" }];
    const out = runIntake(submittal, [], [], rfis);
    expect(out.relatedRFIs).toHaveLength(1);
    expect(out.relatedRFIs[0].id).toBe("r1");
  });

  it("returns 0 for empty inputs (no sets, no rfis)", () => {
    const submittal = { id: "s1" };
    const out = runIntake(submittal, [], [], []);
    expect(out.relatedRFIs).toHaveLength(0);
  });
});
