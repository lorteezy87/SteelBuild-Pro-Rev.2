import { describe, expect, it } from "vitest";
import { BIC_COLOR } from "@/components/design-system/tokens";
import { BALL_IN_COURT_PARTIES, normalizeBallInCourt } from "../ballInCourt";
import { buildIcs } from "../icsExport";

describe("ball-in-court presentation and import", () => {
  it("gives every storable party a theme-aware chip", () => {
    expect(Object.keys(BIC_COLOR).sort()).toEqual([...BALL_IN_COURT_PARTIES].sort());
    expect(Object.values(BIC_COLOR).every((color) => color.startsWith("var(--"))).toBe(true);
  });
  it("normalizes party names and the generic Engineer synonym", () => {
    expect(normalizeBallInCourt(" engineer ")).toBe("EOR");
    expect(normalizeBallInCourt(" subcontractor ")).toBe("Subcontractor");
  });
  it.each(["S&H", "S&H Steel", "John Doe, PE", "Another company"])("does not guess a party for %s", (name) => {
    expect(normalizeBallInCourt(name)).toBeNull();
  });
});

it("identifies the calendar software without attributing it to a customer", () => {
  const ics = buildIcs({ events: [], calendarName: "Test workspace" });
  expect(ics).toContain("PRODID:-//SteelBuild Pro//Calendar Export//EN\r\n");
  expect(ics).not.toContain("S&H");
});
