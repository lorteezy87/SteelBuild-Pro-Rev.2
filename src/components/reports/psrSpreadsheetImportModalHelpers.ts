export function cardStyle(borderColor: string): Record<string, string | number> {
  return {
    border: `1px solid ${borderColor}`,
    borderLeft: `3px solid ${borderColor}`,
    borderRadius: 4,
    background: "var(--bg-surface)",
    padding: "12px 14px",
  };
}

export const mono: Record<string, string> = { fontFamily: "var(--font-mono)" };
export const AI = "var(--ai-accent, #22D3EE)";

export const selectStyle: Record<string, string | number> = {
  width: "100%",
  padding: "6px 10px",
  fontSize: 12,
  background: "var(--bg-page)",
  border: "1px solid var(--border-default)",
  borderRadius: 2,
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
};

export const btnPrimary: Record<string, string | number> = {
  padding: "8px 22px",
  background: AI,
  color: "var(--on-accent)",
  border: "none",
  borderRadius: 2,
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  cursor: "pointer",
};

export const btnGhost: Record<string, string | number> = {
  padding: "8px 18px",
  background: "transparent",
  border: "1px solid var(--border-default)",
  borderRadius: 2,
  color: "var(--text-muted)",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  cursor: "pointer",
};

export const displayStyle = {
  fontFamily: "'Space Grotesk', var(--font-display)",
} as const;

