import { describe, expect, it } from "vitest";
import {
  findProjectById,
  filterByProjectId,
  computeProjectDetailKpis,
  resolveDefaultProjectId,
} from "../projectDetailsHelpers";

describe("projectDetailsHelpers", () => {
  it("finds and filters by project", () => {
    expect(findProjectById([{ id: 1 }, { id: "2" }], "2")?.id).toBe("2");
    expect(filterByProjectId([{ project_id: "a" }, { project_id: "b" }], "a")).toHaveLength(1);
    expect(resolveDefaultProjectId(null, [{ id: "x" }])).toBe("x");
    expect(resolveDefaultProjectId("y", [{ id: "x" }])).toBeNull();
  });

  it("computes KPI strip", () => {
    const k = computeProjectDetailKpis({
      projectRFIs: [1, 2],
      projectCOs: [1],
      projectActions: [1],
      projectWPs: [1, 2, 3],
      projectExpenses: [
        { payment_status: "Paid", amount: 10 },
        { payment_status: "Voided", amount: 99 },
      ],
      isRfiOpen: () => true,
      isCoPending: () => false,
      isActionItemOpen: () => true,
      isWpComplete: () => true,
    });
    expect(k.openRFIs).toBe(2);
    expect(k.pendingCOs).toBe(0);
    expect(k.openActions).toBe(1);
    expect(k.wpComplete).toBe(3);
    expect(k.wpPct).toBe(100);
    expect(k.totalExpenses).toBe(10);
  });
});
