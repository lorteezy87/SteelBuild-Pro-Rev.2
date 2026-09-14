import { describe, expect, it } from "vitest";
import {
  downstreamFor,
  filterRevisionImpactRows,
  shouldVirtualizeRevisionImpact,
} from "../revisionImpact.derive";

describe("downstreamFor", () => {
  it("maps each severity to its downstream label + tone", () => {
    expect(downstreamFor("critical")).toEqual({ label: "In field", tone: "danger" });
    expect(downstreamFor("high")).toEqual({ label: "Delivered", tone: "danger" });
    expect(downstreamFor("medium")).toEqual({ label: "Fabricated", tone: "review" });
    expect(downstreamFor("low")).toEqual({ label: "Not downstream", tone: "neutral" });
  });

  it("labels the unknown severity as unknown, never as an all-clear", () => {
    const meta = downstreamFor("unknown");
    expect(meta.label).toBe("Unknown");
    expect(meta.tone).toBe("warn");
    expect(meta.title).toMatch(/can't be determined/i);
  });

  // An unrecognized severity must never render "Not downstream" — that is a
  // positive claim about steel, and defaulting to it is how a missing-data row
  // came to read as "caught pre-fab".
  it("falls back to 'unknown' for a missing / unrecognized severity", () => {
    expect(downstreamFor(undefined)).toEqual(downstreamFor("unknown"));
    expect(downstreamFor(null)).toEqual(downstreamFor("unknown"));
    expect(downstreamFor("bogus")).toEqual(downstreamFor("unknown"));
    expect(downstreamFor(undefined).label).not.toBe("Not downstream");
  });
});

describe("filterRevisionImpactRows", () => {
  const rows = [
    { sheetNumber: "S-101", setName: "Anchor Bolts", wpNames: ["WP-Foundations"] },
    { sheetNumber: "S-201", setName: "Main Frame", wpNames: ["WP-Level 2", "WP-Roof"] },
    { sheetNumber: "E-001", setName: "Embeds", wpNames: [] },
  ];

  it("returns all rows for an empty query", () => {
    expect(filterRevisionImpactRows(rows, "")).toHaveLength(3);
  });
  it("matches on sheet number", () => {
    expect(filterRevisionImpactRows(rows, "s-201")).toEqual([rows[1]]);
  });
  it("matches on set name", () => {
    expect(filterRevisionImpactRows(rows, "embed")).toEqual([rows[2]]);
  });
  it("matches on any work-package name", () => {
    expect(filterRevisionImpactRows(rows, "roof")).toEqual([rows[1]]);
  });
  it("returns nothing when there is no match", () => {
    expect(filterRevisionImpactRows(rows, "zzz")).toHaveLength(0);
  });
});

describe("shouldVirtualizeRevisionImpact", () => {
  it("virtualizes strictly above 100 rows", () => {
    expect(shouldVirtualizeRevisionImpact(100)).toBe(false);
    expect(shouldVirtualizeRevisionImpact(101)).toBe(true);
    expect(shouldVirtualizeRevisionImpact(0)).toBe(false);
  });
});
