/** Pure helpers for TitleblockMarkerModal. */

/** Absolute percent-box chrome for titleblock marker rectangles. */
export function titleblockRectStyle(
  rect: { x: number; y: number; width: number; height: number } | null | undefined,
  color: string,
): Record<string, string | number> | null {
  if (!rect) return null;
  return {
    position: "absolute",
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.width * 100}%`,
    height: `${rect.height * 100}%`,
    border: `2px solid ${color}`,
    background: `${color}22`,
    pointerEvents: "none",
    boxSizing: "border-box",
  };
}

