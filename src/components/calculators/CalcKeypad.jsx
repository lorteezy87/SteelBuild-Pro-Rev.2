/**
 * CalcKeypad — CSS-grid wrapper for calculator keys.
 *
 * Props:
 *  columns  {number}    — number of grid columns (default 4)
 *  children {ReactNode} — CalcKey (or other) children
 */
export default function CalcKeypad({ columns = 4, children }) {
  return (
    <div
      role="group"
      className="sbd-calc-keypad"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: 8,
      }}
    >
      {children}
    </div>
  );
}
