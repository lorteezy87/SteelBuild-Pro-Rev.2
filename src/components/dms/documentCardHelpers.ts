export function btnStyle(
  bg?: string,
  border?: string,
  color?: string,
): Record<string, string | number> {
  return {
    flex: 1,
    padding: "5px 4px",
    background: bg || "transparent",
    border: "1px solid " + (border || "var(--border-default)"),
    color: color || "var(--text-secondary)",
    borderRadius: 4,
    fontFamily: "var(--font-mono)",
    fontSize: 9,
    fontWeight: 700,
    cursor: "pointer",
    letterSpacing: "0.04em",
  };
}
