/** Pure color-mode catalogs + tool styles for Model3DTab. */

export const MODEL3D_COLOR_MODES = [
  { key: "model", label: "Model" },
  { key: "fab", label: "Fab" },
  { key: "type", label: "Type" },
  { key: "sequence", label: "Sequence" },
  { key: "status", label: "Detailing" },
] as const;

export const MODEL3D_TYPE_LABELS = [
  ["beam", "Beam"],
  ["column", "Column"],
  ["plate", "Plate"],
  ["member", "Member"],
] as const;

export const MODEL3D_MONO = { fontFamily: "var(--font-mono)" } as const;

export const MODEL3D_VIEWER_TOOLS = {
  position: "absolute" as const,
  top: 10,
  left: 10,
  display: "flex" as const,
  gap: 6,
  zIndex: 2,
};

export const MODEL3D_TOOL_BTN = {
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid var(--border-default)",
  background: "rgba(13,17,23,0.72)",
  color: "var(--text-secondary)",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.05em",
  cursor: "pointer" as const,
};

export const MODEL3D_HINT_STYLE: Record<string, string | number> = {
  color: "var(--text-muted)",
  fontSize: 12,
  lineHeight: 1.5,
};

export const MODEL3D_LINK_BTN: Record<string, string | number> = {
  background: "none",
  border: "none",
  color: "var(--accent)",
  cursor: "pointer",
  textDecoration: "underline",
  font: "inherit",
  padding: 0,
};
