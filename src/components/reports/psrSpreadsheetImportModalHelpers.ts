export function cardStyle(borderColor: string): Record<string, string | number> {
  return {
    border: `1px solid ${borderColor}`,
    borderLeft: `3px solid ${borderColor}`,
    borderRadius: 4,
    background: "var(--bg-surface)",
    padding: "12px 14px",
  };
}
