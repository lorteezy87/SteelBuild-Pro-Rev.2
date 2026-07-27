import { isGoverningDrawingReleaseReady } from "./drawingReleaseReady";

export interface ReadinessWorkPackage {
  id: string;
  project_id: string;
  wp_number?: string | null;
  name?: string | null;
  is_deleted?: boolean | null;
  deleted_at?: string | null;
}

export interface ReadinessPiece {
  id: string;
  project_id: string;
  work_package_id: string | null;
  parent_piece_id: string | null;
  piece_mark: string;
  lot_code: string;
  on_hold: boolean;
  is_container?: boolean;
  deleted_at?: string | null;
}

export interface ReadinessPieceDrawing {
  piece_id: string;
  drawing_id: string;
  project_id: string;
}

export interface ReadinessDrawing {
  id: string;
  project_id: string;
  drawing_set_id?: string | null;
  sheet_number?: string | null;
  title?: string | null;
  /** Legacy sheet-stage enum (7 values). Prefer submittal-derived stage. */
  stage?: string | null;
  set_approval_status?: string | null;
  is_deleted?: boolean | null;
  deleted_at?: string | null;
  is_superseded?: boolean | null;
}

export interface DrawingSetEvidence {
  id: string;
  set_approval_status?: string | null;
  is_deleted?: boolean | null;
  deleted_at?: string | null;
}

export interface SubmittalEvidence {
  id: string;
  status: string;
  ball_in_court?: string | null;
  drawing_set_ids?: string[] | null;
  current_round_id?: string | null;
  submitted_date?: string | null;
  required_date?: string | null;
  returned_date?: string | null;
  updated_at?: string | null;
  round_number?: number | null;
  is_deleted?: boolean | null;
  deleted_at?: string | null;
}

export interface SheetResponseEvidence {
  drawing_id?: string | null;
  submittal_round_id: string;
  response_status: string;
  is_deleted?: boolean | null;
  deleted_at?: string | null;
}

export interface DrawingRevisionEvidence {
  id: string;
  drawing_id: string;
  is_current: boolean;
  archived_at?: string | null;
  revision_code?: string | null;
}

export interface DrawingReviewEvidence {
  drawing_revision_id: string;
  decision: string;
}

export interface DrawingSignoffEvidence {
  drawing_id: string;
  drawing_revision_id?: string | null;
  stamp_type: string;
  is_voided?: boolean | null;
}

export interface ReadinessEvidence {
  drawingSets?: DrawingSetEvidence[];
  submittals?: SubmittalEvidence[];
  sheetResponses?: SheetResponseEvidence[];
  drawingRevisions?: DrawingRevisionEvidence[];
  drawingReviews?: DrawingReviewEvidence[];
  drawingSignoffs?: DrawingSignoffEvidence[];
}

export interface WorkPackageReadiness {
  workPackageId: string;
  hasCanonicalPieceScope: boolean;
  pieceCount: number;
  heldPieceCount: number;
  linkedDrawingCount: number;
  approvedDrawingCount: number;
  unapprovedDrawingCount: number;
  missingDrawingCount: number;
  blockers: string[];
  materialState: "not yet evaluated in this release.";
  isReady: boolean;
}

/**
 * Piece-control "approved for fab" predicate (Slice 6).
 * Delegates to IFC/Released readiness — bare Approved/AAN (OFS/BFA) is not enough.
 */
export function isDrawingApproved(
  drawing: ReadinessDrawing,
  evidence: ReadinessEvidence = {},
): boolean {
  return isGoverningDrawingReleaseReady(drawing, evidence).ready;
}

export function evaluateWorkPackageReadiness(
  workPackages: ReadinessWorkPackage[],
  pieces: ReadinessPiece[],
  pieceDrawings: ReadinessPieceDrawing[],
  drawings: ReadinessDrawing[],
  evidence: ReadinessEvidence = {},
): WorkPackageReadiness[] {
  const activePieces = pieces.filter((piece) => !piece.deleted_at);
  const containerIds = new Set(
    activePieces.map((piece) => piece.parent_piece_id).filter((id): id is string => Boolean(id)),
  );
  const activeDrawings = new Map(
    drawings
      .filter((drawing) => !drawing.is_deleted && !drawing.deleted_at && !drawing.is_superseded)
      .map((drawing) => [drawing.id, drawing]),
  );

  return workPackages
    .filter((workPackage) => !workPackage.is_deleted && !workPackage.deleted_at)
    .map((workPackage) => {
      const scope = activePieces.filter((piece) =>
        piece.work_package_id === workPackage.id &&
        !piece.is_container &&
        !containerIds.has(piece.id)
      );
      const scopeIds = new Set(scope.map((piece) => piece.id));
      const relations = pieceDrawings.filter((relation) => scopeIds.has(relation.piece_id));
      const linkedDrawingIds = new Set(relations.map((relation) => relation.drawing_id));
      const linkedDrawings = [...linkedDrawingIds]
        .map((drawingId) => activeDrawings.get(drawingId))
        .filter((drawing): drawing is ReadinessDrawing => Boolean(drawing));
      const missingDrawingCount = [...linkedDrawingIds]
        .filter((drawingId) => !activeDrawings.has(drawingId))
        .length;
      const approvedDrawingCount = linkedDrawings
        .filter((drawing) => isDrawingApproved(drawing, evidence))
        .length;
      const unapprovedDrawingCount = linkedDrawings.length - approvedDrawingCount;
      const heldPieceCount = scope.filter((piece) => piece.on_hold).length;
      const blockers: string[] = [];

      if (scope.length === 0) {
        blockers.push("No canonical pieces assigned to this work package.");
      } else if (linkedDrawingIds.size === 0) {
        blockers.push("No shop drawings linked.");
      }
      if (missingDrawingCount > 0) {
        blockers.push(`${missingDrawingCount} linked drawing ${missingDrawingCount === 1 ? "record is" : "records are"} missing or inactive.`);
      }
      if (unapprovedDrawingCount > 0) {
        blockers.push(
          `${unapprovedDrawingCount} linked shop ${unapprovedDrawingCount === 1 ? "drawing is" : "drawings are"} not IFC / Released for fabrication.`,
        );
      }
      if (heldPieceCount > 0) {
        blockers.push(`${heldPieceCount} scoped ${heldPieceCount === 1 ? "piece is" : "pieces are"} on hold.`);
      }

      return {
        workPackageId: workPackage.id,
        hasCanonicalPieceScope: scope.length > 0,
        pieceCount: scope.length,
        heldPieceCount,
        linkedDrawingCount: linkedDrawingIds.size,
        approvedDrawingCount,
        unapprovedDrawingCount,
        missingDrawingCount,
        blockers,
        materialState: "not yet evaluated in this release.",
        isReady: blockers.length === 0,
      };
    });
}
