import { describe, expect, it } from "vitest";
import { groupSubmittalRounds, indexDrawingSets } from "../useSubmittalsPageQueries";

describe("submittal page query derivations", () => {
  it("indexes only drawing sets with persistent ids", () => {
    const indexed = indexDrawingSets([
      { id: "set-b", set_name: "B" },
      { set_name: "Unsaved" },
      { id: "set-a", set_name: "A" },
    ]);

    expect([...indexed.keys()]).toEqual(["set-b", "set-a"]);
    expect(indexed.get("set-a")?.set_name).toBe("A");
  });

  it("groups rounds by submittal and orders each group by round number", () => {
    const grouped = groupSubmittalRounds([
      { id: "r3", submittal_id: "sub-1", round_number: 3 },
      { id: "orphan", round_number: 9 },
      { id: "r1", submittal_id: "sub-1", round_number: 1 },
      { id: "r2", submittal_id: "sub-2", round_number: 2 },
      { id: "default", submittal_id: "sub-2" },
    ]);

    expect(grouped["sub-1"].map((round) => round.id)).toEqual(["r1", "r3"]);
    expect(grouped["sub-2"].map((round) => round.id)).toEqual(["default", "r2"]);
    expect(grouped).not.toHaveProperty("undefined");
  });
});
