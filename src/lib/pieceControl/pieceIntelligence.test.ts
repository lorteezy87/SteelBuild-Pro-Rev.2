import { describe, expect, it } from "vitest";

import {
  PieceIntelligenceCoreUnavailableError,
  derivePieceAttention,
  derivePieceIntelligenceSummary,
  deriveRevisionExposure,
  type PieceDrawingRow,
  type PieceDrawingSetRow,
  type PieceIntelligenceDrawing,
  type PieceIntelligenceImpact,
  type PieceIntelligencePiece,
  type PieceIntelligenceRevision,
  type PieceIntelligenceSnapshot,
  type PieceIntelligenceWorkPackage,
  type SourceAvailability,
} from "@/lib/pieceControl/pieceIntelligence";

function available<T>(rows: readonly T[] = []): SourceAvailability<T> {
  return { status: "available", rows };
}

function fixture(
  overrides: Partial<PieceIntelligenceSnapshot> = {},
): PieceIntelligenceSnapshot {
  return {
    projectId: "project-1",
    pieces: available(),
    pieceDrawingSets: available(),
    pieceDrawings: available(),
    drawings: available(),
    drawingSets: available(),
    revisions: available(),
    workPackages: available(),
    impacts: available(),
    drawingLinks: available(),
    rfis: available(),
    submittals: available(),
    sheetResponses: available(),
    drawingReviews: available(),
    drawingSignoffs: available(),
    commentDispositions: available(),
    fabReleases: available(),
    stationCompletions: available(),
    pieceEvents: available(),
    ...overrides,
  };
}

function piece(
  id: string,
  overrides: Partial<PieceIntelligencePiece> = {},
): PieceIntelligencePiece {
  return {
    id,
    project_id: "project-1",
    piece_mark: id.toUpperCase(),
    normalized_piece_mark: id.toUpperCase(),
    lot_code: "L1",
    parent_piece_id: null,
    quantity: 1,
    profile: null,
    material_grade: null,
    weight_each_lbs: null,
    weight_total_lbs: null,
    work_package_id: null,
    lifecycle_status: "not_started",
    current_station: null,
    on_hold: false,
    is_container: false,
    is_deleted: false,
    source_system: null,
    external_ref: null,
    metadata: null,
    updated_at: "2026-08-09T12:00:00Z",
    deleted_at: null,
    ...overrides,
  };
}

function drawing(
  id: string,
  drawingSetId = `${id}-set`,
): PieceIntelligenceDrawing {
  return {
    id,
    project_id: "project-1",
    drawing_set_id: drawingSetId,
    sheet_number: id.toUpperCase(),
    title: `${id} title`,
    is_deleted: false,
    deleted_at: null,
    is_superseded: false,
  };
}

function currentChangeRevision(
  id: string,
  drawingId: string,
  overrides: Partial<PieceIntelligenceRevision> = {},
): PieceIntelligenceRevision {
  return {
    id,
    project_id: "project-1",
    drawing_id: drawingId,
    revision_code: "1",
    version_number: 2,
    supersedes_revision_id: `${id}-prior`,
    is_current: true,
    archived_at: null,
    issued_at: "2026-08-08",
    received_at: "2026-08-08",
    ...overrides,
  };
}

function setLink(
  linkedPiece: PieceIntelligencePiece,
  drawingSetId: string,
): PieceDrawingSetRow {
  return {
    project_id: linkedPiece.project_id,
    piece_id: linkedPiece.id,
    drawing_set_id: drawingSetId,
  };
}

function sheetLink(
  linkedPiece: PieceIntelligencePiece,
  drawingId: string,
): PieceDrawingRow {
  return {
    project_id: linkedPiece.project_id,
    piece_id: linkedPiece.id,
    drawing_id: drawingId,
  };
}

function workPackage(
  id: string,
  scheduledStartDate: string | null,
  wpNumber = id,
): PieceIntelligenceWorkPackage {
  return {
    id,
    project_id: "project-1",
    wp_number: wpNumber,
    name: id,
    sequence_number: null,
    scheduled_start_date: scheduledStartDate,
    is_deleted: false,
    deleted_at: null,
  };
}

describe("deriveRevisionExposure", () => {
  it("matches only actionable leaves through exact drawing-set and sheet links", () => {
    // Catches replacing explicit relationships with parent/container or hint matching.
    const container = piece("container", { is_container: true });
    const splitParent = piece("split-parent");
    const childA = piece("child-a", { parent_piece_id: splitParent.id });
    const childB = piece("child-b", { parent_piece_id: splitParent.id });
    const legacyLeaf = piece("legacy-leaf");
    const exposures = deriveRevisionExposure(
      fixture({
        pieces: available([
          container,
          splitParent,
          childA,
          childB,
          legacyLeaf,
        ]),
        pieceDrawingSets: available([
          setLink(childA, "set-1"),
          setLink(childB, "set-1"),
        ]),
        pieceDrawings: available([
          sheetLink(childA, "dwg-1"),
          sheetLink(legacyLeaf, "dwg-1"),
        ]),
        drawings: available([drawing("dwg-1", "set-1")]),
        revisions: available([currentChangeRevision("rev-1", "dwg-1")]),
      }),
    );

    expect(exposures[0].affectedPieces.map((row) => row.id)).toEqual([
      childA.id,
      childB.id,
      legacyLeaf.id,
    ]);
    expect(exposures[0].verification).toBe("verified");
    expect(exposures[0].affectedPieces).not.toContainEqual(container);
  });

  it("excludes initial, non-current, and archived revisions", () => {
    // Catches treating every drawing revision as a current change.
    const leaf = piece("piece-1");
    expect(
      deriveRevisionExposure(
        fixture({
          pieces: available([leaf]),
          pieceDrawingSets: available([setLink(leaf, "set-1")]),
          drawings: available([drawing("dwg-1", "set-1")]),
          revisions: available([
            currentChangeRevision("initial", "dwg-1", {
              version_number: 1,
              supersedes_revision_id: null,
            }),
            currentChangeRevision("not-current", "dwg-1", {
              is_current: false,
            }),
            currentChangeRevision("archived", "dwg-1", {
              archived_at: "2026-08-09T14:00:00Z",
            }),
          ]),
        }),
      ),
    ).toEqual([]);
  });

  it("deduplicates a lot linked through both set and sheet", () => {
    // Catches double counting the same canonical lot through two exact paths.
    const leaf = piece("piece-1", { quantity: 4 });
    const [exposure] = deriveRevisionExposure(
      fixture({
        pieces: available([leaf]),
        pieceDrawingSets: available([setLink(leaf, "set-1")]),
        pieceDrawings: available([sheetLink(leaf, "dwg-1")]),
        drawings: available([drawing("dwg-1", "set-1")]),
        revisions: available([currentChangeRevision("rev-1", "dwg-1")]),
      }),
    );

    expect(exposure.affectedPieces).toEqual([leaf]);
    expect(exposure.affectedPieceQuantity).toBe(4);
  });

  it("ignores mark and sequence hints and requests an explicit relationship", () => {
    // Catches heuristic matching leaking into authoritative affected counts.
    const hinted = piece("piece-1", {
      piece_mark: "B12",
      sequence_number: "SEQ-1",
      metadata: { drawing_id: "dwg-1", drawing_set_id: "set-1" },
    });
    const [exposure] = deriveRevisionExposure(
      fixture({
        pieces: available([hinted]),
        drawings: available([drawing("dwg-1", "set-1")]),
        revisions: available([currentChangeRevision("rev-1", "dwg-1")]),
      }),
    );

    expect(exposure.affectedPieces).toEqual([]);
    expect(exposure.affectedPieceQuantity).toBe(0);
    expect(exposure.verification).toBe("link_required");
  });

  it("marks exact exposure partial when optional impact evidence is unavailable", () => {
    // Catches unavailable optional enrichment being presented as fully verified.
    const leaf = piece("piece-1");
    const [exposure] = deriveRevisionExposure(
      fixture({
        pieces: available([leaf]),
        pieceDrawingSets: available([setLink(leaf, "set-1")]),
        drawings: available([drawing("dwg-1", "set-1")]),
        revisions: available([currentChangeRevision("rev-1", "dwg-1")]),
        impacts: { status: "unavailable", rows: [], reason: "permission denied" },
      }),
    );

    expect(exposure.verification).toBe("partial");
  });

  it("throws a named error when a core source is unavailable", () => {
    // Catches failed core data being silently converted into a zero-impact claim.
    expect(() =>
      deriveRevisionExposure(
        fixture({
          pieces: { status: "unavailable", rows: [], reason: "network down" },
        }),
      ),
    ).toThrowError(PieceIntelligenceCoreUnavailableError);
  });

  it("groups affected quantities into deterministic lifecycle buckets", () => {
    // Catches lots or lifecycle aliases being counted in the wrong exposure group.
    const pieces = [
      piece("planned", { quantity: 2, lifecycle_status: "not_started" }),
      piece("released", { quantity: 3, lifecycle_status: "released" }),
      piece("fabricating", { quantity: 4, lifecycle_status: "in_fabrication" }),
      piece("fabricated", { quantity: 5, lifecycle_status: "fabricated" }),
      piece("shipped", { quantity: 6, lifecycle_status: "shipped" }),
      piece("delivered", { quantity: 7, lifecycle_status: "delivered" }),
      piece("erected", { quantity: 8, lifecycle_status: "erected" }),
    ];
    const [exposure] = deriveRevisionExposure(
      fixture({
        pieces: available(pieces),
        pieceDrawingSets: available(
          pieces.map((row) => setLink(row, "set-1")),
        ),
        drawings: available([drawing("dwg-1", "set-1")]),
        revisions: available([currentChangeRevision("rev-1", "dwg-1")]),
      }),
    );

    expect(exposure.lifecycleExposure).toEqual({
      plannedOrReleased: 5,
      fabrication: 9,
      shipped: 6,
      delivered: 7,
      erected: 8,
    });
  });
});

describe("derivePieceAttention", () => {
  it("orders risks by the approved lexicographic priority", () => {
    // Catches a lower downstream risk outranking a later-lifecycle exposure.
    const erected = piece("erected", {
      lifecycle_status: "erected",
      work_package_id: "wp-late",
    });
    const delivered = piece("delivered", { lifecycle_status: "delivered" });
    const shipped = piece("shipped", { lifecycle_status: "shipped" });
    const fabricated = piece("fabricated", { lifecycle_status: "fabricated" });
    const fieldDue = piece("field-due", {
      lifecycle_status: "released",
      work_package_id: "wp-field",
    });
    const highImpact = piece("high-impact", { lifecycle_status: "released" });
    const planned = piece("planned", { lifecycle_status: "not_started" });
    const linked = [erected, delivered, shipped, fabricated, highImpact, planned];
    const drawings = linked.map((row) => drawing(`dwg-${row.id}`, `set-${row.id}`));
    drawings.push(drawing("dwg-unlinked", "set-unlinked"));
    const revisions = drawings.map((row) =>
      currentChangeRevision(`rev-${row.id}`, row.id),
    );
    const impacts: PieceIntelligenceImpact[] = [
      {
        id: "impact-1",
        project_id: "project-1",
        drawing_revision_id: "rev-dwg-high-impact",
        impact_type: "fabrication",
        priority: "critical",
        status: "open",
        title: "Critical connection review",
        assigned_to: null,
        due_date: null,
        resolved_at: null,
      },
    ];
    const snapshot = fixture({
      pieces: available([...linked, fieldDue]),
      pieceDrawingSets: available(
        linked.map((row) => setLink(row, `set-${row.id}`)),
      ),
      drawings: available(drawings),
      revisions: available(revisions),
      impacts: available(impacts),
      workPackages: available([
        workPackage("wp-late", "2026-08-09"),
        workPackage("wp-field", "2026-08-15"),
      ]),
    });
    const exposures = deriveRevisionExposure(snapshot);

    expect(
      derivePieceAttention(snapshot, exposures, "2026-08-09").map(
        (row) => row.leadingReason,
      ),
    ).toEqual([
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

  it("sorts ties by date, work package, natural piece mark, and natural lot", () => {
    // Catches unstable or lexical B10-before-B2 ordering inside a priority tier.
    const rows = [
      piece("date-first", {
        piece_mark: "Z1",
        work_package_id: "wp-9",
        lot_code: "L1",
      }),
      piece("wp-2-row", {
        piece_mark: "Z1",
        work_package_id: "wp-2",
        lot_code: "L1",
      }),
      piece("mark-2", {
        piece_mark: "B2",
        work_package_id: "wp-10",
        lot_code: "L1",
      }),
      piece("mark-10", {
        piece_mark: "B10",
        work_package_id: "wp-10",
        lot_code: "L1",
      }),
      piece("lot-2", {
        piece_mark: "C1",
        work_package_id: "wp-10",
        lot_code: "L2",
      }),
      piece("lot-10", {
        piece_mark: "C1",
        work_package_id: "wp-10",
        lot_code: "L10",
      }),
    ];
    const snapshot = fixture({
      pieces: available(rows),
      pieceDrawingSets: available(rows.map((row) => setLink(row, "set-1"))),
      drawings: available([drawing("dwg-1", "set-1")]),
      revisions: available([currentChangeRevision("rev-1", "dwg-1")]),
      workPackages: available([
        workPackage("wp-9", "2026-09-01", "WP9"),
        workPackage("wp-2", "2026-09-02", "WP2"),
        workPackage("wp-10", "2026-09-02", "WP10"),
      ]),
    });

    expect(
      derivePieceAttention(
        snapshot,
        deriveRevisionExposure(snapshot),
        "2026-08-09",
      ).map((row) => row.piece?.id),
    ).toEqual([
      "date-first",
      "wp-2-row",
      "mark-2",
      "mark-10",
      "lot-2",
      "lot-10",
    ]);
  });

  it("does not add field urgency when scheduled_start_date is missing", () => {
    // Catches unknown field dates being treated as overdue or due soon.
    const row = piece("piece-1", { work_package_id: "wp-1" });
    const snapshot = fixture({
      pieces: available([row]),
      workPackages: available([workPackage("wp-1", null)]),
    });

    expect(derivePieceAttention(snapshot, [], "2026-08-09")).toEqual([]);
  });

  it("does not add field urgency when scheduled_start_date is malformed", () => {
    // Catches malformed source dates sorting as real dates or becoming urgent.
    const row = piece("piece-1", { work_package_id: "wp-1" });
    const snapshot = fixture({
      pieces: available([row]),
      workPackages: available([workPackage("wp-1", "not-a-date")]),
    });

    expect(derivePieceAttention(snapshot, [], "2026-08-09")).toEqual([]);
  });
});

describe("derivePieceIntelligenceSummary", () => {
  it("counts canonical piece quantities once across overview metrics", () => {
    // Catches lot-row counting or duplicate exposure paths understating/overstating metrics.
    const held = piece("held", { quantity: 2, on_hold: true });
    const exposed = piece("exposed", { quantity: 3 });
    const fieldDue = piece("field-due", {
      quantity: 1,
      work_package_id: "wp-field",
    });
    const rows = [held, exposed, fieldDue];
    const summary = derivePieceIntelligenceSummary(
      fixture({
        pieces: available(rows),
        pieceDrawingSets: available(rows.map((row) => setLink(row, "set-1"))),
        drawings: available([drawing("dwg-1", "set-1")]),
        revisions: available([currentChangeRevision("rev-1", "dwg-1")]),
        workPackages: available([
          workPackage("wp-field", "2026-08-12", "WP1"),
        ]),
      }),
      "2026-08-09",
    );

    expect(summary.metrics.affectedPieces).toBe(6);
    expect(summary.metrics.blockedOrHeldPieces).toBe(2);
    expect(summary.metrics.fieldNeededWithExposure).toBe(1);
    expect(summary.exposures[0].affectedPieces).toHaveLength(3);
  });

  it("marks the summary partial when impacts are unavailable for linked exposure", () => {
    // Catches unavailable impact evidence being rendered as a verified zero blocker count.
    const held = piece("held", { quantity: 2, on_hold: true });
    const summary = derivePieceIntelligenceSummary(
      fixture({
        pieces: available([held]),
        pieceDrawingSets: available([setLink(held, "set-1")]),
        drawings: available([drawing("dwg-1", "set-1")]),
        revisions: available([currentChangeRevision("rev-1", "dwg-1")]),
        impacts: {
          status: "unavailable",
          rows: [],
          reason: "permission denied",
        },
      }),
      "2026-08-09",
    );

    expect(summary.metrics.blockedOrHeldPieces).toBe(2);
    expect(summary.verification).toBe("partial");
    expect(summary.unavailableSources).toEqual(["impacts"]);
    expect(summary.unavailableSourceWarnings).toEqual([
      { source: "impacts", reason: "permission denied" },
    ]);
  });

  it("marks the summary partial when impacts are unavailable without current revisions", () => {
    // Catches an empty revision list disguising unavailable blocker evidence as safe.
    const held = piece("held", { quantity: 2, on_hold: true });
    const summary = derivePieceIntelligenceSummary(
      fixture({
        pieces: available([held]),
        impacts: {
          status: "unavailable",
          rows: [],
          reason: "network down",
        },
      }),
      "2026-08-09",
    );

    expect(summary.exposures).toEqual([]);
    expect(summary.metrics.blockedOrHeldPieces).toBe(2);
    expect(summary.verification).toBe("partial");
    expect(summary.unavailableSources).toEqual(["impacts"]);
    expect(summary.unavailableSourceWarnings).toEqual([
      { source: "impacts", reason: "network down" },
    ]);
  });

  it("deduplicates quantity metrics across two revisions exposing the same lots", () => {
    // Catches cross-revision summing that counts the same canonical lots twice.
    const held = piece("held", {
      quantity: 2,
      on_hold: true,
      work_package_id: "wp-1",
    });
    const remaining = piece("remaining", {
      quantity: 4,
      work_package_id: "wp-1",
    });
    const lots = [held, remaining];
    const summary = derivePieceIntelligenceSummary(
      fixture({
        pieces: available(lots),
        pieceDrawingSets: available(lots.map((row) => setLink(row, "set-1"))),
        drawings: available([
          drawing("dwg-1", "set-1"),
          drawing("dwg-2", "set-1"),
        ]),
        revisions: available([
          currentChangeRevision("rev-1", "dwg-1"),
          currentChangeRevision("rev-2", "dwg-2"),
        ]),
        workPackages: available([
          workPackage("wp-1", "2026-08-12", "WP1"),
        ]),
      }),
      "2026-08-09",
    );

    expect(summary.exposures).toHaveLength(2);
    expect(summary.metrics.affectedPieces).toBe(6);
    expect(summary.metrics.blockedOrHeldPieces).toBe(2);
    expect(summary.metrics.fieldNeededWithExposure).toBe(6);
    expect(
      summary.metrics.nextWorkPackageReleaseReadiness?.exposedPieceQuantity,
    ).toBe(6);
  });
});
