
import { describe, expect, it } from "vitest";
import { selectNonContainerPieces } from "../pieceLogisticsHelpers";

describe("selectNonContainerPieces", () => {
  it("drops containers", () => {
    expect(
      selectNonContainerPieces([
        { id: "1", is_container: true },
        { id: "2", is_container: false },
        { id: "3" },
      ] as any).map((p) => p.id),
    ).toEqual(["2", "3"]);
  });
});
