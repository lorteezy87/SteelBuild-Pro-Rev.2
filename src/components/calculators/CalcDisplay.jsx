import "./calc.css";

/**
 * CalcDisplay — token-styled calculator display panel.
 *
 * Props:
 *  value        {string|number}  — primary (large) display value
 *  aux          {string}         — secondary expression/history line (hidden when falsy)
 *  memoryActive {boolean}        — show the "M" memory-active chip
 *  onCopy       {function}       — called when the value is clicked
 */
export default function CalcDisplay({
  value,
  aux = "",
  memoryActive = false,
  onCopy,
}) {
  return (
    <div className="sbd-calc-display">
      {/* Memory chip — only visible when a value is stored */}
      {memoryActive && (
        <span
          className="sbd-calc-display__mem"
          aria-label="Memory active"
          style={{
            alignSelf: "flex-start",
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            color: "var(--accent)",
            background: "var(--bg-surface)",
            border: "1px solid var(--accent)",
            borderRadius: 4,
            padding: "1px 5px",
            lineHeight: 1.4,
          }}
        >
          M
        </span>
      )}

      {/* Aux / expression line */}
      {aux && (
        <div className="sbd-calc-display__expr" aria-label="Expression">
          {aux}
        </div>
      )}

      {/* Primary value — clickable to copy */}
      <div
        className="sbd-calc-display__value"
        role={onCopy ? "button" : undefined}
        tabIndex={onCopy ? 0 : undefined}
        aria-label="Display value"
        onClick={() => onCopy?.()}
        onKeyDown={
          onCopy
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") onCopy();
              }
            : undefined
        }
        style={onCopy ? { cursor: "pointer" } : undefined}
      >
        {value}
      </div>
    </div>
  );
}
