import { useState, type CSSProperties, type MouseEventHandler } from "react";
import { mono } from "./drawingsConfig";

interface ActionButtonProps {
  label: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
  primary?: boolean;
}

export function ActionButton({
  label,
  onClick,
  danger = false,
  disabled = false,
  title,
  primary = false,
}: ActionButtonProps) {
  const [hovered, setHovered] = useState(false);
  const baseColor = primary
    ? "var(--accent)"
    : danger
      ? "var(--status-error)"
      : "var(--text-muted)";
  const restBorder = primary
    ? "var(--accent-border)"
    : danger
      ? "color-mix(in srgb, var(--status-error) 55%, transparent)"
      : "var(--border-default)";
  const hoverBorder = primary
    ? "var(--accent)"
    : danger
      ? "var(--status-error)"
      : "var(--border-strong)";
  const baseBg = danger
    ? "color-mix(in srgb, var(--status-error) 10%, transparent)"
    : "none";
  const hoverBg = primary
    ? "var(--accent-muted)"
    : danger
      ? "color-mix(in srgb, var(--status-error) 22%, transparent)"
      : "var(--hover-bg)";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...mono,
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "0.06em",
        padding: danger ? "4px 10px" : "4px 9px",
        borderRadius: "var(--radius-badge)",
        border: `1px solid ${hovered && !disabled ? hoverBorder : restBorder}`,
        background: hovered && !disabled ? hoverBg : baseBg,
        color: baseColor,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.3 : 1,
        whiteSpace: "nowrap",
        minHeight: 26,
        transition: "all 0.15s",
      }}
    >
      {label}
    </button>
  );
}

interface ContextMenuItemProps {
  label: string;
  onClick: MouseEventHandler<HTMLButtonElement>;
  danger?: boolean;
}

export function ContextMenuItem({
  label,
  onClick,
  danger = false,
}: ContextMenuItemProps) {
  const [hovered, setHovered] = useState(false);
  const style: CSSProperties = {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "8px 16px",
    background: hovered
      ? danger
        ? "color-mix(in srgb, var(--status-error) 8%, transparent)"
        : "var(--hover-bg)"
      : "none",
    border: "none",
    cursor: "pointer",
    ...mono,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.08em",
    color: danger ? "var(--status-error)" : "var(--text-primary)",
    transition: "background 0.1s",
  };

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={style}
    >
      {label}
    </button>
  );
}
