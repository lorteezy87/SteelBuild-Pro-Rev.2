export type ImpactLevel = "none" | "low" | "medium" | "high" | "critical";

export interface ImpactBadgeProps {
  label: string;
  level?: ImpactLevel;
}

const LEVEL_CLASS: Record<ImpactLevel, string> = {
  none: "",
  low: "cmd-chip--info",
  medium: "cmd-chip--warn",
  high: "cmd-chip--danger",
  critical: "cmd-chip--danger",
};

export function ImpactBadge({ label, level = "none" }: ImpactBadgeProps) {
  return (
    <span
      className={`cmd-chip ${LEVEL_CLASS[level]}`.trim()}
      data-impact={level}
      aria-label={`Impact: ${label} · ${level}`}
      title={`Impact: ${level}`}
    >
      {label}
    </span>
  );
}
