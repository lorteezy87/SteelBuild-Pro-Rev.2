export const PIECE_LIFECYCLE_LABELS: Record<string, string> = {
  not_started: "Not Started",
  released: "Released",
  in_fabrication: "In Fabrication",
  fabricated: "Fabricated",
  shipped: "Shipped",
  delivered: "Delivered",
  erected: "Erected",
};

export type LogisticsAction = "ship" | "deliver" | "erect";

export interface LogisticsEligibilityPiece {
  lifecycle_status: string;
  on_hold: boolean;
  is_container?: boolean;
  is_deleted?: boolean;
  deleted_at: string | null;
}

export function pieceLifecycleLabel(status: string): string {
  return PIECE_LIFECYCLE_LABELS[status] ?? status.replaceAll("_", " ");
}

export function requiredLifecycleForAction(action: LogisticsAction): string {
  if (action === "ship") return "fabricated";
  if (action === "deliver") return "shipped";
  return "delivered";
}

export function nextLifecycleForAction(action: LogisticsAction): string {
  if (action === "ship") return "shipped";
  if (action === "deliver") return "delivered";
  return "erected";
}

export function logisticsDisabledReason(
  piece: LogisticsEligibilityPiece,
  action: LogisticsAction,
): string | null {
  if (piece.is_deleted || piece.deleted_at) return "Deleted lots cannot be changed.";
  if (piece.is_container) return "Roll-up containers are not physical lots.";
  if (piece.on_hold) return "Release the hold before recording logistics.";
  const required = requiredLifecycleForAction(action);
  if (piece.lifecycle_status !== required) {
    return `${pieceLifecycleLabel(required)} status is required.`;
  }
  return null;
}
