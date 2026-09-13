/**
 * DocControlMovedNotice — shown once, on the Drawing Register tab, to someone
 * who followed a ?hub_tab=doccontrol link. The Doc Control tab was retired
 * (owner decision, 2026-09-11) so each workflow has exactly one home; the
 * route wrapper redirects the old key here. The hub owns the dismiss state.
 */
import { X } from "lucide-react";

const HEADING_ID = "dcc-doccontrol-moved";

/** Each Doc Control view → where it lives now. */
const NEW_HOMES: ReadonlyArray<{ view: string; home: string }> = [
  { view: "Register", home: "the Drawing Register tab (you're here)" },
  { view: "Reviews", home: "Drawing Register › Reviews" },
  { view: "Impacts", home: "Revision Impact › Impact log" },
  { view: "Transmittals", home: "the Transmittals tab" },
  { view: "Holds", home: "the Holds & Blockers tab" },
];

export function DocControlMovedNotice({ onDismiss }: { onDismiss: () => void }) {
  return (
    <section
      aria-labelledby={HEADING_ID}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        marginBottom: 12,
        padding: "12px 14px",
        borderRadius: 10,
        border: "1px solid var(--cmd-border)",
        borderLeft: "3px solid var(--cmd-info)",
        background: "var(--cmd-chip-info-bg)",
        color: "var(--cmd-text)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3 id={HEADING_ID} style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--cmd-text)" }}>
          Doc Control has moved
        </h3>
        <p style={{ margin: "4px 0 6px", fontSize: 12, color: "var(--cmd-text-muted)" }}>
          Each of its views now has one home:
        </p>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.6, color: "var(--cmd-text)" }}>
          {NEW_HOMES.map(({ view, home }) => (
            <li key={view}>
              <strong>{view}</strong>: {home}
            </li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        className="cmd-btn cmd-btn--ghost"
        aria-label="Dismiss the Doc Control notice"
        onClick={onDismiss}
        style={{ padding: "4px 6px" }}
      >
        <X size={14} />
      </button>
    </section>
  );
}
