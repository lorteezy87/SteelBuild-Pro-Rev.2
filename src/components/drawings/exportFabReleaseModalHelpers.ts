/**
 * Pure config + style helpers for ExportFabReleaseModal.
 */

export const mono: Record<string, string> = {
  fontFamily: "var(--font-mono, ui-monospace, monospace)",
};

export const labelStyle: Record<string, string | number> = {
  ...mono,
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.15em",
  color: "var(--text-muted)",
  display: "block",
  marginBottom: 6,
};

export const btnBase: Record<string, string | number> = {
  ...mono,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.1em",
  padding: "8px 16px",
  borderRadius: 2,
  border: "1px solid var(--border-default)",
  cursor: "pointer",
  textTransform: "uppercase",
};

export type FabExportKind = "fab_release" | "turnover" | "claims";

export const KIND_CONFIG: Record<
  FabExportKind,
  { title: string; eyebrow: string; description: string; filterLabel: string }
> = {
  fab_release: {
    title: "Export Fab Release Package",
    eyebrow: "FABRICATION RELEASE",
    description:
      "IFC / Released drawings (submittal-derived) bundled with a manifest CSV and a README listing the contents, ready to hand to the fabricator.",
    filterLabel: "IFC / Released for fabrication",
  },
  turnover: {
    title: "Export Turnover Package",
    eyebrow: "TURNOVER",
    description:
      "IFC / Released drawings with manifest and README, ready for owner turnover.",
    filterLabel: "IFC / Released",
  },
  claims: {
    title: "Export Claims Package",
    eyebrow: "CLAIMS · LEGAL / INSURANCE",
    description:
      "Everything in scope (drawings, RFIs, change orders, photos linked to drawings) grouped by date for legal / insurance documentation.",
    filterLabel: "All (chronological)",
  },
};

/** Leading glyph per gate-reason kind for the "not ready for fab" panel. */
export const GATE_REASON_ICON: Record<string, string> = {
  open_rfis: "❓",
  rejected_sheets: "⊘",
  revision_conflict: "⟳",
  unresolved_revision: "◎",
  not_ifc_ready: "⊘",
  missing_signoffs: "✍",
};
