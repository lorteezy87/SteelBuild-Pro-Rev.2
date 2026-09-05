import { describe, expect, it } from "vitest";
import {
  PRODUCTION_STAGE_TO_STATION,
  describeProductionSync,
  planProductionStageSync,
  productionStageRank,
} from "../productionStageStations";
import { PRODUCTION_STAGES } from "@/lib/importProductionStatus";
import { PIECE_STATIONS } from "@/lib/pieceControl/types";

describe("PRODUCTION_STAGE_TO_STATION", () => {
  it("covers every EPM stage and only names real canonical stations", () => {
    for (const stage of PRODUCTION_STAGES) {
      const target = PRODUCTION_STAGE_TO_STATION[stage];
      expect(target).toBeDefined();
      if (target.station) expect(PIECE_STATIONS).toContain(target.station);
    }
  });

  it("is monotonic in shop order so a later EPM stage never targets an earlier station", () => {
    let last = -1;
    for (const stage of PRODUCTION_STAGES) {
      const { station } = PRODUCTION_STAGE_TO_STATION[stage];
      const idx = station ? PIECE_STATIONS.indexOf(station) : -1;
      expect(idx).toBeGreaterThanOrEqual(last);
      last = idx;
    }
  });

  it("Paint fabricates (through ready_to_ship) and only Shipped ships", () => {
    expect(PRODUCTION_STAGE_TO_STATION.Paint).toEqual({ station: "ready_to_ship", ship: false });
    expect(PRODUCTION_STAGE_TO_STATION.Shipped).toEqual({ station: "ready_to_ship", ship: true });
    expect(PRODUCTION_STAGE_TO_STATION.Clean.station).toBe("qc");
    expect(PRODUCTION_STAGE_TO_STATION["Not Started"]).toEqual({ station: null, ship: false });
  });
});

describe("planProductionStageSync", () => {
  it("keeps the furthest stage per mark, normalises marks, and drops rows with nothing to do", () => {
    const updates = planProductionStageSync([
      { piece_mark: " 1b1 ", status: "Cut" },
      { piece_mark: "1B1", status: "Weld" },
      { piece_mark: "1B1", status: "Fit" },
      { piece_mark: "C2", status: "Not Started" },
      { piece_mark: "C3", status: "Bogus" },
      { piece_mark: "", status: "Paint" },
      { piece_mark: "B10", status: "Shipped" },
      { piece_mark: "B2", status: "Paint" },
    ]);
    expect(updates).toEqual([
      { mark: "1B1", target_station: "weld", ship: false, stage: "Weld" },
      { mark: "B2", target_station: "ready_to_ship", ship: false, stage: "Paint" },
      { mark: "B10", target_station: "ready_to_ship", ship: true, stage: "Shipped" },
    ]);
  });

  it("ranks stages in shop order and treats unknown stages as -1", () => {
    expect(productionStageRank("Cut")).toBeLessThan(productionStageRank("Paint"));
    expect(productionStageRank("  Weld ")).toBe(PRODUCTION_STAGES.indexOf("Weld"));
    expect(productionStageRank("nope")).toBe(-1);
    expect(productionStageRank(null)).toBe(-1);
  });
});

describe("describeProductionSync", () => {
  const base = { mode: "live", piecesAdvanced: 0, piecesUnchanged: 0, piecesSkipped: 0, rpcMissing: false, results: [] as any[] };

  it("is silent when piece control is off", () => {
    expect(describeProductionSync({ ...base, mode: "off", piecesAdvanced: 5 })).toBeNull();
    expect(describeProductionSync(null)).toBeNull();
  });

  it("summarises advanced / unchanged / skipped with the top skip reasons", () => {
    const text = describeProductionSync({
      ...base,
      piecesAdvanced: 12,
      piecesUnchanged: 3,
      piecesSkipped: 3,
      results: [
        { mark: "A", status: "skipped", reason: "Work package must have an active canonical release before production can advance" },
        { mark: "B", status: "skipped", reason: "Work package must have an active canonical release before production can advance" },
        { mark: "C", status: "skipped", reason: "ambiguous_mark" },
        { mark: "D", status: "advanced" },
      ],
    });
    expect(text).toBe("Piece Control: 12 lots advanced · 3 unchanged · 3 skipped (2 not released, 1 ambiguous mark)");
  });

  it("warns when the RPC is missing", () => {
    expect(describeProductionSync({ ...base, rpcMissing: true })).toMatch(/migration is not applied/);
  });
});
