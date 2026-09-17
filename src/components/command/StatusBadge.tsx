import type { ReactNode } from "react";

export type StatusBadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

export interface StatusBadgeProps {
  label: ReactNode;
  tone?: StatusBadgeTone;
  title?: string;
}

const TONE_CLASS: Record<StatusBadgeTone, string> = {
  neutral: "",
  accent: "cmd-chip--gold",
  success: "cmd-chip--good",
  warning: "cmd-chip--warn",
  danger: "cmd-chip--danger",
  info: "cmd-chip--info",
};

export function StatusBadge({ label, tone = "neutral", title }: StatusBadgeProps) {
  return (
    <span
      className={`cmd-chip ${TONE_CLASS[tone]}`.trim()}
      data-tone={tone}
      title={title}
    >
      {label}
    </span>
  );
}
