import { describe, expect, it } from "vitest";
import { bucketByMatrix, matrixCellRisks, countMatrixPlaced } from "../risks/severity";

describe("matrixCellRisks / countMatrixPlaced", () => {
  const risks = [
    { id: "a", probability: 5, impact: 5 },
    { id: "b", probability: 1, impact: 1 },
    { id: "c", probability: 5, impact: 5 },
  ];
  const grid = bucketByMatrix(risks);

  it("returns cell risks and placed count", () => {
    expect(matrixCellRisks(grid, { p: 5, i: 5 }).map((r) => r.id)).toEqual(["a", "c"]);
    expect(matrixCellRisks(grid, null)).toEqual([]);
    expect(countMatrixPlaced(grid)).toBe(3);
  });
});
