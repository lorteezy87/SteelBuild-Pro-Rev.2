// Pure helpers extracted from DrawingViewer.jsx — kept side-effect free so
// they can be unit-tested in isolation. Behaviour is byte-identical to the
// inline definitions that previously lived in DrawingViewer.jsx.
import { STAGE_MAP } from "@/components/drawings/drawingsConfig";

// Stage colours pulled from the single source of truth in
// drawingsConfig (STAGE_MAP) so this badge stays in sync with
// StageChip and the stage progress mini-bar. Aliased to STAGES for
// backward compatibility with existing STAGES[d.stage]?.color reads.
export const STAGES = STAGE_MAP;

// Inline style snippet used everywhere a numeric/identifier label needs
// to render in the mono font (sheet numbers, zone keys, page indicators).
export const mono = { fontFamily: "var(--font-mono)" };

// Toolbar button base style. Spread into individual buttons; per-button
// overrides (color, background, padding) are layered on top via the
// usual `style={{ ...toolBtn, ... }}` pattern.
export const toolBtn = {
  background: "none",
  border: "1px solid var(--border-default)",
  borderRadius: 2,
  color: "var(--text-muted)",
  cursor: "pointer",
  padding: "4px 10px",
  fontFamily: "var(--font-mono)",
  fontSize: 13,
  lineHeight: 1,
};

// Normalise a sheet-number string for fuzzy comparison against callouts /
// cross-references. Uppercases, strips spaces / dashes / underscores / dots
// so "S-201", "s201", "S 201" and "S_201" all collapse to "S201".
export const normalizeSN = (s) => String(s || "").toUpperCase().replace(/[\s\-_.]/g, "");
