import "./calc.css";

/**
 * CalcTape — scrollable history tape for SteelBuild calculator screens.
 *
 * @param {object}   props
 * @param {Array}    props.rows       - Tape entries (newest first). Each entry
 *                                      is passed back verbatim via onRecall.
 * @param {Function} [props.onRecall] - Called with the entry when a row is clicked.
 * @param {Function} [props.onClear]  - Called when the Clear button is clicked.
 */
export default function CalcTape({ rows, onRecall, onClear }) {
  return (
    <div className="sbd-calc-tape">
      <div className="sbd-calc-tape__header">
        <span className="sbd-calc-tape__title">History</span>
        <button
          type="button"
          className="sbd-calc-tape__clear sbd-calc-key sbd-calc-key--fn"
          onClick={onClear}
          disabled={rows.length === 0}
          aria-label="Clear tape history"
        >
          Clear
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="sbd-calc-tape__empty">No history yet.</p>
      ) : (
        <ol className="sbd-calc-tape__list" aria-label="Calculation history">
          {rows.map((row, idx) => (
            <li key={idx} className="sbd-calc-tape__item">
              <button
                type="button"
                className="sbd-calc-tape__row"
                onClick={() => onRecall && onRecall(row)}
                aria-label={`Recall ${row && row.expr != null ? row.expr : String(row)}`}
              >
                {row && row.expr != null ? (
                  <>
                    <span className="sbd-calc-tape__expr">{row.expr}</span>
                    <span className="sbd-calc-tape__value">{row.value}</span>
                  </>
                ) : (
                  <span className="sbd-calc-tape__value">{String(row)}</span>
                )}
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
