import { useState, useCallback } from "react";

/**
 * Simple hover state hook. Returns isHovered boolean + event handlers.
 *
 * Usage:
 *   const { isHovered, hoverHandlers } = useHover();
 *   <div {...hoverHandlers} style={{ opacity: isHovered ? 1 : 0.7 }} />
 */
export function useHover() {
  const [isHovered, setIsHovered] = useState(false);
  const onMouseEnter = useCallback(() => setIsHovered(true), []);
  const onMouseLeave = useCallback(() => setIsHovered(false), []);
  return { isHovered, hoverHandlers: { onMouseEnter, onMouseLeave } };
}
