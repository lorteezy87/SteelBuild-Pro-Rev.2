import { describe, it, expect, vi } from "vitest";

// revisions.js imports the supabase client at module scope; stub it so the
// pure helper can be exercised without env wiring.
vi.mock("@/lib/supabase", () => ({ supabase: { from: vi.fn() } }));

import { mapClonedZonesBySource } from "../revisions";

describe("mapClonedZonesBySource", () => {
  const source = [{ id: "z1" }, { id: "z2" }, { id: "z3" }];

  it("pairs each source zone with its clone by parent_zone_id, regardless of insert-result order", () => {
    const inserted = [
      { id: "n3", parent_zone_id: "z3" },
      { id: "n1", parent_zone_id: "z1" },
      { id: "n2", parent_zone_id: "z2" },
    ];
    const map = mapClonedZonesBySource(source, inserted);
    expect(map.get("z1").id).toBe("n1");
    expect(map.get("z2").id).toBe("n2");
    expect(map.get("z3").id).toBe("n3");
  });

  it("throws instead of guessing when a clone is missing", () => {
    expect(() => mapClonedZonesBySource(source, [{ id: "n1", parent_zone_id: "z1" }])).toThrow(/z2/);
  });

  it("handles the empty case", () => {
    expect(mapClonedZonesBySource([], []).size).toBe(0);
  });
});
