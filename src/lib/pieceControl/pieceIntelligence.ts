import { selectActionableLeafPieces } from "@/lib/pieceControl/canonicalRollups";
import type { PieceRegisterRow } from "@/lib/pieceControl/repository";

export type VerificationState = "verified" | "partial" | "link_required";

export type SourceAvailability<T> =
  | { status: "available"; rows: readonly T[] }
  | { status: "unavailable"; rows: readonly []; reason: string };

export type PieceIntelligencePiece = PieceRegisterRow;

export interface PieceDrawingSetRow {
  project_id: string;
  piece_id: string;
  drawing_set_id: string;
  is_deleted?: boolean | null;
  deleted_at?: string | null;
}

export interface PieceDrawingRow {
  project_id: string;
  piece_id: string;
  drawing_id: string;
  is_deleted?: boolean | null;
  deleted_at?: string | null;
}

export interface PieceIntelligenceDrawing {
  id: string;
  project_id: string;
  drawing_set_id: string | null;
  sheet_number: string | null;
  title: string | null;
  stage?: string | null;
  set_approval_status?: string | null;
  is_deleted?: boolean | null;
  deleted_at?: string | null;
  is_superseded?: boolean | null;
}

export interface PieceIntelligenceDrawingSet {
  id: string;
  project_id?: string;
  set_name?: string | null;
  set_approval_status?: string | null;
  is_deleted?: boolean | null;
  deleted_at?: string | null;
}

export interface PieceIntelligenceRevision {
  id: string;
  project_id: string;
  drawing_id: string;
  revision_code: string;
  version_number: number;
  supersedes_revision_id: string | null;
  is_current: boolean;
  archived_at: string | null;
  issued_at?: string | null;
  received_at?: string | null;
  revision_name?: string | null;
  revision_reason?: string | null;
  release_status?: string | null;
}

export interface PieceIntelligenceWorkPackage {
  id: string;
  project_id: string;
  wp_number?: string | null;
  name?: string | null;
  sequence_number?: string | null;
  area?: string | null;
  scheduled_start_date?: string | null;
  is_deleted?: boolean | null;
  deleted_at?: string | null;
}

export interface PieceIntelligenceImpact {
  id: string;
  project_id: string;
  drawing_revision_id: string;
  impact_type: string;
  priority: string;
  status: string;
  title: string;
  assigned_to: string | null;
  due_date: string | null;
  resolved_at: string | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface PieceIntelligenceDrawingLink {
  id: string;
  project_id: string;
  drawing_id: string;
  drawing_revision_id: string;
  linked_record_type: string;
  linked_record_id: string;
  is_confirmed?: boolean;
  removed_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface PieceIntelligenceRfi {
  id: string;
  project_id: string;
  rfi_number?: string | number | null;
  subject?: string | null;
  status?: string | null;
  is_deleted?: boolean | null;
  deleted_at?: string | null;
}

export interface PieceIntelligenceSubmittal {
  id: string;
  project_id: string;
  status: string;
  drawing_set_ids?: readonly string[] | null;
  current_round_id?: string | null;
  is_deleted?: boolean | null;
  deleted_at?: string | null;
  [key: string]: unknown;
}

export interface PieceIntelligenceSheetResponse {
  id?: string;
  project_id: string;
  drawing_id?: string | null;
  submittal_round_id: string;
  response_status: string;
  is_deleted?: boolean | null;
  deleted_at?: string | null;
}

export interface PieceIntelligenceDrawingReview {
  id?: string;
  project_id: string;
  drawing_revision_id: string;
  decision: string;
}

export interface PieceIntelligenceDrawingSignoff {
  id?: string;
  project_id: string;
  drawing_id: string;
  drawing_revision_id?: string | null;
  stamp_type: string;
  is_voided?: boolean | null;
}

export interface PieceIntelligenceCommentDisposition {
  id: string;
  project_id: string;
  status: string;
  is_required?: boolean | null;
  is_deleted?: boolean | null;
  related_piece_ids?: readonly string[] | null;
  drawing_id?: string | null;
  submittal_id?: string | null;
  comment_text?: string | null;
  comment_number?: string | number | null;
  location?: string | null;
}

export interface PieceIntelligenceFabRelease {
  id: string;
  project_id: string;
  work_package_id: string;
  release_number?: string | null;
  released_at?: string | null;
  canonical_release?: boolean | null;
  status?: string | null;
  is_exception?: boolean | null;
  is_deleted?: boolean | null;
}

export interface PieceIntelligenceStationCompletion {
  id: string;
  project_id: string;
  piece_id: string;
  station_key: string;
  completed_at?: string | null;
  sort_order?: number | null;
  [key: string]: unknown;
}

export interface PieceIntelligencePieceEvent {
  id: string;
  project_id: string;
  piece_id: string;
  event_type: string;
  created_at: string;
  reason?: string | null;
  previous_state?: Record<string, unknown> | null;
  next_state?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

export interface PieceIntelligenceSnapshot {
  projectId: string;
  pieces: SourceAvailability<PieceIntelligencePiece>;
  pieceDrawingSets: SourceAvailability<PieceDrawingSetRow>;
  pieceDrawings: SourceAvailability<PieceDrawingRow>;
  drawings: SourceAvailability<PieceIntelligenceDrawing>;
  drawingSets: SourceAvailability<PieceIntelligenceDrawingSet>;
  revisions: SourceAvailability<PieceIntelligenceRevision>;
  workPackages: SourceAvailability<PieceIntelligenceWorkPackage>;
  impacts: SourceAvailability<PieceIntelligenceImpact>;
  drawingLinks: SourceAvailability<PieceIntelligenceDrawingLink>;
  rfis: SourceAvailability<PieceIntelligenceRfi>;
  submittals: SourceAvailability<PieceIntelligenceSubmittal>;
  sheetResponses: SourceAvailability<PieceIntelligenceSheetResponse>;
  drawingReviews: SourceAvailability<PieceIntelligenceDrawingReview>;
  drawingSignoffs: SourceAvailability<PieceIntelligenceDrawingSignoff>;
  commentDispositions: SourceAvailability<PieceIntelligenceCommentDisposition>;
  fabReleases: SourceAvailability<PieceIntelligenceFabRelease>;
  stationCompletions: SourceAvailability<PieceIntelligenceStationCompletion>;
  pieceEvents: SourceAvailability<PieceIntelligencePieceEvent>;
}

export interface LifecycleExposure {
  plannedOrReleased: number;
  fabrication: number;
  shipped: number;
  delivered: number;
  erected: number;
}

export interface RevisionExposure {
  revisionId: string;
  revision: PieceIntelligenceRevision;
  drawing: PieceIntelligenceDrawing | null;
  drawingSet: PieceIntelligenceDrawingSet | null;
  affectedPieces: readonly PieceIntelligencePiece[];
  affectedPieceQuantity: number;
  workPackages: readonly PieceIntelligenceWorkPackage[];
  sequences: readonly string[];
  lifecycleExposure: LifecycleExposure;
  heldPieceQuantity: number;
  openImpacts: readonly PieceIntelligenceImpact[];
  openRfis: readonly PieceIntelligenceRfi[];
  assigneeIds: readonly string[];
  commercialSignal: boolean;
  verification: VerificationState;
  unavailableSources: readonly string[];
}

export type PieceAttentionReason =
  | "Revision exposure after erection"
  | "Revision exposure after delivery"
  | "Revision exposure after shipment"
  | "Revision exposure during fabrication"
  | "Field need is due within 10 days"
  | "Critical or high impact remains open"
  | "Planned piece has unresolved revision exposure"
  | "Explicit drawing relationship required";

export interface PieceAttentionRisk {
  id: string;
  priorityTier: number;
  leadingReason: PieceAttentionReason;
  piece: PieceIntelligencePiece | null;
  revision: PieceIntelligenceRevision | null;
  exposures: readonly RevisionExposure[];
  workPackage: PieceIntelligenceWorkPackage | null;
  fieldNeededDate: string | null;
}

export interface NextWorkPackageReleaseReadinessMetric {
  workPackageId: string;
  label: string;
  scheduledStartDate: string | null;
  pieceQuantity: number;
  heldPieceQuantity: number;
  exposedPieceQuantity: number;
}

export interface PieceIntelligenceMetrics {
  affectedPieces: number;
  blockedOrHeldPieces: number;
  nextWorkPackageReleaseReadiness: NextWorkPackageReleaseReadinessMetric | null;
  fieldNeededWithExposure: number;
}

export interface PieceIntelligenceSummary {
  verification: Exclude<VerificationState, "link_required">;
  unavailableSources: readonly string[];
  unavailableSourceWarnings: readonly SourceUnavailableWarning[];
  metrics: PieceIntelligenceMetrics;
  exposures: readonly RevisionExposure[];
  attention: readonly PieceAttentionRisk[];
}

export interface SourceUnavailableWarning {
  source: string;
  reason: string;
}

export class PieceIntelligenceCoreUnavailableError extends Error {
  readonly source: string;
  readonly reason: string;

  constructor(source: string, reason: string) {
    super(`Piece intelligence core source unavailable: ${source} (${reason})`);
    this.name = "PieceIntelligenceCoreUnavailableError";
    this.source = source;
    this.reason = reason;
  }
}

const CORE_SOURCE_KEYS = [
  "pieces",
  "pieceDrawingSets",
  "pieceDrawings",
  "drawings",
  "drawingSets",
  "revisions",
  "workPackages",
] as const;

const OPTIONAL_SOURCE_KEYS = [
  "impacts",
  "drawingLinks",
  "rfis",
  "submittals",
  "sheetResponses",
  "drawingReviews",
  "drawingSignoffs",
  "commentDispositions",
  "fabReleases",
  "stationCompletions",
  "pieceEvents",
] as const;

const naturalCollator = new Intl.Collator("en-US", {
  numeric: true,
  sensitivity: "base",
});

function assertCoreAvailable(snapshot: PieceIntelligenceSnapshot): void {
  for (const source of CORE_SOURCE_KEYS) {
    const availability = snapshot[source];
    if (availability.status === "unavailable") {
      throw new PieceIntelligenceCoreUnavailableError(
        source,
        availability.reason,
      );
    }
  }
}

function rows<T>(source: SourceAvailability<T>): readonly T[] {
  return source.rows;
}

function isActive(row: {
  is_deleted?: boolean | null;
  deleted_at?: string | null;
}): boolean {
  return row.is_deleted !== true && !row.deleted_at;
}

function pieceQuantity(piece: PieceIntelligencePiece): number {
  const quantity = Number(piece.quantity);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
}

function uniqueById<T extends { id: string }>(values: readonly T[]): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value.id)) return false;
    seen.add(value.id);
    return true;
  });
}

function optionalUnavailableSources(
  snapshot: PieceIntelligenceSnapshot,
): string[] {
  return optionalUnavailableSourceWarnings(snapshot).map(
    (warning) => warning.source,
  );
}

function optionalUnavailableSourceWarnings(
  snapshot: PieceIntelligenceSnapshot,
): SourceUnavailableWarning[] {
  return OPTIONAL_SOURCE_KEYS.flatMap((source) => {
    const availability = snapshot[source];
    return availability.status === "unavailable"
      ? [{ source, reason: availability.reason }]
      : [];
  });
}

function lifecycleExposureFor(
  pieces: readonly PieceIntelligencePiece[],
): LifecycleExposure {
  const lifecycle: LifecycleExposure = {
    plannedOrReleased: 0,
    fabrication: 0,
    shipped: 0,
    delivered: 0,
    erected: 0,
  };
  for (const piece of pieces) {
    const quantity = pieceQuantity(piece);
    if (
      piece.lifecycle_status === "not_started" ||
      piece.lifecycle_status === "released"
    ) {
      lifecycle.plannedOrReleased += quantity;
    } else if (
      piece.lifecycle_status === "in_fabrication" ||
      piece.lifecycle_status === "fabricated"
    ) {
      lifecycle.fabrication += quantity;
    } else if (piece.lifecycle_status === "shipped") {
      lifecycle.shipped += quantity;
    } else if (piece.lifecycle_status === "delivered") {
      lifecycle.delivered += quantity;
    } else if (piece.lifecycle_status === "erected") {
      lifecycle.erected += quantity;
    }
  }
  return lifecycle;
}

function isOpenStatus(status: string | null | undefined): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  return normalized !== "resolved" && normalized !== "closed";
}

function isCurrentChangeRevision(
  revision: PieceIntelligenceRevision,
): boolean {
  return (
    revision.is_current === true &&
    !revision.archived_at &&
    (Boolean(revision.supersedes_revision_id) || revision.version_number > 1)
  );
}

function compareRevisions(
  left: PieceIntelligenceRevision,
  right: PieceIntelligenceRevision,
  drawingsById: ReadonlyMap<string, PieceIntelligenceDrawing>,
): number {
  const leftDrawing = drawingsById.get(left.drawing_id);
  const rightDrawing = drawingsById.get(right.drawing_id);
  return (
    naturalCollator.compare(
      leftDrawing?.sheet_number ?? left.drawing_id,
      rightDrawing?.sheet_number ?? right.drawing_id,
    ) ||
    naturalCollator.compare(left.revision_code, right.revision_code) ||
    naturalCollator.compare(left.id, right.id)
  );
}

export function deriveRevisionExposure(
  snapshot: PieceIntelligenceSnapshot,
): readonly RevisionExposure[] {
  assertCoreAvailable(snapshot);

  const actionablePieces = selectActionableLeafPieces([
    ...rows(snapshot.pieces),
  ]);
  const drawings = rows(snapshot.drawings).filter(isActive).filter(
    (drawing) => !drawing.is_superseded,
  );
  const drawingsById = new Map(drawings.map((drawing) => [drawing.id, drawing]));
  const drawingSetsById = new Map(
    rows(snapshot.drawingSets)
      .filter(isActive)
      .map((drawingSet) => [drawingSet.id, drawingSet]),
  );
  const workPackagesById = new Map(
    rows(snapshot.workPackages)
      .filter(isActive)
      .map((workPackage) => [workPackage.id, workPackage]),
  );
  const setLinks = rows(snapshot.pieceDrawingSets).filter(isActive);
  const sheetLinks = rows(snapshot.pieceDrawings).filter(isActive);
  const openImpacts = rows(snapshot.impacts).filter((impact) =>
    isOpenStatus(impact.status),
  );
  const activeDrawingLinks = rows(snapshot.drawingLinks).filter(
    (link) => !link.removed_at,
  );
  const activeRfisById = new Map(
    rows(snapshot.rfis)
      .filter(isActive)
      .filter((rfi) => isOpenStatus(rfi.status))
      .map((rfi) => [rfi.id, rfi]),
  );
  const unavailableSources = optionalUnavailableSources(snapshot);

  return rows(snapshot.revisions)
    .filter(isCurrentChangeRevision)
    .sort((left, right) => compareRevisions(left, right, drawingsById))
    .map((revision): RevisionExposure => {
      const drawing = drawingsById.get(revision.drawing_id) ?? null;
      const drawingSetId = drawing?.drawing_set_id ?? null;
      const exactPieceIds = new Set<string>();

      if (drawingSetId) {
        for (const link of setLinks) {
          if (link.drawing_set_id === drawingSetId) {
            exactPieceIds.add(link.piece_id);
          }
        }
      }
      for (const link of sheetLinks) {
        if (link.drawing_id === revision.drawing_id) {
          exactPieceIds.add(link.piece_id);
        }
      }

      const affectedPieces = actionablePieces.filter((piece) =>
        exactPieceIds.has(piece.id),
      );
      const workPackages = uniqueById(
        affectedPieces
          .map((piece) =>
            piece.work_package_id
              ? workPackagesById.get(piece.work_package_id)
              : undefined,
          )
          .filter(
            (workPackage): workPackage is PieceIntelligenceWorkPackage =>
              Boolean(workPackage),
          ),
      ).sort((left, right) =>
        naturalCollator.compare(
          left.wp_number ?? left.name ?? left.id,
          right.wp_number ?? right.name ?? right.id,
        ),
      );
      const sequences = Array.from(
        new Set(
          affectedPieces.flatMap((piece) => {
            const workPackage = piece.work_package_id
              ? workPackagesById.get(piece.work_package_id)
              : undefined;
            return [piece.sequence_number, workPackage?.sequence_number].filter(
              (sequence): sequence is string => Boolean(sequence),
            );
          }),
        ),
      ).sort(naturalCollator.compare);
      const impacts = openImpacts.filter(
        (impact) => impact.drawing_revision_id === revision.id,
      );
      const rfiIds = new Set(
        activeDrawingLinks
          .filter(
            (link) =>
              link.linked_record_type.toLowerCase() === "rfi" &&
              (link.drawing_revision_id === revision.id ||
                link.drawing_id === revision.drawing_id),
          )
          .map((link) => link.linked_record_id),
      );
      const openRfis = [...rfiIds]
        .map((id) => activeRfisById.get(id))
        .filter((rfi): rfi is PieceIntelligenceRfi => Boolean(rfi));

      return {
        revisionId: revision.id,
        revision,
        drawing,
        drawingSet: drawingSetId
          ? (drawingSetsById.get(drawingSetId) ?? null)
          : null,
        affectedPieces,
        affectedPieceQuantity: affectedPieces.reduce(
          (total, piece) => total + pieceQuantity(piece),
          0,
        ),
        workPackages,
        sequences,
        lifecycleExposure: lifecycleExposureFor(affectedPieces),
        heldPieceQuantity: affectedPieces
          .filter((piece) => piece.on_hold)
          .reduce((total, piece) => total + pieceQuantity(piece), 0),
        openImpacts: impacts,
        openRfis,
        assigneeIds: Array.from(
          new Set(
            impacts
              .map((impact) => impact.assigned_to)
              .filter((id): id is string => Boolean(id)),
          ),
        ).sort(naturalCollator.compare),
        commercialSignal: impacts.some(
          (impact) => impact.impact_type.toLowerCase() === "change_order",
        ),
        verification:
          affectedPieces.length === 0
            ? "link_required"
            : unavailableSources.length > 0
              ? "partial"
              : "verified",
        unavailableSources: [...unavailableSources],
      };
    });
}

function isIsoDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function addUtcDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function fieldNeedIsUrgent(
  fieldNeededDate: string | null | undefined,
  today: string,
): boolean {
  return (
    isIsoDate(fieldNeededDate) &&
    isIsoDate(today) &&
    fieldNeededDate <= addUtcDays(today, 10)
  );
}

function attentionReason(
  piece: PieceIntelligencePiece,
  exposures: readonly RevisionExposure[],
  fieldNeededDate: string | null,
  today: string,
): { tier: number; reason: PieceAttentionReason } | null {
  const exposed = exposures.length > 0;
  if (exposed && piece.lifecycle_status === "erected") {
    return { tier: 1, reason: "Revision exposure after erection" };
  }
  if (exposed && piece.lifecycle_status === "delivered") {
    return { tier: 2, reason: "Revision exposure after delivery" };
  }
  if (exposed && piece.lifecycle_status === "shipped") {
    return { tier: 3, reason: "Revision exposure after shipment" };
  }
  if (
    exposed &&
    (piece.lifecycle_status === "in_fabrication" ||
      piece.lifecycle_status === "fabricated")
  ) {
    return { tier: 4, reason: "Revision exposure during fabrication" };
  }
  if (fieldNeedIsUrgent(fieldNeededDate, today)) {
    return { tier: 5, reason: "Field need is due within 10 days" };
  }
  const unresolvedSevereImpact = exposures.some((exposure) =>
    exposure.openImpacts.some((impact) =>
      ["critical", "high"].includes(impact.priority.toLowerCase()),
    ),
  );
  if (piece.on_hold || unresolvedSevereImpact) {
    return { tier: 6, reason: "Critical or high impact remains open" };
  }
  if (
    exposed &&
    (piece.lifecycle_status === "not_started" ||
      piece.lifecycle_status === "released")
  ) {
    return {
      tier: 7,
      reason: "Planned piece has unresolved revision exposure",
    };
  }
  return null;
}

function compareNullableDates(
  left: string | null,
  right: string | null,
): number {
  const leftKnown = isIsoDate(left);
  const rightKnown = isIsoDate(right);
  if (leftKnown && rightKnown) return left.localeCompare(right);
  if (leftKnown) return -1;
  if (rightKnown) return 1;
  return 0;
}

function attentionSort(
  left: PieceAttentionRisk,
  right: PieceAttentionRisk,
): number {
  return (
    left.priorityTier - right.priorityTier ||
    compareNullableDates(left.fieldNeededDate, right.fieldNeededDate) ||
    naturalCollator.compare(
      left.workPackage?.wp_number ?? left.workPackage?.name ?? "",
      right.workPackage?.wp_number ?? right.workPackage?.name ?? "",
    ) ||
    naturalCollator.compare(
      left.piece?.piece_mark ?? left.revision?.drawing_id ?? "",
      right.piece?.piece_mark ?? right.revision?.drawing_id ?? "",
    ) ||
    naturalCollator.compare(
      left.piece?.lot_code ?? left.revision?.revision_code ?? "",
      right.piece?.lot_code ?? right.revision?.revision_code ?? "",
    ) ||
    naturalCollator.compare(left.id, right.id)
  );
}

export function derivePieceAttention(
  snapshot: PieceIntelligenceSnapshot,
  exposures: readonly RevisionExposure[],
  today: string,
): readonly PieceAttentionRisk[] {
  assertCoreAvailable(snapshot);
  const workPackagesById = new Map(
    rows(snapshot.workPackages)
      .filter(isActive)
      .map((workPackage) => [workPackage.id, workPackage]),
  );
  const exposuresByPieceId = new Map<string, RevisionExposure[]>();
  for (const exposure of exposures) {
    for (const piece of exposure.affectedPieces) {
      const pieceExposures = exposuresByPieceId.get(piece.id) ?? [];
      pieceExposures.push(exposure);
      exposuresByPieceId.set(piece.id, pieceExposures);
    }
  }

  const risks: PieceAttentionRisk[] = [];
  for (const piece of selectActionableLeafPieces([...rows(snapshot.pieces)])) {
    const pieceExposures = exposuresByPieceId.get(piece.id) ?? [];
    const workPackage = piece.work_package_id
      ? (workPackagesById.get(piece.work_package_id) ?? null)
      : null;
    const fieldNeededDate = isIsoDate(workPackage?.scheduled_start_date)
      ? workPackage.scheduled_start_date
      : null;
    const leading = attentionReason(
      piece,
      pieceExposures,
      fieldNeededDate,
      today,
    );
    if (!leading) continue;
    risks.push({
      id: `piece:${piece.id}`,
      priorityTier: leading.tier,
      leadingReason: leading.reason,
      piece,
      revision: pieceExposures[0]?.revision ?? null,
      exposures: pieceExposures,
      workPackage,
      fieldNeededDate,
    });
  }

  for (const exposure of exposures) {
    if (exposure.verification !== "link_required") continue;
    risks.push({
      id: `revision:${exposure.revision.id}`,
      priorityTier: 8,
      leadingReason: "Explicit drawing relationship required",
      piece: null,
      revision: exposure.revision,
      exposures: [exposure],
      workPackage: null,
      fieldNeededDate: null,
    });
  }

  return risks.sort(attentionSort);
}

function quantityForIds(
  pieces: readonly PieceIntelligencePiece[],
  ids: ReadonlySet<string>,
): number {
  return pieces
    .filter((piece) => ids.has(piece.id))
    .reduce((total, piece) => total + pieceQuantity(piece), 0);
}

function nextWorkPackageMetric(
  pieces: readonly PieceIntelligencePiece[],
  workPackages: readonly PieceIntelligenceWorkPackage[],
  exposedIds: ReadonlySet<string>,
): NextWorkPackageReleaseReadinessMetric | null {
  const activeWorkPackages = workPackages.filter(isActive);
  const candidates = activeWorkPackages
    .map((workPackage) => ({
      workPackage,
      pieces: pieces.filter(
        (piece) =>
          piece.work_package_id === workPackage.id &&
          (piece.lifecycle_status === "not_started" ||
            piece.lifecycle_status === "released"),
      ),
    }))
    .filter((candidate) => candidate.pieces.length > 0)
    .sort(
      (left, right) =>
        compareNullableDates(
          isIsoDate(left.workPackage.scheduled_start_date)
            ? left.workPackage.scheduled_start_date
            : null,
          isIsoDate(right.workPackage.scheduled_start_date)
            ? right.workPackage.scheduled_start_date
            : null,
        ) ||
        naturalCollator.compare(
          left.workPackage.wp_number ?? left.workPackage.name ?? left.workPackage.id,
          right.workPackage.wp_number ?? right.workPackage.name ?? right.workPackage.id,
        ),
    );
  const next = candidates[0];
  if (!next) return null;
  return {
    workPackageId: next.workPackage.id,
    label:
      next.workPackage.wp_number ?? next.workPackage.name ?? next.workPackage.id,
    scheduledStartDate: isIsoDate(next.workPackage.scheduled_start_date)
      ? next.workPackage.scheduled_start_date
      : null,
    pieceQuantity: next.pieces.reduce(
      (total, piece) => total + pieceQuantity(piece),
      0,
    ),
    heldPieceQuantity: next.pieces
      .filter((piece) => piece.on_hold)
      .reduce((total, piece) => total + pieceQuantity(piece), 0),
    exposedPieceQuantity: next.pieces
      .filter((piece) => exposedIds.has(piece.id))
      .reduce((total, piece) => total + pieceQuantity(piece), 0),
  };
}

export function derivePieceIntelligenceSummary(
  snapshot: PieceIntelligenceSnapshot,
  today: string,
): PieceIntelligenceSummary {
  assertCoreAvailable(snapshot);
  const exposures = deriveRevisionExposure(snapshot);
  const attention = derivePieceAttention(snapshot, exposures, today);
  const actionablePieces = selectActionableLeafPieces([
    ...rows(snapshot.pieces),
  ]);
  const exposedIds = new Set(
    exposures.flatMap((exposure) =>
      exposure.affectedPieces.map((piece) => piece.id),
    ),
  );
  const blockedOrHeldIds = new Set(
    actionablePieces
      .filter((piece) => piece.on_hold)
      .map((piece) => piece.id),
  );
  for (const exposure of exposures) {
    if (
      exposure.openImpacts.some(
        (impact) => impact.status.toLowerCase() === "blocked",
      )
    ) {
      for (const piece of exposure.affectedPieces) {
        blockedOrHeldIds.add(piece.id);
      }
    }
  }
  const workPackagesById = new Map(
    rows(snapshot.workPackages)
      .filter(isActive)
      .map((workPackage) => [workPackage.id, workPackage]),
  );
  const fieldNeededWithExposureIds = new Set(
    actionablePieces
      .filter((piece) => exposedIds.has(piece.id))
      .filter((piece) => {
        const fieldDate = piece.work_package_id
          ? workPackagesById.get(piece.work_package_id)?.scheduled_start_date
          : null;
        return fieldNeedIsUrgent(fieldDate, today);
      })
      .map((piece) => piece.id),
  );
  const unavailableSourceWarnings =
    optionalUnavailableSourceWarnings(snapshot);

  return {
    verification:
      unavailableSourceWarnings.length > 0 ? "partial" : "verified",
    unavailableSources: unavailableSourceWarnings.map(
      (warning) => warning.source,
    ),
    unavailableSourceWarnings,
    metrics: {
      affectedPieces: quantityForIds(actionablePieces, exposedIds),
      blockedOrHeldPieces: quantityForIds(
        actionablePieces,
        blockedOrHeldIds,
      ),
      nextWorkPackageReleaseReadiness: nextWorkPackageMetric(
        actionablePieces,
        rows(snapshot.workPackages),
        exposedIds,
      ),
      fieldNeededWithExposure: quantityForIds(
        actionablePieces,
        fieldNeededWithExposureIds,
      ),
    },
    exposures,
    attention,
  };
}
