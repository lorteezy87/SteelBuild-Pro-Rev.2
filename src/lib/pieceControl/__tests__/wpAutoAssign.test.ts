import { describe, expect, it, vi } from "vitest";
import {
  applyWorkPackageAutoAssign,
  normalizeSequenceKey,
  planWorkPackageAutoAssign,
} from "../wpAutoAssign";

describe("normalizeSequenceKey", () => {
  it("normalizes WP prefixes and leading zeros", () => {
    expect(normalizeSequenceKey("WP-004")).toBe("4");
    expect(normalizeSequenceKey("wp 004")).toBe("4");
    expect(normalizeSequenceKey("004")).toBe("4");
    expect(normalizeSequenceKey("SEQ-A")).toBe("seqa");
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

  it("skips pieces with no sequence or area signals", () => {
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
