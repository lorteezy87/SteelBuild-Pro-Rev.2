import { formatDate } from "@/components/shared/formatters";
import {
  DRAWING_TYPES,
  DRAWING_TYPE_ABBR,
  componentState,
  missingDrawingTypes,
  sortComponents,
  type DrawingType,
  type SubmittalComponent,
} from "@/lib/submittalComponents";

interface SubmittalDrawingTypeComponentsProps {
  components: SubmittalComponent[];
  onSetReceived: (args: {
    drawingType: DrawingType;
    existing: SubmittalComponent | null;
    date: string | null;
  }) => void;
  onSetReleased: (args: {
    drawingType: DrawingType;
    existing: SubmittalComponent | null;
    released: boolean;
  }) => void;
  onAddType: (drawingType: DrawingType) => void;
  onRemoveType: (component: SubmittalComponent) => void;
}

export function SubmittalDrawingTypeComponents({
  components,
  onSetReceived,
  onSetReleased,
  onAddType,
  onRemoveType,
}: SubmittalDrawingTypeComponentsProps) {
  const present = sortComponents(components).filter(
    (
      component,
    ): component is SubmittalComponent & { drawing_type: DrawingType } =>
      (DRAWING_TYPES as readonly string[]).includes(component.drawing_type),
  );
  const missing = missingDrawingTypes(components);

  return (
    <div>
      {present.length === 0 && (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--text-muted)",
            fontStyle: "italic",
            marginBottom: 8,
          }}
        >
          No drawing types tracked yet. Add Shop, Erection, or Part below to
          track each independently.
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {present.map((component) => {
          const state = componentState(component);
          const released = state === "released";
          return (
            <div
              key={component.drawing_type}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                borderRadius: 4,
                border: "1px solid var(--border-default)",
                background: released
                  ? "var(--status-success-bg, var(--success-muted))"
                  : "var(--bg-surface-low)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    fontWeight: 800,
                    color: "var(--text-primary)",
                    letterSpacing: "0.04em",
                  }}
                >
                  {DRAWING_TYPE_ABBR[component.drawing_type]}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                  }}
                >
                  {component.drawing_type}
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 8,
                    color: "var(--text-muted)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  Rcvd
                </span>
                <input
                  type="date"
                  value={component.received_date || ""}
                  onChange={(event) =>
                    onSetReceived({
                      drawingType: component.drawing_type,
                      existing: component,
                      date: event.target.value || null,
                    })
                  }
                  aria-label={`${component.drawing_type} received date`}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    padding: "2px 6px",
                    background: "var(--bg-input, var(--bg-surface-low))",
                    border: "1px solid var(--border-default)",
                    borderRadius: 3,
                    color: "var(--text-primary)",
                    outline: "none",
                    maxWidth: 140,
                  }}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  justifySelf: "end",
                }}
              >
                <button
                  type="button"
                  onClick={() =>
                    onSetReleased({
                      drawingType: component.drawing_type,
                      existing: component,
                      released: !released,
                    })
                  }
                  title={
                    released
                      ? `${component.drawing_type} released${
                          component.released_date
                            ? ` ${formatDate(component.released_date)}`
                            : ""
                        } — click to un-release`
                      : `Release ${component.drawing_type} for fabrication`
                  }
                  style={{
                    padding: "3px 10px",
                    borderRadius: 3,
                    cursor: "pointer",
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.05em",
                    border: released
                      ? "1px solid var(--status-success, var(--status-success))"
                      : "1px solid var(--border-default)",
                    background: released
                      ? "var(--status-success, var(--status-success))"
                      : "transparent",
                    color: released
                      ? "var(--on-accent)"
                      : "var(--text-muted)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {released
                    ? `RELEASED${
                        component.released_date
                          ? ` · ${formatDate(component.released_date)}`
                          : ""
                      }`
                    : "RELEASE"}
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveType(component)}
                  title={`Stop tracking ${component.drawing_type}`}
                  aria-label={`Remove ${component.drawing_type}`}
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--text-muted)",
                    fontSize: 13,
                    lineHeight: 1,
                    padding: "0 2px",
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {missing.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 6,
            marginTop: 8,
            flexWrap: "wrap",
          }}
        >
          {missing.map((drawingType) => (
            <button
              key={drawingType}
              type="button"
              onClick={() => onAddType(drawingType)}
              title={`Track ${drawingType} drawings independently`}
              style={{
                padding: "4px 10px",
                borderRadius: 3,
                background: "transparent",
                border: "1px dashed var(--border-default)",
                color: "var(--accent)",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.06em",
                cursor: "pointer",
                textTransform: "uppercase",
              }}
            >
              + {drawingType}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
