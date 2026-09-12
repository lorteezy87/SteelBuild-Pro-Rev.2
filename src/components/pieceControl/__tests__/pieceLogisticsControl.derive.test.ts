import { describe, expect, it } from "vitest";
import type { LogisticsSnapshot } from "@/lib/pieceControl/logisticsRepository";
import { derivePieceLogisticsView } from "../pieceLogisticsControl.derive";

const piece = {
  id: "piece-1",
  lifecycle_status: "fabricated",
  is_container: false,
} as LogisticsSnapshot["pieces"][number];

describe("derivePieceLogisticsView", () => {
  it("builds action candidates, eligibility, counts, and selected history", () => {
    const view = derivePieceLogisticsView(
      {
        pieces: [
          piece,
          { ...piece, id: "held", on_hold: true },
          { ...piece, id: "delivered", lifecycle_status: "delivered" },
          { ...piece, id: "container", is_container: true },
        ],
        events: [
          { id: "event-1", piece_id: "piece-1" },
          { id: "event-2", piece_id: "delivered" },
        ] as LogisticsSnapshot["events"],
      },
      "piece-1",
    );

    expect(view.actions.ship.candidates.map((row) => row.id)).toEqual([
      "piece-1",
      "held",
    ]);
    expect(view.actions.ship.selectableIds).toEqual(["piece-1"]);
    expect(view.readyCounts).toEqual({ ship: 2, deliver: 0, erect: 1 });
    expect(view.historyPiece?.id).toBe("piece-1");
    expect(view.history.map((event) => event.id)).toEqual(["event-1"]);
  });
});
