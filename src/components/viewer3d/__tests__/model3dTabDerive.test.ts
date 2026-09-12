import { describe, expect, it } from "vitest";
import { CANONICAL_PIECE_COLORS } from "@/lib/ifc/viewerColoring";
import { buildModel3DViewModel } from "../model3dTabDerive";

const rows = [
  { element_guid: "g1", piece_mark: "B1", piece_id: "p1", sequence_number: "10" },
  { element_guid: "g2", piece_mark: "B1", sequence_number: "10" },
  { element_guid: "gone", piece_mark: "B2", is_deleted: true },
];
const pieces = [
  {
    id: "p1",
    piece_mark: "B1",
    lifecycle_status: "fabricated",
    on_hold: false,
    is_container: false,
    is_deleted: false,
    deleted_at: null as string | null,
  },
];

function build(overrides = {}) {
  return buildModel3DViewModel({
    projectId: "project-1",
    modelMapping: {
      counts: {
        unmapped: 0,
        rfi_blocked: 0,
        behind_schedule: 0,
        erection_ready: 0,
        fab_ready: 2,
        in_review: 0,
        in_detailing: 0,
      },
      guidsByStatus: {
        unmapped: [],
        rfi_blocked: [],
        behind_schedule: [],
        erection_ready: [],
        fab_ready: ["g1", "g2"],
        in_review: [],
        in_detailing: [],
      },
    },
    modelElementRows: rows,
    canonicalPieces: pieces,
    selectedGuids: ["g1", "g2"],
    colorMode: "fab",
    markFallback: false,
    piecesLoading: false,
    rosterLoading: false,
    ...overrides,
  });
}

describe("buildModel3DViewModel", () => {
  it("keeps inferred display coloring separate from explicit logistics authority", () => {
    const model = build();

    expect(model.colorFor({ guid: "g2" })).toBe(CANONICAL_PIECE_COLORS.fabricated);
    expect(model.canonicalDisplayByGuid.get("g2")?.id).toBe("p1");
    expect(model.canonicalPieceByGuid.has("g2")).toBe(false);
    expect(model.selection.linkedCount).toBe(1);
    expect(model.selection.unlinkedCount).toBe(1);
    expect(model.claims.inferredLinkCount).toBe(1);
  });

  it("fails closed while roster evidence is pending or failed", () => {
    const pending = build({ rosterLoading: true, colorStats: { total: 2, colored: 2 } });
    expect(pending.fabUnavailable).toBe(true);
    expect(pending.colorFor({ guid: "g1" })).toBeNull();
    expect(pending.claims.fabCoverage).toBe("Loading piece and roster status…");
    expect(pending.claims.findPlaceholder).toBe("Loading roster…");

    const failed = build({ rosterError: new Error("roster failed") });
    expect(failed.fabUnavailable).toBe(true);
    expect(failed.claims.evidenceState).toBe("error");
    expect(failed.claims.fabCoverage).toMatch(/Status unavailable/);
  });

  it("derives stable status, sequence, register, and coverage view models", () => {
    const model = build({ colorStats: { total: 2, colored: 1 } });

    expect(model.hasRoster).toBe(true);
    expect(model.sequences).toEqual(["10"]);
    expect(model.sequenceGuids.get("10")).toEqual(["g1", "g2"]);
    expect(model.statusLegend).toEqual([
      expect.objectContaining({ key: "fab_ready", count: 2, guids: ["g1", "g2"] }),
    ]);
    expect(model.registerHref).toContain("PieceRegister");
    expect(model.registerHref).toContain("piece=p1");
    expect(model.claims.fabCoverage).toBe(
      "1 of 2 rendered parts colored. Uncolored parts need status or roster-link review.",
    );
  });
});
