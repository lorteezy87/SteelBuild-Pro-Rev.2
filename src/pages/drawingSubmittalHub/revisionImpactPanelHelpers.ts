/** Pure grid/column catalogs for RevisionImpactPanel. */

export const REVISION_IMPACT_PANEL_GRID_COLS =
  "minmax(180px, 2fr) minmax(56px, 0.6fr) minmax(120px, 1fr) minmax(160px, 1.8fr) minmax(96px, 0.9fr) minmax(88px, 0.7fr) minmax(72px, 0.7fr) minmax(96px, 0.9fr)";

export const REVISION_IMPACT_PANEL_COLUMNS: {
  label: string;
  align?: "right";
  title?: string;
}[] = [
  { label: "Changed Sheet" },
  { label: "Rev" },
  { label: "Downstream" },
  { label: "Linked Work Package" },
  { label: "RFIs (open/all)", align: "right" },
  { label: "Fab Blocked?" },
  {
    label: "Pieces ≈",
    align: "right",
    title:
      "Pieces tied to this set — exact when the roster links pieces to the set, otherwise estimated via the linked work-package sequence. '—' when neither resolves.",
  },
  { label: "" },
];
