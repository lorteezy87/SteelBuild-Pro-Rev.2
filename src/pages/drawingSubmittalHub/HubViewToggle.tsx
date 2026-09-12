/**
 * HubViewToggle — the segmented control for a hub tab's sub-views (Drawing
 * Register: Sheets / Sets & revisions / Reviews; Revision Impact: Computed /
 * Impact log). A role=group of aria-pressed buttons; the state itself lives in
 * the URL (useHubView). Anything passed as children sits at the end of the bar.
 */
import type { CSSProperties, ReactNode } from "react";

export interface HubViewOption<V extends string> {
  key: V;
  label: string;
  /** Tooltip for the button. */
  title?: string;
}

interface HubViewToggleProps<V extends string> {
  /** Accessible name of the group. */
  label: string;
  options: readonly HubViewOption<V>[];
  value: V;
  onChange: (next: V) => void;
  children?: ReactNode;
}

const PRESSED: CSSProperties = {
  background: "var(--cmd-chip-bg)",
  borderColor: "var(--cmd-gold)",
};

export function HubViewToggle<V extends string>({ label, options, value, onChange, children }: HubViewToggleProps<V>) {
  return (
    <div className="cmd-filterbar" role="group" aria-label={label} style={{ flexWrap: "wrap" }}>
      {options.map((option) => {
        const pressed = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            className="cmd-btn"
            aria-pressed={pressed}
            title={option.title}
            style={pressed ? PRESSED : undefined}
            onClick={() => onChange(option.key)}
          >
            {option.label}
          </button>
        );
      })}
      {children}
    </div>
  );
}
