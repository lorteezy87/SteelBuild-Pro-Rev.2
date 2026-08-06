/**
 * Labeled <select> filter control used by the Piece Register filter bar.
 * Extracted from PieceRegister.tsx (behavior-preserving).
 */

export function SelectFilter({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: Array<string | { value: string; label: string }>;
}) {
  const controlId = `piece-register-filter-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <label className="piece-register-filter" htmlFor={controlId}>
      {label}
      <select
        id={controlId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="piece-register-filter__control"
      >
        <option value="">All</option>
        {options.map((option) => {
          const optionValue = typeof option === "string" ? option : option.value;
          const optionLabel = typeof option === "string" ? option : option.label;
          return (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          );
        })}
      </select>
    </label>
  );
}
