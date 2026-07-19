/**
 * modelElementStatus.test.ts
 *
 * Tests for resolveElementStatus (status precedence per bucket) and
 * summarizeElementStatuses.
 *
 * DETAILING_STATE_ORDER (from detailingPackageState.js):
 *   index 0: "Not Started"
 *   index 1: "In Detailing"
 *   index 2: "Internal Review"
 *   index 3: "Ready to Submit"
 *   index 4: "IFA"   ← IFA_IDX; states ≥4 → in_review, states <4 → in_detailing
 *   index 5: "OFA"
 *   ...
 *   index 9: "Released"
 *   index 10: "Partially Released"
 *   index 11: "Released for Erection"
 */

import { describe, expect, it } from "vitest";
import {
  normalizePieceMark,
  resolveElementStatus,
  summarizeElementStatuses,
} from "../modelElementStatus";
import { normalizePieceMark as canonicalNormalizePieceMark } from "@/lib/pieceControl/identity";

const readiness = (over = {}) => ({
  effectiveState: "IFA",
  fabricationReady: false,
  erectionReady: false,
  rfiBlocked: false,
  atRisk: false,
  ...over,
});

describe("normalizePieceMark", () => {
  it("trims and uppercases", () => {
    expect(normalizePieceMark(" 1b1 ")).toBe("1B1");
    expect(normalizePieceMark(null)).toBe("");
  });

  it("reuses canonical piece-control normalization", () => {
    expect(normalizePieceMark(" 1b1 ")).toBe(canonicalNormalizePieceMark(" 1b1 "));
  });
});


describe("resolveElementStatus", () => {
  const setMap = (r: any) => new Map([["set-1", r]]);

  it("unmapped when the element resolves to no package", () => {
    expect(resolveElementStatus({ piece_mark: "1B1" }, new Map())).toBe("unmapped");
  });

  it("resolves the package through drawing_id -> set when only the sheet is linked", () => {
    const bySheet = new Map([["dwg-9", "set-1"]]);
    expect(
      resolveElementStatus(
        { piece_mark: "1B1", drawing_id: "dwg-9" },
        setMap(readiness({ fabricationReady: true, effectiveState: "Released" })),
        bySheet,
      ),
    ).toBe("fab_ready");
  });

  it("package rfiBlocked -> rfi_blocked; atRisk -> behind_schedule (in priority order)", () => {
    expect(
      resolveElementStatus({ piece_mark: "X", drawing_set_id: "set-1" }, setMap(readiness({ rfiBlocked: true, atRisk: true }))),
    ).toBe("rfi_blocked");
    expect(
      resolveElementStatus({ piece_mark: "X", drawing_set_id: "set-1" }, setMap(readiness({ atRisk: true, fabricationReady: true }))),
    ).toBe("behind_schedule");
  });

  it("erection_ready outranks fab_ready; review/drafting bands map by state", () => {
    expect(
      resolveElementStatus({ piece_mark: "X", drawing_set_id: "set-1" }, setMap(readiness({ erectionReady: true, fabricationReady: true }))),
    ).toBe("erection_ready");
    expect(
      resolveElementStatus({ piece_mark: "X", drawing_set_id: "set-1" }, setMap(readiness({ effectiveState: "OFA" }))),
    ).toBe("in_review");
    expect(
      resolveElementStatus({ piece_mark: "X", drawing_set_id: "set-1" }, setMap(readiness({ effectiveState: "In Detailing" }))),
    ).toBe("in_detailing");
    expect(
      resolveElementStatus({ piece_mark: "X", drawing_set_id: "set-1" }, setMap(readiness({ effectiveState: "Not Started" }))),
    ).toBe("in_detailing");
  });
});

describe("summarizeElementStatuses", () => {
  it("buckets counts, GUIDs and ids; skips deleted; computes mapped %", () => {
    const readinessBySet = new Map([
      ["set-ok", readiness({ fabricationReady: true, effectiveState: "Released" })],
      ["set-rev", readiness({ effectiveState: "BFA" })],
    ]);
    const elements = [
      { id: "e1", element_guid: "g1", piece_mark: "1B1", drawing_set_id: "set-ok" },
      { id: "e2", element_guid: "g2", piece_mark: "2B2", drawing_set_id: "set-rev" },
      { id: "e3", element_guid: null as string | null, piece_mark: "3B3" },      // unmapped, no guid
      { id: "e4", element_guid: "g4", piece_mark: "4B4", is_deleted: true },     // skipped
    ];

    const s = summarizeElementStatuses(elements, readinessBySet);
    expect(s.total).toBe(3);
    expect(s.counts.fab_ready).toBe(1);
    expect(s.counts.in_review).toBe(1);
    expect(s.counts.unmapped).toBe(1);
    expect(s.guidsByStatus.fab_ready).toEqual(["g1"]);
    expect(s.guidsByStatus.unmapped).toEqual([]); // e3 has no guid
    // marksByStatus is the guid-less coloring fallback: every element contributes
    // its normalized mark, including e3 (which has no GUID).
    expect(s.marksByStatus.fab_ready).toEqual(["1B1"]);
    expect(s.marksByStatus.in_review).toEqual(["2B2"]);
    expect(s.marksByStatus.unmapped).toEqual(["3B3"]); // e3 colors by mark even without a guid
    expect(s.idsByStatus.unmapped).toEqual(["e3"]);
    expect(s.mappedPct).toBe(67); // 2 of 3 mapped
  });

  it("handles empty input", () => {
    const s = summarizeElementStatuses([], new Map());
    expect(s.total).toBe(0);
    expect(s.mappedPct).toBe(0);
  });
});

// ─── Per-bucket precedence tests (one it per bucket) ─────────────────────────
// Each test isolates exactly one bucket by controlling which readiness flags are
// set and which effectiveState is used. Precedence order (first match wins):
//   unmapped → rfi_blocked → behind_schedule → erection_ready →
//   fab_ready → in_review → in_detailing

describe("resolveElementStatus — per-bucket precedence", () => {
  const el = (drawing_set_id: string) => ({ id: "e1", piece_mark: "1B1", drawing_set_id });
  const setMap = (r: any) => new Map([["set-a", r]]);

  it("bucket: unmapped — no readiness for the set → 'unmapped'", () => {
    // Element has a drawing_set_id but the map has no entry for it
    expect(
      resolveElementStatus(el("set-missing"), new Map([["set-other", readiness()]])),
    ).toBe("unmapped");
  });

  it("bucket: rfi_blocked — readiness.rfiBlocked true → 'rfi_blocked' (highest non-unmapped priority)", () => {
    // Even with atRisk=true and erectionReady=true, rfiBlocked wins
    expect(
      resolveElementStatus(
        el("set-a"),
        setMap(readiness({ rfiBlocked: true, atRisk: true, erectionReady: true, fabricationReady: true })),
      ),
    ).toBe("rfi_blocked");
  });

  it("bucket: behind_schedule — readiness.atRisk true (rfiBlocked false) → 'behind_schedule'", () => {
    // atRisk outranks erectionReady and fabricationReady
    expect(
      resolveElementStatus(
        el("set-a"),
        setMap(readiness({ atRisk: true, erectionReady: true, fabricationReady: true })),
      ),
    ).toBe("behind_schedule");
  });

  it("bucket: erection_ready — erectionReady true (not blocked/atRisk) → 'erection_ready'", () => {
    expect(
      resolveElementStatus(
        el("set-a"),
        setMap(readiness({ erectionReady: true, fabricationReady: true })),
      ),
    ).toBe("erection_ready");
  });

  it("bucket: fab_ready — fabricationReady true (not blocked/atRisk/erectionReady) → 'fab_ready'", () => {
    expect(
      resolveElementStatus(
        el("set-a"),
        setMap(readiness({ fabricationReady: true, effectiveState: "Released" })),
      ),
    ).toBe("fab_ready");
  });

  it("bucket: in_review — effectiveState 'IFA' (≥ IFA_IDX=4), no ready flags → 'in_review'", () => {
    // IFA is exactly at IFA_IDX → in_review
    expect(
      resolveElementStatus(
        el("set-a"),
        setMap(readiness({ effectiveState: "IFA" })),
      ),
    ).toBe("in_review");
  });

  it("bucket: in_review — effectiveState 'Released' (past IFA) also yields 'in_review'", () => {
    // Released (index 9) ≥ IFA_IDX (4) but no fabricationReady → in_review
    expect(
      resolveElementStatus(
        el("set-a"),
        setMap(readiness({ effectiveState: "Released", fabricationReady: false })),
      ),
    ).toBe("in_review");
  });

  it("bucket: in_detailing — effectiveState 'In Detailing' (index 1 < IFA_IDX=4) → 'in_detailing'", () => {
    expect(
      resolveElementStatus(
        el("set-a"),
        setMap(readiness({ effectiveState: "In Detailing" })),
      ),
    ).toBe("in_detailing");
  });

  it("bucket: in_detailing — effectiveState 'Not Started' (index 0 < IFA_IDX=4) → 'in_detailing'", () => {
    expect(
      resolveElementStatus(
        el("set-a"),
        setMap(readiness({ effectiveState: "Not Started" })),
      ),
    ).toBe("in_detailing");
  });

  it("bucket: in_detailing — effectiveState 'Ready to Submit' (index 3 < IFA_IDX=4) → 'in_detailing'", () => {
    expect(
      resolveElementStatus(
        el("set-a"),
        setMap(readiness({ effectiveState: "Ready to Submit" })),
      ),
    ).toBe("in_detailing");
  });

  it("drawing_id resolution — element with drawing_id (no drawing_set_id) uses sheetSetIdByDrawingId map", () => {
    // Element is linked to a sheet; the sheet belongs to set-a via sheetSetIdByDrawingId
    const bySheet = new Map([["dwg-5", "set-a"]]);
    expect(
      resolveElementStatus(
        { id: "e9", piece_mark: "9B1", drawing_id: "dwg-5" }, // no drawing_set_id
        setMap(readiness({ rfiBlocked: true })),
        bySheet,
      ),
    ).toBe("rfi_blocked");
  });

  it("drawing_id with no matching sheetSetIdByDrawingId entry → 'unmapped'", () => {
    expect(
      resolveElementStatus(
        { piece_mark: "X", drawing_id: "dwg-unknown" },
        setMap(readiness({ fabricationReady: true })),
        new Map(), // empty sheet→set map
      ),
    ).toBe("unmapped");
  });
});

// ─── Extended summarizeElementStatuses coverage ───────────────────────────────

describe("summarizeElementStatuses — extended", () => {
  it("mixed mapped + unmapped: counts, idsByStatus, and mappedPct", () => {
    const readinessBySet = new Map([
      ["set-fab",  readiness({ fabricationReady: true, effectiveState: "Released" })],
      ["set-risk", readiness({ atRisk: true })],
    ]);

    const elements = [
      // fab_ready
      { id: "e1", element_guid: "g1", piece_mark: "A1", drawing_set_id: "set-fab" },
      { id: "e2", element_guid: "g2", piece_mark: "A2", drawing_set_id: "set-fab" },
      // behind_schedule
      { id: "e3", element_guid: "g3", piece_mark: "B1", drawing_set_id: "set-risk" },
      // unmapped (no set link)
      { id: "e4", element_guid: null as string | null, piece_mark: "C1" },
      // deleted — must be ignored
      { id: "e5", element_guid: "g5", piece_mark: "D1", drawing_set_id: "set-fab", is_deleted: true },
    ];

    const s = summarizeElementStatuses(elements, readinessBySet);

    // total excludes deleted
    expect(s.total).toBe(4);

    // counts
    expect(s.counts.fab_ready).toBe(2);
    expect(s.counts.behind_schedule).toBe(1);
    expect(s.counts.unmapped).toBe(1);

    // idsByStatus for each populated bucket
    expect(s.idsByStatus.fab_ready).toEqual(["e1", "e2"]);
    expect(s.idsByStatus.behind_schedule).toEqual(["e3"]);
    expect(s.idsByStatus.unmapped).toEqual(["e4"]);

    // mappedPct: 3 mapped out of 4 total = 75
    expect(s.mappedPct).toBe(75);
  });

  it("all elements unmapped → mappedPct = 0", () => {
    const elements = [
      { id: "u1", element_guid: "g1", piece_mark: "X1" },
      { id: "u2", element_guid: "g2", piece_mark: "X2" },
    ];
    const s = summarizeElementStatuses(elements, new Map());
    expect(s.total).toBe(2);
    expect(s.counts.unmapped).toBe(2);
    expect(s.mappedPct).toBe(0);
  });

  it("null input → total=0, mappedPct=0, all counts zero", () => {
    const s = summarizeElementStatuses(null, new Map());
    expect(s.total).toBe(0);
    expect(s.mappedPct).toBe(0);
    for (const v of Object.values(s.counts)) expect(v).toBe(0);
  });
});
