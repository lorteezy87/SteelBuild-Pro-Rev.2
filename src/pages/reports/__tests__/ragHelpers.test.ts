import { describe, expect, it } from "vitest";
import { ragBucket, buildRagCards, countRagBuckets, RAG_LABEL } from "../ragHelpers";

describe("ragHelpers", () => {
  it("buckets and sorts cards", () => {
    expect(ragBucket("On Track")).toBe("On Track");
    expect(ragBucket("Weird")).toBe("Unknown");
    const cards = buildRagCards([
      { id: "2", name: "Beta", health_status: "On Track", original_contract_value: 1 },
      { id: "1", name: "Alpha", health_status: "At Risk", original_contract_value: 2 },
    ]);
    expect(cards[0].bucket).toBe("At Risk");
    expect(cards[0].name).toBe("Alpha");
    expect(RAG_LABEL[cards[0].bucket]).toBe("RED");
    expect(countRagBuckets(cards)["At Risk"]).toBe(1);
    expect(countRagBuckets(cards)["On Track"]).toBe(1);
  });
});
