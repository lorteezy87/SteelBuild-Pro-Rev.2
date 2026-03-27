import React, { useState } from "react";

export default function DailyLogsList({ logs }) {
  const [expandedId, setExpandedId] = useState(null);

  if (logs.length === 0) {
    return (
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "12px",
          padding: "40px",
          textAlign: "center",
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            color: "var(--text-muted)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          No daily logs
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {logs.map((log) => (
        <div
          key={log.id}
          onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: "12px",
            padding: "16px",
            cursor: "pointer",
            transition: "border-color 0.15s, background 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--accent-border)";
            e.currentTarget.style.background = "var(--hover-bg)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border-default)";
            e.currentTarget.style.background = "var(--bg-surface)";
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: expandedId === log.id ? "12px" : 0,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                {new Date(log.date).toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  color: "var(--text-muted)",
                  marginTop: "2px",
                }}
              >
                {log.crew_name} • {log.headcount} people • {log.hours_worked}h
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  color: log.delay_hours > 0 ? "var(--status-error)" : "var(--status-success)",
                  fontWeight: 600,
                  marginBottom: "4px",
                }}
              >
                {log.delay_hours > 0 ? `${log.delay_hours}h delays` : "No delays"}
              </div>
              {log.safety_incidents > 0 && (
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "9px",
                    color: "var(--status-error)",
                    fontWeight: 600,
                  }}
                >
                  ⚠ {log.safety_incidents} incident{log.safety_incidents !== 1 ? "s" : ""}
                </div>
              )}
            </div>
          </div>

          {/* Expanded Content */}
          {expandedId === log.id && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "16px",
                paddingTop: "12px",
                borderTop: "1px solid var(--divider)",
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "9px",
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    letterSpacing: "0.10em",
                    textTransform: "uppercase",
                    marginBottom: "6px",
                  }}
                >
                  Weather
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                  {log.weather_description} • {log.temperature}°F • {log.wind_speed} mph wind
                </div>
              </div>

              <div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "9px",
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    letterSpacing: "0.10em",
                    textTransform: "uppercase",
                    marginBottom: "6px",
                  }}
                >
                  Superintendent
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                  {log.superintendent || "—"}
                </div>
              </div>

              {log.activities && (
                <div>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "9px",
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      letterSpacing: "0.10em",
                      textTransform: "uppercase",
                      marginBottom: "6px",
                    }}
                  >
                    Activities
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    {log.activities}
                  </div>
                </div>
              )}

              {log.equipment_used && (
                <div>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "9px",
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      letterSpacing: "0.10em",
                      textTransform: "uppercase",
                      marginBottom: "6px",
                    }}
                  >
                    Equipment
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                    {log.equipment_used}
                  </div>
                </div>
              )}

              {log.materials_received && (
                <div>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "9px",
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      letterSpacing: "0.10em",
                      textTransform: "uppercase",
                      marginBottom: "6px",
                    }}
                  >
                    Materials Received
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                    {log.materials_received}
                  </div>
                </div>
              )}

              {log.delays && (
                <div>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "9px",
                      fontWeight: 700,
                      color: "var(--status-error)",
                      letterSpacing: "0.10em",
                      textTransform: "uppercase",
                      marginBottom: "6px",
                    }}
                  >
                    Delays / Issues
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--status-error)" }}>
                    {log.delays}
                  </div>
                </div>
              )}

              {log.safety_notes && (
                <div>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "9px",
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      letterSpacing: "0.10em",
                      textTransform: "uppercase",
                      marginBottom: "6px",
                    }}
                  >
                    Safety Notes
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                    {log.safety_notes}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}