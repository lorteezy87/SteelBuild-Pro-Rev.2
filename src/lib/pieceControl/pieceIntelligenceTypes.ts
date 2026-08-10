import type { DrawingImpactRow } from "@/hooks/useDrawingImpacts";
import type { PieceRegisterRow } from "./repository";
import type {
  DrawingRevisionEvidence,
  ReadinessDrawing,
  ReadinessPieceDrawing,
  ReadinessPieceDrawingSet,
  ReadinessWorkPackage,
} from "./readiness";
import type { PieceRelationshipSnapshot } from "./relationshipsRepository";

export type SourceAvailability = "available" | "unavailable";
export type ImpactVerification = "verified" | "partial" | "link_required";
export type ExposureLifecycle = "not_started" | "released" | "in_fabrication" | "fabricated" | "shipped" | "delivered" | "erected";

export interface PieceIntelligenceWorkPackage extends ReadinessWorkPackage {
  scheduled_start_date?: string | null;
}

export interface PieceIntelligenceRevision extends DrawingRevisionEvidence {
  issued_at?: string | null;
  received_at?: string | null;
}

export interface PieceIntelligenceRfi {
  id: string;
  project_id: string;
  rfi_number?: string | null;
  status?: string | null;
  fab_hold?: boolean | null;
  work_package_id?: string | null;
}

export interface PieceIntelligenceEvent {
  id: string;
  project_id: string;
  piece_id: string;
  event_type: string;
  previous_state?: Record<string, unknown> | null;
  next_state?: Record<string, unknown> | null;
  reason?: string | null;
  created_at: string;
}

export interface RevisionExposureRow {
  revisionId: string;
  drawingId: string;
  drawingSetId: string | null;
  sheetNumber: string;
  revisionCode: string;
  affectedPieceIds: string[];
  affectedWorkPackageIds: string[];
  verification: ImpactVerification;
  exposure: Record<ExposureLifecycle, number>;
  heldCount: number;
  openImpactCount: number;
  openRfiCount: number;
}

export interface SourceUnavailableWarning {
  source: keyof PieceIntelligenceSnapshot["availability"];
  reason: string | null;
}

export interface PieceAttentionRow {
  pieceId: string;
  revisionId: string | null;
  priorityTier: number;
  markAndLot: string;
  workPackageLabel: string;
  lifecycle: ExposureLifecycle;
  lifecycleLabel: string;
  fieldNeededDate: string | null;
  fieldRisk: boolean;
  onHold: boolean;
  fabBlocked: boolean;
  reason: string;
}

export interface NextReleaseReadiness {
  workPackageId: string;
  label: string;
  isReady: boolean;
  blockerCount: number;
  pieceCount: number;
}

export interface PieceIntelligenceModel {
  verification: ImpactVerification;
  unavailableSourceWarnings: SourceUnavailableWarning[];
  revisions: RevisionExposureRow[];
  attention: PieceAttentionRow[];
  metrics: {
    affectedPieces: number;
    blockedPieces: number;
    fieldRiskPieces: number;
    linkRequiredRevisions: number;
    nextRelease: NextReleaseReadiness | null;
  };
}

export interface PieceThreadFact {
  label: string;
  value: string;
}

export interface PieceThreadSection {
  availability: SourceAvailability;
  facts: PieceThreadFact[];
}

export interface PieceDigitalThreadModel {
  pieceId: string;
  identity: PieceThreadSection & { markAndLot: string };
  modelAndDrawing: PieceThreadSection;
  commercial: PieceThreadSection;
  productionAndLogistics: PieceThreadSection;
  history: PieceThreadSection;
}
export interface PieceIntelligenceSnapshot extends Omit<PieceRelationshipSnapshot, "workPackages" | "drawingRevisions"> {
  pieces: PieceRegisterRow[];
  pieceDrawings: ReadinessPieceDrawing[];
  pieceDrawingSets: ReadinessPieceDrawingSet[];
  drawings: ReadinessDrawing[];
  workPackages: PieceIntelligenceWorkPackage[];
  drawingRevisions: PieceIntelligenceRevision[];
  drawingImpacts: DrawingImpactRow[];
  rfis: PieceIntelligenceRfi[];
  pieceEvents: PieceIntelligenceEvent[];
  availability: {
    relationships: SourceAvailability;
    approvals: SourceAvailability;
    impacts: SourceAvailability;
    rfis: SourceAvailability;
    events: SourceAvailability;
  };
}
