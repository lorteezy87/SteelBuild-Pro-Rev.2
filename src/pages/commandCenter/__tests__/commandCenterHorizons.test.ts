import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deriveCommandHorizons } from "../commandCenterHorizons";
import type { ActionItem } from "../commandCenterControlCenter.derive";

function item(id: string, dueDate: string | null, urgency: ActionItem["urgency"] = "normal"): ActionItem {
  return {
    id,
    itemType: "RFI",
    title: id,
    status: "Open",
    priority: null,
    owner: null,
    dueDate,
    linkedTo: null,
    projectId: "p1",
    urgency,
    raw: {},
  };
}

describe("deriveCommandHorizons", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-16T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns NOW, 48 HOURS, and 10 DAYS in fixed order", () => {
    const horizons = deriveCommandHorizons([]);
    expect(horizons.map((horizon) => horizon.key)).toEqual(["now", "48h", "10d"]);
  });

  it("classifies overdue and blocking work into NOW", () => {
    const horizons = deriveCommandHorizons([
      item("overdue", "2026-09-15", "overdue"),
      item("blocked", null, "blocking"),
    ]);
    expect(horizons[0].items.map((entry) => entry.id)).toEqual(["overdue", "blocked"]);
  });

  it("classifies dated work without fabricating dates for undated items", () => {
    const horizons = deriveCommandHorizons([
      item("today", "2026-09-16"),
      item("tomorrow", "2026-09-17"),
      item("two-days", "2026-09-18"),
      item("ten-days", "2026-09-26"),
      item("undated", null),
    ]);

    expect(horizons[0].items.map((entry) => entry.id)).toEqual(["today"]);
    expect(horizons[1].items.map((entry) => entry.id)).toEqual(["tomorrow", "two-days"]);
    expect(horizons[2].items.map((entry) => entry.id)).toEqual(["ten-days"]);
    expect(horizons.flatMap((horizon) => horizon.items).map((entry) => entry.id)).not.toContain("undated");
  });
});
