import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildRfiDrawingReference,
  formatRelative,
  describeActivity,
} from "../zonePanelHelpers";

describe("buildRfiDrawingReference", () => {
  it("returns empty string when zone is null/undefined", () => {
    expect(buildRfiDrawingReference(null, { sheet_number: "S-100" })).toBe("");
    expect(buildRfiDrawingReference(undefined, null)).toBe("");
  });

  it("composes sheet number, zone key/label, and refs in canonical order", () => {
    const zone = {
      zone_key: "Z-003",
      label: "Stair 2",
      level_ref: "2",
      grid_ref: "C-5",
      detail_ref: "4/S-501",
    };
    const sheet = { sheet_number: "S-402", revision_code: "A" };
    expect(buildRfiDrawingReference(zone, sheet)).toBe(
      "S-402 Rev A · Z-003 Stair 2 · Level 2 / Grid C-5 / Detail 4/S-501",
    );
  });

  it("omits revision when missing and skips label when same as zone_key", () => {
    const zone = { zone_key: "Z-1", label: "Z-1" };
    const sheet = { sheet_number: "S-100" };
    expect(buildRfiDrawingReference(zone, sheet)).toBe("S-100 · Z-1");
  });

  it("works with no sheet and partial refs", () => {
    const zone = { zone_key: "Z-9", grid_ref: "B-2" };
    expect(buildRfiDrawingReference(zone, null)).toBe("Z-9 · Grid B-2");
  });
});

describe("formatRelative", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-03T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns empty string for invalid input", () => {
    expect(formatRelative("not a date")).toBe("");
  });

  it("returns 'just now' for sub-30s deltas", () => {
    expect(formatRelative("2026-05-03T11:59:50Z")).toBe("just now");
  });

  it("returns minutes / hours / days for short deltas", () => {
    expect(formatRelative("2026-05-03T11:55:00Z")).toBe("5m ago");
    expect(formatRelative("2026-05-03T09:00:00Z")).toBe("3h ago");
    expect(formatRelative("2026-04-30T12:00:00Z")).toBe("3d ago");
  });

  it("falls back to absolute date past 30 days", () => {
    const out = formatRelative("2026-01-01T00:00:00Z");
    expect(out).not.toBe("");
    // Should not match the relative format
    expect(out).not.toMatch(/(ago|just now)/);
  });
});

describe("describeActivity", () => {
  it("returns the link_added title with the LINKABLE_TYPE_LABELS lookup", () => {
    const out = describeActivity({
      event_type: "link_added",
      metadata: { linked_record_type: "rfi", link_source: "manual" },
    });
    expect(out.color).toBe("#22C55E");
    expect(out.title).toBe("Linked RFI"); // LINKABLE_TYPE_LABELS["rfi"] === "RFI"
    expect(out.subtitle).toBeNull();
  });

  it("annotates ai_suggested links in the title and surfaces created_from_zone", () => {
    const aiOut = describeActivity({
      event_type: "link_added",
      metadata: { linked_record_type: "delivery", link_source: "ai_suggested" },
    });
    expect(aiOut.title).toMatch(/ai_suggested/);

    const fromZone = describeActivity({
      event_type: "link_added",
      metadata: { linked_record_type: "rfi", created_from_zone: true },
    });
    expect(fromZone.subtitle).toBe("Created from this zone");
  });

  it("falls back to event_type for unknown events", () => {
    const out = describeActivity({ event_type: "totally_made_up" });
    expect(out.title).toBe("totally_made_up");
    expect(out.color).toBe("#94A3B8");
  });
});
