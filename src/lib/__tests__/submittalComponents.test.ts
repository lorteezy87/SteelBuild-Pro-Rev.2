import { describe, expect, it } from "vitest";
import {
  DRAWING_TYPES,
  DRAWING_TYPE_ABBR,
  buildComponentChips,
  compareByDrawingType,
  componentState,
  missingDrawingTypes,
  releasePatch,
  rollupComponents,
  sortComponents,
  type SubmittalComponent,
} from "../submittalComponents";

// Phase 4 per-drawing-type submittal tracking: a submittal carries up to 3
// components (Shop/Erection/Part), each with its own received + released dates.
// These pin the pure derivations (state, rollup, chips, ordering) without React
// or the DB — mirroring the standalone tracker's TypeChips/release logic.

const comp = (
  drawing_type: string,
  extra: Partial<SubmittalComponent> = {},
): SubmittalComponent => ({
  id: `c-${drawing_type}`,
  submittal_id: "s1",
  project_id: "p1",
  drawing_type,
  received_date: null,
  released_date: null,
  is_released: false,
  ...extra,
});

describe("componentState", () => {
  it("is not_received with no received date and not released", () => {
    expect(componentState({ received_date: null, is_released: false })).toBe("not_received");
    expect(componentState({ received_date: "", is_released: false })).toBe("not_received");
  });
  it("is received once a received date is set", () => {
    expect(componentState({ received_date: "2026-07-01", is_released: false })).toBe("received");
  });
  it("is released when is_released, even without a received date", () => {
    // A type can be released straight off a same-day receipt — release wins.
    expect(componentState({ received_date: null, is_released: true })).toBe("released");
    expect(componentState({ received_date: "2026-07-01", is_released: true })).toBe("released");
  });
});

describe("compareByDrawingType / sortComponents", () => {
  it("orders Shop → Erection → Part regardless of input order", () => {
    const sorted = sortComponents([comp("Part"), comp("Shop"), comp("Erection")]);
    expect(sorted.map((c) => c.drawing_type)).toEqual(["Shop", "Erection", "Part"]);
  });
  it("does not mutate the input array", () => {
    const input = [comp("Part"), comp("Shop")];
    const before = input.map((c) => c.drawing_type);
    sortComponents(input);
    expect(input.map((c) => c.drawing_type)).toEqual(before);
  });
  it("sorts unknown drawing types after the known three", () => {
    const sorted = sortComponents([comp("Weird"), comp("Shop")]);
    expect(sorted.map((c) => c.drawing_type)).toEqual(["Shop", "Weird"]);
  });
  it("compareByDrawingType is a total order matching DRAWING_TYPES", () => {
    expect(compareByDrawingType(comp("Shop"), comp("Part"))).toBeLessThan(0);
    expect(compareByDrawingType(comp("Part"), comp("Shop"))).toBeGreaterThan(0);
    expect(compareByDrawingType(comp("Erection"), comp("Erection"))).toBe(0);
  });
});

describe("rollupComponents", () => {
  it("returns an all-zero, all-false rollup for empty / non-array input", () => {
    const empty = rollupComponents([]);
    expect(empty).toEqual({
      total: 0,
      receivedCount: 0,
      releasedCount: 0,
      fullyReleased: false,
      partiallyReleased: false,
      anyReleased: false,
    });
    // The critical guard: an empty list must NOT read as fullyReleased even
    // though [].every() is vacuously true.
    expect(rollupComponents(null).fullyReleased).toBe(false);
    expect(rollupComponents(undefined).fullyReleased).toBe(false);
  });
  it("counts received (received OR released) and released separately", () => {
    const r = rollupComponents([
      comp("Shop", { received_date: "2026-07-01", is_released: true, released_date: "2026-07-02" }),
      comp("Erection", { received_date: "2026-07-01" }),
      comp("Part"),
    ]);
    expect(r.total).toBe(3);
    expect(r.receivedCount).toBe(2); // Shop (released⇒received) + Erection
    expect(r.releasedCount).toBe(1); // Shop only
    expect(r.anyReleased).toBe(true);
    expect(r.partiallyReleased).toBe(true);
    expect(r.fullyReleased).toBe(false);
  });
  it("is fullyReleased only when every component is released", () => {
    const r = rollupComponents([
      comp("Shop", { is_released: true }),
      comp("Erection", { is_released: true }),
    ]);
    expect(r.fullyReleased).toBe(true);
    expect(r.partiallyReleased).toBe(false);
  });
});

describe("buildComponentChips", () => {
  it("returns one ordered descriptor per tracked type with correct state", () => {
    const chips = buildComponentChips([
      comp("Part", { is_released: true }),
      comp("Shop", { received_date: "2026-07-01" }),
    ]);
    expect(chips.map((c) => c.drawingType)).toEqual(["Shop", "Part"]);
    expect(chips[0]).toMatchObject({ abbr: "S", state: "received", title: "Shop: received" });
    expect(chips[1]).toMatchObject({ abbr: "P", state: "released", title: "Part: released" });
  });
  it("drops unknown drawing types and is empty-safe", () => {
    expect(buildComponentChips([])).toEqual([]);
    expect(buildComponentChips(null)).toEqual([]);
    expect(buildComponentChips([comp("Bogus")])).toEqual([]);
  });
});

describe("missingDrawingTypes", () => {
  it("returns the types not yet present, in canonical order", () => {
    expect(missingDrawingTypes([comp("Shop")])).toEqual(["Erection", "Part"]);
    expect(missingDrawingTypes([comp("Part"), comp("Shop"), comp("Erection")])).toEqual([]);
    expect(missingDrawingTypes([])).toEqual(["Shop", "Erection", "Part"]);
    expect(missingDrawingTypes(null)).toEqual(["Shop", "Erection", "Part"]);
  });
});

describe("releasePatch", () => {
  it("stamps released_date with today on release", () => {
    expect(releasePatch(true, "2026-07-04")).toEqual({ is_released: true, released_date: "2026-07-04" });
  });
  it("clears released_date on un-release", () => {
    expect(releasePatch(false, "2026-07-04")).toEqual({ is_released: false, released_date: null });
  });
});

describe("constants", () => {
  it("DRAWING_TYPES + abbreviations are the canonical S/E/P", () => {
    expect(DRAWING_TYPES).toEqual(["Shop", "Erection", "Part"]);
    expect(DRAWING_TYPE_ABBR).toEqual({ Shop: "S", Erection: "E", Part: "P" });
  });
});
