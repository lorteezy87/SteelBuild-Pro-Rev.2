/**
 * scheduleAiRiskCard - the "Schedule AI" risk card sub-component of the Rivet
 * brief, extracted verbatim from ScheduleRivetBrief.jsx (behavior-preserving).
 * Self-contained presentational card (its own riskTone + aiRisk* styles); the
 * only shared styles it borrows are taskNameStyle / emptyStyle.
 */
import { taskNameStyle, emptyStyle } from "@/components/schedule/rivetBriefStyles";

function riskTone(level) {
  if (level === "HIGH") return "var(--status-error)";
  if (level === "MEDIUM") return "var(--status-warning)";
  return "var(--status-success)";
}

export function ScheduleAiRiskCard({ insight }) {
  if (!insight) return null;

  const tone = riskTone(insight.riskLevel);

  function aiRiskPanelStyle(tone) {
    return {
      gridColumn: "span 6",
      border: `1px solid color-mix(in srgb, ${tone} 34%, var(--border-default))`,
      borderRadius: 16,
      background: `linear-gradient(135deg, color-mix(in srgb, ${tone} 10%, rgba(255,255,255,0.035)), rgba(255,255,255,0.025))`,
      boxShadow: `inset 3px 0 0 ${tone}, 0 16px 34px rgba(0,0,0,0.18)`,
      padding: 14,
    };
  }

  const aiRiskHeaderStyle = {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
    marginBottom: 10,
  };

  const aiRiskEyebrowStyle = {
    fontFamily: "var(--font-mono)",
    fontSize: 9,
    fontWeight: 900,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "var(--status-info)",
  };

  const aiRiskTitleStyle = {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-primary)",
  };

  function aiRiskDelayStyle(tone) {
    return {
      display: "inline-flex",
      alignItems: "center",
      minHeight: 22,
      padding: "0 8px",
      borderRadius: 999,
      border: `1px solid color-mix(in srgb, ${tone} 42%, transparent)`,
      background: `color-mix(in srgb, ${tone} 12%, transparent)`,
      color: tone,
      whiteSpace: "nowrap",
    };
  }

  function aiRiskScoreStyle(tone) {
    return {
      width: 48,
      height: 48,
      borderRadius: 14,
      display: "grid",
      placeItems: "center",
      border: `1px solid color-mix(in srgb, ${tone} 45%, transparent)`,
      background: `color-mix(in srgb, ${tone} 12%, var(--bg-surface-high))`,
      color: tone,
      fontFamily: "var(--font-mono)",
      fontSize: 13,
      fontWeight: 900,
      flexShrink: 0,
    };
  }

  const aiRiskSummaryStyle = {
    margin: "0 0 12px",
    color: "var(--text-secondary)",
    fontFamily: "var(--font-body)",
    fontSize: 13,
    lineHeight: 1.48,
  };

  const aiRiskColumnsStyle = {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.35fr) minmax(0, 1fr) minmax(0, 1fr)",
    gap: 10,
    alignItems: "stretch",
  };

  const aiRiskSectionStyle = {
    border: "1px solid var(--border-default)",
    borderRadius: 12,
    background: "rgba(255,255,255,0.025)",
    padding: 11,
    minWidth: 0,
  };

  const aiRiskSectionTitleStyle = {
    fontFamily: "var(--font-mono)",
    fontSize: 8,
    fontWeight: 900,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 8,
  };

  const aiRiskTaskStyle = {
    borderTop: "1px solid var(--border-default)",
    paddingTop: 8,
  };

  const aiRiskTextStyle = {
    marginTop: 5,
    fontFamily: "var(--font-body)",
    fontSize: 12,
    lineHeight: 1.38,
    color: "var(--text-secondary)",
  };

  const aiRiskListStyle = {
    margin: 0,
    paddingLeft: 17,
    display: "grid",
    gap: 7,
  };

  const aiRiskListItemStyle = {
    fontFamily: "var(--font-body)",
    fontSize: 12,
    lineHeight: 1.38,
    color: "var(--text-secondary)",
  };

  const aiRiskFooterStyle = {
    marginTop: 10,
    paddingTop: 9,
    borderTop: "1px solid var(--border-default)",
    fontFamily: "var(--font-mono)",
    fontSize: 8,
    fontWeight: 800,
    letterSpacing: "0.10em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  };

  return (
    <div style={aiRiskPanelStyle(tone)}>
      <div style={aiRiskHeaderStyle}>
        <div style={{ minWidth: 0 }}>
          <div style={aiRiskEyebrowStyle}>Schedule AI - Planning Engine</div>
          <div style={aiRiskTitleStyle}>
            <span>RISK: {insight.riskLevel}</span>
            <span style={aiRiskDelayStyle(tone)}>+{insight.forecastDelayDays}d forecast pressure</span>
          </div>
        </div>
        <div style={aiRiskScoreStyle(tone)}>{insight.riskScore}%</div>
      </div>

      <p style={aiRiskSummaryStyle}>{insight.summary}</p>

      <div style={aiRiskColumnsStyle}>
        <div style={aiRiskSectionStyle}>
          <div style={aiRiskSectionTitleStyle}>At-Risk Tasks ({insight.atRisk.length})</div>
          <div style={{ display: "grid", gap: 9 }}>
            {insight.atRisk.length ? insight.atRisk.map((entry) => (
              <div key={entry.task?.id || entry.label} style={aiRiskTaskStyle}>
                <div style={taskNameStyle}>{entry.label}</div>
                <div style={aiRiskTextStyle}><strong>Why:</strong> {entry.why}</div>
                <div style={aiRiskTextStyle}><strong>Fix:</strong> {entry.fix}</div>
              </div>
            )) : (
              <div style={emptyStyle}>No dated critical task risk is currently visible.</div>
            )}
          </div>
        </div>

        <div style={aiRiskSectionStyle}>
          <div style={aiRiskSectionTitleStyle}>Blockers</div>
          <ul style={aiRiskListStyle}>
            {(insight.blockers.length ? insight.blockers : ["No explicit blocker is visible from current schedule data."]).map((item) => (
              <li key={item} style={aiRiskListItemStyle}>{item}</li>
            ))}
          </ul>
        </div>

        <div style={aiRiskSectionStyle}>
          <div style={aiRiskSectionTitleStyle}>Sequence Suggestions</div>
          <ol style={aiRiskListStyle}>
            {(insight.sequenceSuggestions.length ? insight.sequenceSuggestions : ["Keep monitoring the 14-day handoff and update dates as work firms up."]).map((item) => (
              <li key={item} style={aiRiskListItemStyle}>{item}</li>
            ))}
          </ol>
        </div>
      </div>

      <div style={aiRiskFooterStyle}>
        Model: {insight.modelLabel} - Analyzed: {insight.analyzedAt}
      </div>
    </div>
  );
}
