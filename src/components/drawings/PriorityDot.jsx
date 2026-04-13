/**
 * Small colored dot indicating a critical-path / priority-flagged drawing.
 * Renders nothing when inactive.
 * @param {{ active: boolean }} props
 */
export default function PriorityDot({ active }) {
  if (!active) return null;
  return (
    <span style={{
      display: "inline-block",
      width: 7,
      height: 7,
      borderRadius: "50%",
      background: "var(--status-error)",
      flexShrink: 0,
    }} />
  );
}
