import "./calc.css";

/**
 * CalcKey — tactile keycap primitive for SteelBuild calculator screens.
 *
 * @param {object}   props
 * @param {string}   props.label      - Primary key label (displayed centre).
 * @param {string}   [props.secondary=""] - Small secondary label shown top-right.
 * @param {Function} [props.onPress]  - Called when key is pressed (not called when disabled).
 * @param {string}   [props.variant="digit"] - Styling variant:
 *   "digit" | "op" | "fn" | "accent" | "danger"
 * @param {boolean}  [props.disabled=false] - Disables interaction and dims the key.
 * @param {boolean}  [props.wide=false]     - Spans two grid columns.
 * @param {string}   [props.ariaLabel]      - Accessible label override.
 */
export default function CalcKey({
  label,
  secondary = "",
  onPress,
  variant = "digit",
  disabled = false,
  wide = false,
  ariaLabel,
}) {
  const variantClass = variant !== "digit" ? ` sbd-calc-key--${variant}` : "";
  const wideClass = wide ? " sbd-calc-key--wide" : "";
  const className = `sbd-calc-key${variantClass}${wideClass}`;

  function handleClick() {
    if (!disabled && onPress) {
      onPress();
    }
  }

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={ariaLabel ?? String(label)}
      className={className}
      onClick={handleClick}
    >
      {secondary ? (
        <span className="sbd-calc-key__sec">{secondary}</span>
      ) : null}
      <span className="sbd-calc-key__label">{label}</span>
    </button>
  );
}
