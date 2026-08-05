import "./calc.css";

/**
 * CalculatorShell — controlled device frame + segmented tool rail.
 *
 * @param {object}    props
 * @param {Array<{id: string, label: string}>} props.tools     - Ordered tool descriptors.
 * @param {string}    props.activeTool  - id of the currently selected tool.
 * @param {Function}  props.onSelect    - Called with (id) when a tool is chosen.
 * @param {React.ReactNode} props.children - Content rendered inside the card body.
 */
export default function CalculatorShell({ tools = [], activeTool, onSelect, children }) {
  /**
   * Arrow-key navigation across the tool rail buttons.
   * Left/Up → previous, Right/Down → next, Enter → select (the button is already
   * focused so Enter's native click fires, but we also call onSelect directly for
   * clarity / synthetic-event parity in tests).
   */
  function handleRailKeyDown(e) {
    const rail = e.currentTarget; // the <div role="group">
    const buttons = Array.from(rail.querySelectorAll("button"));
    const idx = buttons.indexOf(document.activeElement);

    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = buttons[(idx + 1) % buttons.length];
      next?.focus();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const prev = buttons[(idx - 1 + buttons.length) % buttons.length];
      prev?.focus();
    } else if (e.key === "Enter") {
      if (idx >= 0) {
        const tool = tools[idx];
        if (tool) onSelect?.(tool.id);
      }
    }
  }

  return (
    <div className="sbd-calc-shell">
      {/* ── Header ── */}
      <div className="sbd-calc-shell__header">
        <span className="sbd-calc-shell__title">Calculators</span>
      </div>

      {/* ── Tool rail ── */}
      <div
        className="sbd-calc-tool-rail"
        role="group"
        aria-label="Calculator tools"
        onKeyDown={handleRailKeyDown}
      >
        {tools.map((tool) => {
          const isActive = tool.id === activeTool;
          return (
            <button
              key={tool.id}
              type="button"
              className={
                "sbd-calc-tool-rail__btn" +
                (isActive ? " sbd-calc-tool-rail__btn--active" : "")
              }
              aria-pressed={isActive}
              onClick={() => onSelect?.(tool.id)}
            >
              {tool.label}
            </button>
          );
        })}
      </div>

      {/* ── Body ── */}
      <div className="sbd-card sbd-calc-shell__body">{children}</div>
    </div>
  );
}
