import React from "react";
import { formatDate } from "../shared/formatters";

/**
 * SubmittalForecastCard — review-return forecast for a pending submittal.
 *
 * Reads a SubmittalForecast (submittalForecast.forecastSubmittal): expected +
 * worst-case return, risk, and what the estimate is based on. Renders nothing
 * for submittals that aren't forecastable (not under review / no sent date).
 *
 * Props:
 *   forecast — SubmittalForecast object
 */

const RISK_CFG = {
  low:    { color: "var(--status-success)", bg: "var(--success-muted)", border: "var(--success-border)" },
  medium: { color: "var(--status-warning)", bg: "var(--warning-muted)", border: "var(--warning-border)" },
  high:   { color: "var(--status-error)", bg: "var(--danger-muted)", border: "var(--danger-border)" },
};

function Metric({ label, value, accent }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{
        fontFamily: "var(--font-mono)",
        fontSize: 8,
        fontWeight: 700,
        letterSpacing: "0.10em",
        textTransform: "uppercase",
        color: "var(--text-muted)",
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        fontWeight: 700,
        color: accent || "var(--text-primary)",
      }}>
        {value}
      </span>
    </div>
  );
}

export default function SubmittalForecastCard({ forecast }) {
  if (!forecast || !forecast.forecastable) return null;
  const cfg = RISK_CFG[forecast.risk] || RISK_CFG.low;
  const daysOut = typeof forecast.daysOut === "number" ? forecast.daysOut : null;
  // When the estimate rests on too little history (lowConfidence), mark the dates
  // approximate + mute the accent — a confident-looking ETA off 1–2 reviews is
  // worse than an honest "rough estimate".
  const approx = !!forecast.lowConfidence;
  const showDate = (d) => {
    const s = formatDate(d);
    if (!s) return "—";
    return approx ? `~${s}` : s;
  };
  const dateAccent = approx ? "var(--text-secondary)" : cfg.color;

  return (
    <div style={{
      border: `1px solid ${cfg.border}`,
      background: cfg.bg,
      borderRadius: 8,
      padding: "12px 14px",
    }}>
      {/* Risk header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: cfg.color,
        }}>
          {forecast.label}
        </span>
        {daysOut != null && (
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 700,
            color: "var(--text-muted)",
          }}>
            {daysOut < 0 ? "sent in future" : `${daysOut}d out for review`}
          </span>
        )}
      </div>

      {/* Forecast metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Metric label="Expected back" value={showDate(forecast.expectedReturn)} accent={dateAccent} />
        <Metric label="Worst case" value={showDate(forecast.worstCaseReturn)} />
        <Metric label="Required" value={forecast.required ? formatDate(forecast.required) : "—"} />
      </div>

      {/* Basis + confidence note — honest about thin history instead of
          presenting a 1–2-sample guess as an authoritative ETA. */}
      {approx ? (
        <div style={{
          marginTop: 10,
          fontFamily: "var(--font-mono)",
          fontSize: 8.5,
          color: "var(--status-warning)",
          letterSpacing: "0.03em",
          lineHeight: 1.5,
        }}>
          {forecast.basisCount > 0
            ? `⚠ Rough estimate — only ${forecast.basisCount} past review${forecast.basisCount === 1 ? "" : "s"} of history. Treat these dates as approximate.`
            : `⚠ No review history yet — these dates use a default ${forecast.cycleP50}-day cycle and are a rough placeholder.`}
        </div>
      ) : (
        <div style={{
          marginTop: 10,
          fontFamily: "var(--font-mono)",
          fontSize: 8.5,
          color: "var(--text-muted)",
          letterSpacing: "0.03em",
          lineHeight: 1.5,
        }}>
          Est. cycle {forecast.cycleP50}d (p75 {forecast.cycleP75}d) · based on {forecast.basis}
        </div>
      )}
      {forecast.fabImpact && (
        <div style={{
          marginTop: 6,
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          fontWeight: 700,
          color: cfg.color,
          letterSpacing: "0.03em",
        }}>
          ⚠ A late return threatens the linked fabrication package(s).
        </div>
      )}
    </div>
  );
}
