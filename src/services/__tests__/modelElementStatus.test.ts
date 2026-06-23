import { describe, expect, it } from "vitest";
import {
  buildHeldPieceMarkSet,
  normalizePieceMark,
  resolveElementStatus,
  summarizeElementStatuses,
} from "../modelElementStatus";

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
});

describe("buildHeldPieceMarkSet", () => {
  it("collects marks only from OPEN fab-hold RFIs", () => {
    const held = buildHeldPieceMarkSet([
      { status: "Open", fab_hold: true, piece_marks: "1B1, 2c3  4D4" },
      { status: "Open", fab_hold: false, piece_marks: "5E5" },        // no hold
      { status: "Closed", fab_hold: true, piece_marks: "6F6" },       // terminal
      { status: "Answered", fab_hold: true, piece_marks: "7G7" },     // terminal
      null,
    ]);
    expect(held).toEqual(new Set(["1B1", "2C3", "4D4"]));
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

  it("piece-mark fab hold wins even over a healthy package (and over unmapped)", () => {
    const held = new Set(["1B1"]);
    expect(
      resolveElementStatus(
        { piece_mark: "1b1", drawing_set_id: "set-1" },
        setMap(readiness({ erectionReady: true, fabricationReady: true })),
        new Map(),
        held,
      ),
    ).toBe("rfi_blocked");
    expect(resolveElementStatus({ piece_mark: "1B1" }, new Map(), new Map(), held)).toBe("rfi_blocked");
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
