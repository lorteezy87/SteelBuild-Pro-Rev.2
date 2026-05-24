import { STAGE_MAP, mono } from "./drawingsConfig";

/**
 * Colored pill showing a drawing's current submittal stage.
 * @param {{ stage: string, size?: "sm" | "md" | "lg" }} props
 */
export default function StageChip({ stage, size = "sm" }) {
  const cfg = STAGE_MAP[stage] || STAGE_MAP["Not Started"];
  const pad = size === "lg" ? "5px 12px" : size === "sm" ? "2px 7px" : "4px 10px";
  const fs = size === "lg" ? 11 : size === "sm" ? 9 : 10;
  return (
    <span style={{
      ...mono,
      padding: pad,
      borderRadius: "var(--radius-badge)",
      fontSize: fs,
      fontWeight: 700,
      letterSpacing: "0.1em",
      color: cfg.color,
      background: cfg.bg,
      border: `1px solid ${cfg.color}44`,
      whiteSpace: "nowrap",
    }}>
      {cfg.label}
    </span>
  );
}
