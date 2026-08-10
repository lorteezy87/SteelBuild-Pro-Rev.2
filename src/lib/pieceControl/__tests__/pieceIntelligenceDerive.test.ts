import { describe, expect, it } from "vitest";
import {
  buildPieceDigitalThread,
  derivePieceIntelligence,
} from "../pieceIntelligenceDerive";
import type {
  PieceIntelligenceSnapshot,
  PieceIntelligenceWorkPackage,
} from "../pieceIntelligenceTypes";
import type { PieceRegisterRow } from "../repository";

const now = new Date("2026-08-09T12:00:00Z");

function piece(
  id: string,
  patch: Partial<PieceRegisterRow> = {},
): PieceRegisterRow {
  return {
    id,
    project_id: "prj",
    piece_mark: id,
    normalized_piece_mark: id.toUpperCase(),
    lot_code: "L1",
    parent_piece_id: null,
    quantity: 1,
    profile: "W12x26",
    material_grade: "A992",
    weight_each_lbs: 500,
    weight_total_lbs: 500,
    work_package_id: null,
    lifecycle_status: "not_started",
    current_station: null,
    on_hold: false,
    on_hold_reason: null,
    is_container: false,
    is_deleted: false,
    source_system: "csv",
    external_ref: null,
    metadata: null,
    updated_at: "2026-08-09T12:00:00Z",
    deleted_at: null,
    ...patch,
  };
}

function workPackage(
  id: string,
  scheduledStartDate: string | null,
  label = id,
): PieceIntelligenceWorkPackage {
  return {
    id,
    project_id: "prj",
    wp_number: label,
    sequence_number: label,
    scheduled_start_date: scheduledStartDate,
  };
}

function snapshot(
  patch: Partial<PieceIntelligenceSnapshot> = {},
): PieceIntelligenceSnapshot {
  return {
    pieces: [],
    pieceDrawingSets: [],
    pieceDrawings: [],
    drawings: [],
    drawingSets: [],
    drawingRevisions: [],
    workPackages: [],
    submittals: [],
    sheetResponses: [],
    drawingReviews: [],
    drawingSignoffs: [],
    commentDispositions: [],
    drawingImpacts: [],
    rfis: [],
    pieceEvents: [],
    sourceAvailability: {
      pieceDrawings: "available",
      pieceDrawingSets: "available",
      drawings: "available",
      drawingSets: "available",
      revisions: "available",
      approvals: "available",
    },
    availability: {
      relationships: "available",
      approvals: "available",
      impacts: "available",
      rfis: "available",
      events: "available",
    },
    ...patch,
  };
}

function exposePieces(
  rows: PieceRegisterRow[],
  patch: Partial<PieceIntelligenceSnapshot> = {},
): PieceIntelligenceSnapshot {
  return snapshot({
    pieces: rows,
    pieceDrawingSets: rows.map((row) => ({
      project_id: "prj",
      piece_id: row.id,
      drawing_set_id: "set-1",
    })),
    drawings: [
      {
        id: "drawing-1",
        project_id: "prj",
        drawing_set_id: "set-1",
        sheet_number: "E502",
        title: "Framing",
      },
    ],
    drawingSets: [{ id: "set-1", set_name: "Building 2" }],
    drawingRevisions: [
      {
        id: "revision-1",
        drawing_id: "drawing-1",
        is_current: true,
        archived_at: null,
        revision_code: "4",
        issued_at: "2026-08-08",
      },
    ],
    ...patch,
  });
}

describe("derivePieceIntelligence", () => {
  it("orders all eight attention tiers by the approved lexicographic priority", () => {
    const erected = piece("erected", { lifecycle_status: "erected" });
    const delivered = piece("delivered", { lifecycle_status: "delivered" });
    const shipped = piece("shipped", { lifecycle_status: "shipped" });
    const fabricated = piece("fabricated", { lifecycle_status: "fabricated" });
    const fieldDue = piece("field-due", { work_package_id: "wp-field" });
    const highImpact = piece("high-impact", { lifecycle_status: "released" });
    const planned = piece("planned");
    const exposed = [erected, delivered, shipped, fabricated, highImpact, planned];
    const source = exposePieces([...exposed, fieldDue], {
      pieceDrawingSets: exposed.map((row) => ({
        project_id: "prj",
        piece_id: row.id,
        drawing_set_id: `set-${row.id}`,
      })),
      drawings: [
        ...exposed.map((row) => ({
          id: `drawing-${row.id}`,
          project_id: "prj",
          drawing_set_id: `set-${row.id}`,
          sheet_number: `S-${row.id}`,
          title: row.id,
        })),
        {
          id: "drawing-unlinked",
          project_id: "prj",
          drawing_set_id: "set-unlinked",
          sheet_number: "S-UNLINKED",
          title: "Unlinked",
        },
      ],
      drawingRevisions: [
        ...exposed.map((row) => ({
          id: `revision-${row.id}`,
          drawing_id: `drawing-${row.id}`,
          is_current: true,
          archived_at: null,
          revision_code: "2",
        })),
        {
          id: "revision-unlinked",
          drawing_id: "drawing-unlinked",
          is_current: true,
          archived_at: null,
          revision_code: "3",
        },
      ],
      workPackages: [workPackage("wp-field", "2026-08-12", "WP-5")],
      drawingImpacts: [
        {
          id: "impact-high",
          project_id: "prj",
          drawing_revision_id: "revision-high-impact",
          impact_type: "fabrication",
          status: "open",
          priority: "critical",
          title: "Check connection",
          notes: null,
          assigned_to: null,
          due_date: null,
          resolved_at: null,
          created_at: "2026-08-07T12:00:00Z",
          sheet_number: null,
          sheet_title: null,
          revision_code: null,
        },
      ],
    });

    const model = derivePieceIntelligence(source, now);

    expect(model.attention.map((row) => row.priorityTier)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(model.attention.map((row) => row.reason)).toEqual([
      "Revision exposure after erection",
      "Revision exposure after delivery",
      "Revision exposure after shipment",
      "Revision exposure during fabrication",
      "Field need is due within 10 days",
      "Critical or high impact remains open",
      "Planned piece has unresolved revision exposure",
      "Explicit drawing relationship required",
    ]);
  });

  it("sorts equal-tier rows by valid field date, work package, natural mark, and natural lot", () => {
    const rows = [
      piece("date-first", { piece_mark: "Z1", work_package_id: "wp-9" }),
      piece("wp-2-row", { piece_mark: "Z1", work_package_id: "wp-2" }),
      piece("mark-2", { piece_mark: "B2", work_package_id: "wp-10" }),
      piece("mark-10", { piece_mark: "B10", work_package_id: "wp-10" }),
      piece("lot-2", { piece_mark: "C1", lot_code: "L2", work_package_id: "wp-10" }),
      piece("lot-10", { piece_mark: "C1", lot_code: "L10", work_package_id: "wp-10" }),
    ];
    const source = exposePieces(rows, {
      workPackages: [
        workPackage("wp-9", "2026-09-01", "WP9"),
        workPackage("wp-2", "2026-09-02", "WP2"),
        workPackage("wp-10", "2026-09-02", "WP10"),
      ],
    });

    expect(derivePieceIntelligence(source, now).attention.map((row) => row.pieceId)).toEqual([
      "date-first",
      "wp-2-row",
      "mark-2",
      "mark-10",
      "lot-2",
      "lot-10",
    ]);
  });

  it("uses an assigned work-package scheduled_start_date as field need", () => {
    const source = exposePieces([
      piece("p1", { work_package_id: "wp-1" }),
    ], {
      workPackages: [workPackage("wp-1", "2026-08-12", "WP-1")],
    });

    const [row] = derivePieceIntelligence(source, now).attention;

    expect(row.fieldNeededDate).toBe("2026-08-12");
    expect(row.fieldRisk).toBe(true);
    expect(row.reason).toMatch(/field need/i);
  });

  it.each([null, "not-a-date", "2026-02-30"])(
    "does not infer field urgency from %s",
    (scheduledStartDate) => {
      const source = exposePieces([
        piece("p1", { work_package_id: "wp-1" }),
      ], {
        workPackages: [workPackage("wp-1", scheduledStartDate, "WP-1")],
      });

      const [row] = derivePieceIntelligence(source, now).attention;

      expect(row.priorityTier).toBe(7);
      expect(row.fieldNeededDate).toBeNull();
      expect(row.fieldRisk).toBe(false);
    },
  );

  it("deduplicates piece quantities across revisions for command metrics", () => {
    const held = piece("held", {
      quantity: 2,
      on_hold: true,
      work_package_id: "wp-1",
    });
    const remaining = piece("remaining", {
      quantity: 4,
      work_package_id: "wp-1",
    });
    const source = exposePieces([held, remaining], {
      drawings: [
        { id: "drawing-1", project_id: "prj", drawing_set_id: "set-1", sheet_number: "S1" },
        { id: "drawing-2", project_id: "prj", drawing_set_id: "set-1", sheet_number: "S2" },
      ],
      drawingRevisions: [
        { id: "revision-1", drawing_id: "drawing-1", is_current: true, archived_at: null, revision_code: "1" },
        { id: "revision-2", drawing_id: "drawing-2", is_current: true, archived_at: null, revision_code: "2" },
      ],
      workPackages: [workPackage("wp-1", "2026-08-12", "WP-1")],
    });

    const model = derivePieceIntelligence(source, now);

    expect(model.revisions).toHaveLength(2);
    expect(model.metrics.affectedPieces).toBe(6);
    expect(model.metrics.blockedPieces).toBe(2);
    expect(model.metrics.fieldRiskPieces).toBe(6);
  });

  it("uses the canonical release evaluator for the earliest assigned work package", () => {
    const source = exposePieces([
      piece("later", { work_package_id: "wp-10" }),
      piece("next", { work_package_id: "wp-2" }),
    ], {
      workPackages: [
        workPackage("wp-10", "2026-09-10", "WP10"),
        workPackage("wp-2", "2026-09-02", "WP2"),
      ],
    });

    expect(derivePieceIntelligence(source, now).metrics.nextRelease).toEqual({
      workPackageId: "wp-2",
      label: "WP2",
      isReady: false,
      blockerCount: 1,
      pieceCount: 1,
    });
  });

  it("keeps an unlinked current revision link-required across exposure, attention, and model verification", () => {
    const source = snapshot({
      drawings: [
        {
          id: "drawing-1",
          project_id: "prj",
          drawing_set_id: "set-1",
          sheet_number: "S1",
        },
      ],
      drawingRevisions: [
        {
          id: "revision-1",
          drawing_id: "drawing-1",
          is_current: true,
          archived_at: null,
          revision_code: "2",
        },
      ],
    });

    const model = derivePieceIntelligence(source, now);

    expect(model.revisions[0].verification).toBe("link_required");
    expect(model.attention).toContainEqual(expect.objectContaining({
      priorityTier: 8,
      revisionId: "revision-1",
      reason: "Explicit drawing relationship required",
    }));
    expect(model.verification).toBe("link_required");
  });

  it("gives link-required precedence over partial optional-source availability", () => {
    const source = snapshot({
      drawings: [{ id: "drawing-1", project_id: "prj", sheet_number: "S1" }],
      drawingRevisions: [
        { id: "revision-1", drawing_id: "drawing-1", is_current: true, archived_at: null },
      ],
      availability: {
        relationships: "available",
        approvals: "available",
        impacts: "unavailable",
        rfis: "available",
        events: "available",
      },
    });

    const model = derivePieceIntelligence(source, now);

    expect(model.verification).toBe("link_required");
    expect(model.unavailableSourceWarnings).toEqual([
      { source: "impacts", reason: null },
    ]);
  });

  it("reports partial optional sources even when there are no current revisions", () => {
    const model = derivePieceIntelligence(snapshot({
      availability: {
        relationships: "available",
        approvals: "unavailable",
        impacts: "available",
        rfis: "unavailable",
        events: "unavailable",
      },
    }), now);

    expect(model.verification).toBe("partial");
    expect(model.unavailableSourceWarnings.map(({ source }) => source)).toEqual([
      "approvals",
      "rfis",
      "events",
    ]);
  });

  it("distinguishes canonical holds, severe impacts, and exact linked-RFI fab holds", () => {
    const held = piece("held", { lifecycle_status: "released", on_hold: true });
    const impacted = piece("impacted", { lifecycle_status: "released" });
    const rfiHeld = piece("rfi-held", { lifecycle_status: "released" });
    const rows = [held, impacted, rfiHeld];
    const source = exposePieces(rows, {
      pieceDrawingSets: rows.map((row) => ({
        project_id: "prj",
        piece_id: row.id,
        drawing_set_id: `set-${row.id}`,
      })),
      drawings: rows.map((row) => ({
        id: `drawing-${row.id}`,
        project_id: "prj",
        drawing_set_id: `set-${row.id}`,
        sheet_number: `S-${row.id}`,
        linked_rfi_ids: row.id === "rfi-held" ? "RFI #22" : null,
      })),
      drawingRevisions: rows
        .filter((row) => row.id !== "rfi-held")
        .map((row) => ({
          id: `revision-${row.id}`,
          drawing_id: `drawing-${row.id}`,
          is_current: true,
          archived_at: null,
        })),
      drawingImpacts: [
        {
          id: "impact-high",
          project_id: "prj",
          drawing_revision_id: "revision-impacted",
          impact_type: "fabrication",
          status: "open",
          priority: "high",
          title: "Connection review",
          notes: null,
          assigned_to: null,
          due_date: null,
          resolved_at: null,
          created_at: "2026-08-09T12:00:00Z",
          sheet_number: null,
          sheet_title: null,
          revision_code: null,
        },
      ],
      rfis: [
        {
          id: "rfi-22",
          project_id: "prj",
          rfi_number: "RFI-22",
          status: "Open",
          fab_hold: true,
          work_package_id: null,
        },
      ],
    });

    const reasons = new Map(
      derivePieceIntelligence(source, now).attention.map((row) => [row.pieceId, row.reason]),
    );

    expect(reasons.get("held")).toBe("Canonical piece hold is active");
    expect(reasons.get("impacted")).toBe("Critical or high impact remains open");
    expect(reasons.get("rfi-held")).toBe("Linked RFI fabrication hold is active");
  });
});

describe("buildPieceDigitalThread", () => {
  it("builds the five sections and labels an unlinked CO record without inventing cost", () => {
    const p1 = piece("p1", {
      piece_mark: "B12",
      lot_code: "L2",
      quantity: 3,
      work_package_id: "wp-1",
      lifecycle_status: "in_fabrication",
      current_station: "fit",
      on_hold: true,
      on_hold_reason: "Await revised detail",
    });
    const source = exposePieces([p1], {
      workPackages: [workPackage("wp-1", "2026-08-14", "WP-1")],
      drawingImpacts: [
        {
          id: "impact-co",
          project_id: "prj",
          drawing_revision_id: "revision-1",
          impact_type: "change_order",
          status: "open",
          priority: "high",
          title: "Connection revision",
          notes: null,
          assigned_to: null,
          due_date: null,
          resolved_at: null,
          created_at: "2026-08-09T12:00:00Z",
          sheet_number: null,
          sheet_title: null,
          revision_code: null,
        },
      ],
      rfis: [
        { id: "rfi-1", project_id: "prj", rfi_number: "RFI-22", status: "Open", work_package_id: "wp-1" },
      ],
      pieceEvents: [
        { id: "event-old", project_id: "prj", piece_id: "p1", event_type: "released", created_at: "2026-08-08T12:00:00Z" },
        { id: "event-new", project_id: "prj", piece_id: "p1", event_type: "station_advanced", reason: "Fit complete", created_at: "2026-08-09T12:00:00Z" },
      ],
    });

    const thread = buildPieceDigitalThread("p1", source);

    expect(thread).not.toBeNull();
    expect(Object.keys(thread ?? {})).toEqual([
      "pieceId",
      "identity",
      "modelAndDrawing",
      "commercial",
      "productionAndLogistics",
      "history",
    ]);
    expect(thread?.identity.markAndLot).toBe("B12 · L2");
    expect(thread?.commercial.facts).toContainEqual({
      label: "Change exposure",
      value: "Change impact recorded",
    });
    expect(thread?.commercial.facts).toContainEqual({
      label: "Change order",
      value: "CO record not linked",
    });
    expect(thread?.commercial.facts.some((fact) => fact.label === "Cost exposure")).toBe(false);
    expect(thread?.productionAndLogistics.facts).toContainEqual({
      label: "Field need",
      value: "2026-08-14",
    });
    expect(thread?.history.facts.map(({ value }) => value)).toEqual([
      "Station advanced · Fit complete",
      "Change impact · Connection revision",
      "Released",
    ]);
  });

  it("preserves unavailable optional-source state by section", () => {
    const source = exposePieces([piece("p1")], {
      availability: {
        relationships: "available",
        approvals: "unavailable",
        impacts: "unavailable",
        rfis: "available",
        events: "unavailable",
      },
    });

    const thread = buildPieceDigitalThread("p1", source);

    expect(thread?.identity.availability).toBe("available");
    expect(thread?.modelAndDrawing.availability).toBe("unavailable");
    expect(thread?.commercial.availability).toBe("unavailable");
    expect(thread?.productionAndLogistics.availability).toBe("available");
    expect(thread?.history.availability).toBe("unavailable");
  });

  it("fails closed on stale relationship evidence when relationships are unavailable", () => {
    const p1 = piece("p1", {
      piece_mark: "B12",
      lifecycle_status: "released",
    });
    const source = exposePieces([p1], {
      drawings: [
        {
          id: "drawing-1",
          project_id: "prj",
          drawing_set_id: "set-1",
          sheet_number: "E502",
          linked_rfi_ids: "RFI-22",
        },
      ],
      rfis: [
        {
          id: "rfi-22",
          project_id: "prj",
          rfi_number: "RFI-22",
          status: "Open",
          fab_hold: true,
        },
      ],
      availability: {
        relationships: "unavailable",
        approvals: "available",
        impacts: "available",
        rfis: "available",
        events: "available",
      },
    });

    const model = derivePieceIntelligence(source, now);
    const thread = buildPieceDigitalThread("p1", source);

    expect(model.attention.some(({ reason }) =>
      reason === "Linked RFI fabrication hold is active"
    )).toBe(false);
    expect(thread?.identity.facts).toContainEqual({ label: "Piece mark", value: "B12" });
    expect(thread?.modelAndDrawing.availability).toBe("unavailable");
    expect(thread?.modelAndDrawing.facts).toEqual([]);
    expect(thread?.commercial.availability).toBe("unavailable");
    expect(thread?.commercial.facts.some(({ label }) => label === "Open RFIs")).toBe(false);
  });

  it("includes only RFIs explicitly linked by exact drawings, never work-package co-membership", () => {
    const source = exposePieces([
      piece("p1", { work_package_id: "wp-1" }),
    ], {
      drawings: [
        {
          id: "drawing-1",
          project_id: "prj",
          drawing_set_id: "set-1",
          sheet_number: "E502",
          linked_rfi_ids: "RFI #22",
        },
      ],
      rfis: [
        { id: "linked", project_id: "prj", rfi_number: "RFI-22", status: "Open", work_package_id: "wp-other" },
        { id: "same-wp", project_id: "prj", rfi_number: "RFI-99", status: "Open", work_package_id: "wp-1" },
      ],
    });

    const openRfis = buildPieceDigitalThread("p1", source)?.commercial.facts
      .find(({ label }) => label === "Open RFIs");

    expect(openRfis).toEqual({ label: "Open RFIs", value: "RFI-22" });
  });

  it("does not infer an RFI relationship from matching null work-package IDs", () => {
    const source = exposePieces([piece("p1")], {
      drawings: [
        {
          id: "drawing-1",
          project_id: "prj",
          drawing_set_id: "set-1",
          sheet_number: "E502",
          linked_rfi_ids: null,
        },
      ],
      rfis: [
        { id: "unassigned", project_id: "prj", rfi_number: "RFI-77", status: "Open", work_package_id: null },
      ],
    });

    expect(buildPieceDigitalThread("p1", source)?.commercial.facts).toContainEqual({
      label: "Open RFIs",
      value: "No linked open RFI",
    });
  });

  it("omits dependent negative facts when approval, impact, RFI, or event sources are unavailable", () => {
    const source = exposePieces([piece("p1")], {
      drawingImpacts: [
        {
          id: "stale-impact",
          project_id: "prj",
          drawing_revision_id: "revision-1",
          impact_type: "change_order",
          status: "open",
          priority: "high",
          title: "Untrusted stale row",
          notes: null,
          assigned_to: null,
          due_date: null,
          resolved_at: null,
          created_at: "2026-08-09T12:00:00Z",
          sheet_number: null,
          sheet_title: null,
          revision_code: null,
        },
      ],
      rfis: [
        { id: "stale-rfi", project_id: "prj", rfi_number: "RFI-22", status: "Open" },
      ],
      pieceEvents: [
        { id: "stale-event", project_id: "prj", piece_id: "p1", event_type: "erected", created_at: "2026-08-09T12:00:00Z" },
      ],
      availability: {
        relationships: "available",
        approvals: "unavailable",
        impacts: "unavailable",
        rfis: "unavailable",
        events: "unavailable",
      },
    });

    const thread = buildPieceDigitalThread("p1", source);

    expect(thread?.modelAndDrawing.facts.some(({ label }) => label === "Approval evidence")).toBe(false);
    expect(thread?.modelAndDrawing.facts.some(({ label }) => label === "Submittal status")).toBe(false);
    expect(thread?.commercial.facts.some(({ label }) => label === "Open RFIs")).toBe(false);
    expect(thread?.commercial.facts.some(({ label }) => label === "Change exposure")).toBe(false);
    expect(thread?.commercial.facts.some(({ label }) => label === "Change order")).toBe(false);
    expect(thread?.history.facts).toEqual([]);
  });

  it("exposes release, fabrication, shipment/load, delivery, and erection milestones honestly", () => {
    const source = exposePieces([
      piece("p1", { lifecycle_status: "delivered", current_station: "paint" }),
    ], {
      pieceEvents: [
        { id: "released", project_id: "prj", piece_id: "p1", event_type: "released_for_fabrication", created_at: "2026-08-01T12:00:00Z" },
        { id: "loaded", project_id: "prj", piece_id: "p1", event_type: "loaded", created_at: "2026-08-05T12:00:00Z" },
        { id: "delivered", project_id: "prj", piece_id: "p1", event_type: "delivered", created_at: "2026-08-07T12:00:00Z" },
      ],
    });

    const facts = buildPieceDigitalThread("p1", source)?.productionAndLogistics.facts;

    expect(facts).toContainEqual({ label: "Release", value: "Recorded 2026-08-01" });
    expect(facts).toContainEqual({ label: "Fabrication completion", value: "Confirmed by lifecycle" });
    expect(facts).toContainEqual({ label: "Shipment / load", value: "Recorded 2026-08-05" });
    expect(facts).toContainEqual({ label: "Delivery", value: "Recorded 2026-08-07" });
    expect(facts).toContainEqual({ label: "Erection", value: "Not recorded" });
  });

  it("includes linked submittal and sheet-response approval authority", () => {
    const source = exposePieces([piece("p1")], {
      submittals: [
        {
          id: "submittal-1",
          status: "Under Review",
          ball_in_court: "EOR",
          drawing_set_ids: ["set-1"],
          current_round_id: "round-1",
        },
      ],
      sheetResponses: [
        {
          drawing_id: "drawing-1",
          submittal_round_id: "round-1",
          response_status: "No Exception",
        },
      ],
    });

    const facts = buildPieceDigitalThread("p1", source)?.modelAndDrawing.facts;

    expect(facts).toContainEqual({ label: "Submittal status", value: "Under Review" });
    expect(facts).toContainEqual({ label: "Sheet response", value: "E502: No Exception" });
    expect(facts).toContainEqual({ label: "Approval evidence", value: "Recorded" });
  });

  it("returns null for a missing or non-actionable piece", () => {
    const container = piece("container", { is_container: true });
    const leaf = piece("leaf", { parent_piece_id: "parent" });
    const parent = piece("parent");
    const source = snapshot({ pieces: [container, parent, leaf] });

    expect(buildPieceDigitalThread("missing", source)).toBeNull();
    expect(buildPieceDigitalThread("container", source)).toBeNull();
    expect(buildPieceDigitalThread("parent", source)).toBeNull();
    expect(buildPieceDigitalThread("leaf", source)?.pieceId).toBe("leaf");
  });
});
