export const PIECE_LIFECYCLE_STATUSES = [
  "not_started",
  "in_fabrication",
  "fabricated",
  "shipped",
  "delivered",
  "erected",
] as const;

export type PieceLifecycleStatus = (typeof PIECE_LIFECYCLE_STATUSES)[number];

export const PIECE_STATIONS = [
  "cut",
  "fit",
  "weld",
  "qc",
  "paint",
  "ready_to_ship",
] as const;

export type PieceStation = (typeof PIECE_STATIONS)[number];

export const PIECE_EVENT_TYPES = [
  "imported",
  "updated_from_import",
  "lot_split",
  "lot_merged",
  "assigned_to_work_package",
  "drawing_linked",
  "drawing_unlinked",
  "hold_applied",
  "hold_released",
  "released_for_fabrication",
  "release_exception",
  "station_advanced",
  "station_override",
  "shipped",
  "delivered",
  "erected",
] as const;

export type PieceEventType = (typeof PIECE_EVENT_TYPES)[number];

export type PieceWeightInputs = {
  weight_total_lbs?: number | null;
  weight_each_lbs?: number | null;
  quantity?: number | null;
};

