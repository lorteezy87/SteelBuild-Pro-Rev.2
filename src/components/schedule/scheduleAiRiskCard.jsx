/**
 * scheduleAiRiskCard - the "Schedule AI" risk card sub-component of the Rivet
 * brief, extracted verbatim from ScheduleRivetBrief.jsx (behavior-preserving).
 * Self-contained presentational card (its own riskTone + aiRisk* styles); the
 * only shared styles it borrows are taskNameStyle / emptyStyle.
 */
import { taskNameStyle, emptyStyle } from "@/components/schedule/rivetBriefStyles";
import {
  riskTone,
  aiRiskPanelStyle,
  AI_RISK_HEADER_STYLE as aiRiskHeaderStyle,
  AI_RISK_EYEBROW_STYLE as aiRiskEyebrowStyle,
  AI_RISK_TITLE_STYLE as aiRiskTitleStyle,
  aiRiskDelayStyle,
  aiRiskScoreStyle,
  AI_RISK_SUMMARY_STYLE as aiRiskSummaryStyle,
  AI_RISK_COLUMNS_STYLE as aiRiskColumnsStyle,
  AI_RISK_SECTION_STYLE as aiRiskSectionStyle,
  AI_RISK_SECTION_TITLE_STYLE as aiRiskSectionTitleStyle,
  AI_RISK_TASK_STYLE as aiRiskTaskStyle,
  AI_RISK_TEXT_STYLE as aiRiskTextStyle,
  AI_RISK_LIST_STYLE as aiRiskListStyle,
  AI_RISK_LIST_ITEM_STYLE as aiRiskListItemStyle,
  AI_RISK_FOOTER_STYLE as aiRiskFooterStyle,
} from "@/components/schedule/scheduleAiRiskCardHelpers";

export function ScheduleAiRiskCard({ insight }) {
  if (!insight) return null;

  const tone = riskTone(insight.riskLevel);

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
