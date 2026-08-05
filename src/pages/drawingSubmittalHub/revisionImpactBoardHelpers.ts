/** Pure grid/downstream maps for revisionImpactBoard. */

import { accent, error, textMuted, warning } from "./format";

export const REV_DOWNSTREAM: Record<string, { label: string; color: string }> = {
  critical: { label: "In field", color: error },
  high: { label: "Delivered", color: warning },
  medium: { label: "Fabricated", color: accent },
  low: { label: "Not downstream", color: textMuted },
};

export const REVISION_IMPACT_BOARD_GRID_COLS =
  "minmax(180px, 2fr) minmax(56px, 0.6fr) minmax(110px, 1fr) minmax(160px, 1.8fr) minmax(96px, 0.9fr) minmax(80px, 0.7fr) minmax(72px, 0.7fr) minmax(96px, 0.9fr)";
