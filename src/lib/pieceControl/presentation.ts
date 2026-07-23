import { CANONICAL_LIFECYCLES } from "./canonicalRollups";
import { pieceLifecycleLabel } from "./lifecycle";
import { pieceTons } from "./tonnage";

export type PieceControlMode = "off" | "shadow" | "pilot" | "live";
export type PresentationTone = "neutral" | "good" | "warn" | "danger" | "info";

export interface PieceSummaryRow {
  quantity: number;
  weight_each_lbs: number | null;
  weight_total_lbs: number | null;
  lifecycle_status: string;
  on_hold: boolean;
  work_package_id: string | null;
}

export interface PieceControlModePresentation {
  label: string;
  tone: PresentationTone;
  authority: string;
}

export interface PieceLifecycleMetric {
  key: string;
  label: string;
  pieces: number;
  tons: number;
}

export interface PieceAttentionItem {
  key: "unassigned" | "missing-weight" | "held";
  label: string;
  count: number;
  tone: "warn" | "danger";
}

export interface PieceControlSummary {
  rowCount: number;
  totalPieces: number;
  knownTons: number;
  inFabricationPieces: number;
  readyToShipPieces: number;
  unknownWeightPieces: number;
  heldRows: number;
  unassignedRows: number;
  lifecycle: PieceLifecycleMetric[];
  attention: PieceAttentionItem[];
}

const MODE_PRESENTATION: Record<PieceControlMode, PieceControlModePresentation> = {
  off: {
    label: "Not set up",
    tone: "neutral",
    authority: "Piece Control is not active for this project.",
  },
  shadow: {
    label: "Shadow review",
    tone: "warn",
    authority: "Existing production records remain authoritative while the register is compared.",
  },
  pilot: {
    label: "Pilot workflow",
    tone: "info",
    authority: "The approved pilot workflow is active for this project scope.",
  },
  live: {
    label: "Live workflow",
    tone: "good",
    authority: "Piece Control is authoritative for the enabled workflow.",
  },
};

export function modePresentation(mode: PieceControlMode): PieceControlModePresentation {
  return MODE_PRESENTATION[mode];
}

export function buildPieceControlSummary(rows: PieceSummaryRow[]): PieceControlSummary {
  const lifecycle = CANONICAL_LIFECYCLES.map((key) => ({
    key,
    label: pieceLifecycleLabel(key),
    pieces: 0,
    tons: 0,
  }));
  const lifecycleByKey = new Map<string, PieceLifecycleMetric>(
    lifecycle.map((item) => [item.key, item]),
  );
  let totalPieces = 0;
  let knownTons = 0;
  let unknownWeightPieces = 0;
  let heldRows = 0;
  let unassignedRows = 0;

  for (const row of rows) {
    const quantity = Number(row.quantity) || 0;
    const tons = pieceTons(row);
    totalPieces += quantity;
    if (tons == null) unknownWeightPieces += quantity;
    else knownTons += tons;
    if (row.on_hold) heldRows += 1;
    if (!row.work_package_id) unassignedRows += 1;
    const lifecycleItem = lifecycleByKey.get(row.lifecycle_status);
    if (lifecycleItem) {
      lifecycleItem.pieces += quantity;
      lifecycleItem.tons += tons ?? 0;
    }
  }

  const attention: PieceAttentionItem[] = [
    { key: "unassigned", label: "Unassigned pieces", count: unassignedRows, tone: "warn" },
    { key: "missing-weight", label: "Missing weights", count: unknownWeightPieces, tone: "warn" },
    { key: "held", label: "Held pieces", count: heldRows, tone: "danger" },
  ].filter((item) => item.count > 0) as PieceAttentionItem[];

  return {
    rowCount: rows.length,
    totalPieces,
    knownTons,
    inFabricationPieces: lifecycleByKey.get("in_fabrication")?.pieces ?? 0,
    readyToShipPieces: lifecycleByKey.get("fabricated")?.pieces ?? 0,
    unknownWeightPieces,
    heldRows,
    unassignedRows,
    lifecycle,
    attention,
  };
}
