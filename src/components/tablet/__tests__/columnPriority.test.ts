import { describe, expect, it } from "vitest";
import { visibleColumnIds } from "../columnPriority";

const cols = [
  { id: "num", priority: "essential" as const },
  { id: "title", priority: "essential" as const },
  { id: "status", priority: "secondary" as const },
  { id: "updated", priority: "optional" as const },
];

describe("visibleColumnIds", () => {
  it("keeps all on desktop", () => {
    expect(visibleColumnIds(cols, "desktop")).toEqual(["num", "title", "status", "updated"]);
  });
  it("drops optional on tablet", () => {
    expect(visibleColumnIds(cols, "tablet")).toEqual(["num", "title", "status"]);
  });
  it("keeps essentials only on phone", () => {
    expect(visibleColumnIds(cols, "phone")).toEqual(["num", "title"]);
  });
});
