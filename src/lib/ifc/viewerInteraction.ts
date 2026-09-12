interface PointerSample { pointerId: number; clientX: number; clientY: number; button?: number }
/** Latch maximum travel and multiple pointers; returning to the origin is still a drag. */
export function createPickGesture(slop = 5) {
  const active = new Set<number>();
  let start: PointerSample | null = null;
  let rejected = false;
  const move = (e: PointerSample) => {
    if (start?.pointerId === e.pointerId && Math.hypot(e.clientX-start.clientX, e.clientY-start.clientY) > slop) rejected = true;
  };
  return {
    down(e: PointerSample) {
      if (!active.size) { start = e; rejected = e.button !== 0; }
      active.add(e.pointerId);
      if (active.size > 1) rejected = true;
    },
    move,
    up(e: PointerSample) {
      move(e);
      const pick = active.has(e.pointerId) && active.size === 1 && start?.pointerId === e.pointerId && !rejected;
      active.delete(e.pointerId);
      if (!active.size) start = null;
      return pick;
    },
    cancel(e: PointerSample) { rejected = true; active.delete(e.pointerId); if (!active.size) start = null; },
  };
}
export function wheelPixels(delta: number, mode: number, height: number) {
  return delta * (mode === 1 ? 16 : mode === 2 ? height : 1);
}
export function framingDistance(radius: number, verticalFovDegrees: number, aspect: number) {
  const vertical = verticalFovDegrees * Math.PI / 360;
  const horizontal = Math.atan(Math.tan(vertical) * Math.max(aspect, 0.01));
  return Math.max(radius, 0.01) / Math.sin(Math.min(vertical, horizontal)) * 1.15;
}
