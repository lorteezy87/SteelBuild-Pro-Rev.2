/**
 * Shared register virtualization threshold.
 *
 * Matches command DataTable / DrawingRegister: lists at or below this size
 * keep document flow; larger lists switch to an internal scroll +
 * @tanstack/react-virtual window.
 */
export const REGISTER_VIRTUALIZE_THRESHOLD = 100;

export function shouldVirtualizeRegister(
  rowCount: number,
  threshold: number = REGISTER_VIRTUALIZE_THRESHOLD,
): boolean {
  return rowCount > threshold;
}
