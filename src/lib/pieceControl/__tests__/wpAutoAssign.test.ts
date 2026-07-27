import { describe, expect, it, vi } from "vitest";
import {
  applyWorkPackageAutoAssign,
  normalizeSequenceKey,
  planWorkPackageAutoAssign,
  scoreImportNameMatch,
} from "../wpAutoAssign";

describe("normalizeSequenceKey", () => {
  it("normalizes WP prefixes and leading zeros", () => {
    expect(normalizeSequenceKey("WP-004")).toBe("4");
    expect(normalizeSequenceKey("wp 004")).toBe("4");
    expect(normalizeSequenceKey("004")).toBe("4");
    expect(normalizeSequenceKey("SEQ-A")).toBe("seqa");
  });
});

describe("scoreImportNameMatch", () => {
  it("matches Tekla/EPM filenames to WP names", () => {
    const source = "060926-25443-ala aj seminary building anchor bolt ifc epm";
    expect(
      scoreImportNameMatch(source, { id: "wp", name: "Anchor Bolts" }),
    ).toBeGreaterThan(0);
    expect(
      scoreImportNameMatch(source, { id: "wp", name: "Ladder" }),
    ).toBe(0);
  });

  it("matches partial main steel to Main & Misc. Steel", () => {
    const source =
      "062226-25443-ala aj seminary building partial main steel ifc epm";
    expect(
      scoreImportNameMatch(source, {
        id: "wp",
        name: "Main & Misc. Steel",
      }),
    ).toBeGreaterThan(0);
  });
});

describe("planWorkPackageAutoAssign", () => {
  const wps = [
    {
      id: "wp-1",
      wp_number: "WP-001",
      name: "Foundations",
      sequence_number: "1",
      area: "Area A",
    },
    {
      id: "wp-2",
      wp_number: "WP-002",
      name: "Ladder",
      sequence_number: "2",
      area: "Area B",
    },
  ];

  it("matches by sequence number", () => {
    const plan = planWorkPackageAutoAssign(
      [
        {
          id: "p1",
          mark: "B1",
          sequence_number: "WP-002",
          erection_area: null,
          work_package_id: null,
        },
      ],
      wps,
    );
    expect(plan.assignments).toHaveLength(1);
    expect(plan.assignments[0]).toMatchObject({
      pieceId: "p1",
      workPackageId: "wp-2",
      matchReason: "sequence",
    });
    expect(plan.byWorkPackage["wp-2"]).toEqual(["p1"]);
  });

  it("prefers import filename over shared sequence numbers", () => {
    const plan = planWorkPackageAutoAssign(
      [
        {
          id: "p1",
          mark: "L1",
          sequence_number: "1",
          work_package_id: null,
          metadata: {
            import_source_name:
              "041326_ALA Buckeye_Ladder_&_Railing_IFA_EPM.xml",
          },
        },
      ],
      [
        {
          id: "wp-embeds",
          wp_number: "WP-001",
          name: "Embeds & Lintels",
        },
        {
          id: "wp-ladder",
          wp_number: "WP-004",
          name: "Ladder",
        },
      ],
    );
    expect(plan.assignments[0]).toMatchObject({
      workPackageId: "wp-ladder",
      matchReason: "import_name",
    });
  });

  it("matches AJ Seminary-style import sources to WP names", () => {
    const seminaryWps = [
      { id: "wp-7", wp_number: "WP-007", name: "Anchor Bolts" },
      { id: "wp-8", wp_number: "WP-008", name: "Main & Misc. Steel" },
      { id: "wp-9", wp_number: "WP-009", name: "Brick Veneer Angle" },
      { id: "wp-10", wp_number: "WP-010", name: "Ladder" },
    ];
    const plan = planWorkPackageAutoAssign(
      [
        {
          id: "a",
          mark: "AB1",
          sequence_number: "1",
          work_package_id: null,
          metadata: {
            import_source_name:
              "060926-25443-ALA AJ Seminary Building_Anchor Bolt_IFC-EPM.xml",
          },
        },
        {
          id: "b",
          mark: "MS1",
          sequence_number: "1",
          work_package_id: null,
          metadata: {
            import_source_name:
              "062226-25443-ALA AJ Seminary Building_Partial Main Steel_IFC-EPM.xml",
          },
        },
        {
          id: "c",
          mark: "BV1",
          sequence_number: "1",
          work_package_id: null,
          metadata: {
            import_source_name:
              "062926-25443-ALA AJ Seminary Building_Brick Veneer Angle_IFC-EPM.xml",
          },
        },
      ],
      seminaryWps,
    );
    expect(plan.assignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pieceId: "a", workPackageId: "wp-7" }),
        expect.objectContaining({ pieceId: "b", workPackageId: "wp-8" }),
        expect.objectContaining({ pieceId: "c", workPackageId: "wp-9" }),
      ]),
    );
    expect(plan.assignments.every((row) => row.matchReason === "import_name")).toBe(
      true,
    );
  });

  it("matches by erection area when sequence is absent", () => {
    const plan = planWorkPackageAutoAssign(
      [
        {
          id: "p1",
          mark: "B1",
          sequence_number: null,
          erection_area: "Area A",
          work_package_id: null,
        },
      ],
      wps,
    );
    expect(plan.assignments[0]).toMatchObject({
      workPackageId: "wp-1",
      matchReason: "area",
    });
  });

  it("prefers sequence+area over sequence-only when both hit", () => {
    const plan = planWorkPackageAutoAssign(
      [
        {
          id: "p1",
          mark: "B1",
          sequence_number: "1",
          erection_area: "Area A",
          work_package_id: null,
        },
      ],
      wps,
    );
    expect(plan.assignments[0].matchReason).toBe("sequence_and_area");
  });

  it("skips already-assigned pieces unless reassignExisting", () => {
    const pieces = [
      {
        id: "p1",
        mark: "B1",
        sequence_number: "2",
        work_package_id: "wp-1",
      },
    ];
    const skipPlan = planWorkPackageAutoAssign(pieces, wps);
    expect(skipPlan.assignments).toHaveLength(0);
    expect(skipPlan.skipped[0].reason).toBe("already_assigned");

    const reassignPlan = planWorkPackageAutoAssign(pieces, wps, {
      reassignExisting: true,
    });
    expect(reassignPlan.assignments[0]).toMatchObject({
      workPackageId: "wp-2",
      fromWorkPackageId: "wp-1",
    });
  });

  it("fails closed on ambiguous area matches", () => {
    const plan = planWorkPackageAutoAssign(
      [
        {
          id: "p1",
          mark: "B1",
          sequence_number: null,
          erection_area: "Shared",
          work_package_id: null,
        },
      ],
      [
        { id: "wp-a", wp_number: "WP-A", area: "Shared" },
        { id: "wp-b", wp_number: "WP-B", area: "Shared" },
      ],
    );
    expect(plan.assignments).toHaveLength(0);
    expect(plan.skipped[0]).toMatchObject({ reason: "ambiguous" });
  });

  it("skips pieces with no sequence, area, or import source", () => {
    const plan = planWorkPackageAutoAssign(
      [{ id: "p1", mark: "B1", work_package_id: null }],
      wps,
    );
    expect(plan.skipped[0].reason).toBe("no_signals");
  });
});

describe("applyWorkPackageAutoAssign", () => {
  it("calls assign once per work package and aggregates counts", async () => {
    const assign = vi.fn().mockResolvedValue(undefined);
    const plan = planWorkPackageAutoAssign(
      [
        { id: "p1", mark: "A", sequence_number: "1", work_package_id: null },
        { id: "p2", mark: "B", sequence_number: "1", work_package_id: null },
        { id: "p3", mark: "C", sequence_number: "2", work_package_id: null },
      ],
      [
        { id: "wp-1", wp_number: "WP-001", sequence_number: "1" },
        { id: "wp-2", wp_number: "WP-002", sequence_number: "2" },
      ],
    );

    const result = await applyWorkPackageAutoAssign(plan, assign);
    expect(result.assignedCount).toBe(3);
    expect(result.workPackageCount).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(assign).toHaveBeenCalledWith("wp-1", ["p1", "p2"]);
    expect(assign).toHaveBeenCalledWith("wp-2", ["p3"]);
  });
});
