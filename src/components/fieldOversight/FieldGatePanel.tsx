/**
 * FieldGatePanel — Command Center's erector view: the ten-working-day Schedule
 * Core ring beside the field findings (site readiness, delay notices, missing
 * dailies, weather exposure), plus a paste-ready field brief.
 *
 * Pure presentation over src/lib/fieldOversight; the page owns every query.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  buildFieldBrief, deriveFieldSignals, deriveScheduleCore,
} from "@/lib/fieldOversight";
import type {
  DailyLogLike, DelayRecord, DeliveryLike, FieldSignal, IsoDate, ProjectLike, ReadinessRecord,
  ScheduleTaskLike, WeatherRiskLike,
} from "@/lib/fieldOversight";
import type { WorkingCalendar } from "@/lib/schedule/workingCalendar";
import { ScheduleCoreRing } from "./ScheduleCoreRing";
import { CopyTextModal } from "./CopyTextModal";
import "@/styles/field-oversight.css";

export interface FieldGatePanelProps {
  project: ProjectLike | null;
  readiness: readonly ReadinessRecord[];
  delays: readonly DelayRecord[];
  tasks: readonly ScheduleTaskLike[];
  deliveries: readonly DeliveryLike[];
  logs: readonly DailyLogLike[];
  /** Null while loading or when the project has no locatable address. */
  weather: readonly WeatherRiskLike[] | null;
  calendar: WorkingCalendar;
  today: IsoDate;
  noticeWindowDays: number;
}

function targetUrl(signal: FieldSignal): string {
  const base = createPageUrl(signal.target.page);
  if (signal.target.page === "DailyLogs" && signal.target.date) return `${base}?new_date=${signal.target.date}`;
  if (signal.target.id) return `${base}?id=${encodeURIComponent(signal.target.id)}`;
  return base;
}

export function FieldGatePanel(props: FieldGatePanelProps) {
  const { project, readiness, delays, tasks, deliveries, logs, weather, calendar, today, noticeWindowDays } = props;
  const navigate = useNavigate();
  const [briefOpen, setBriefOpen] = useState(false);

  const signals = useMemo(
    () => deriveFieldSignals({ readiness, delays, tasks, deliveries, logs, weather, today, calendar, noticeWindowDays }),
    [readiness, delays, tasks, deliveries, logs, weather, today, calendar, noticeWindowDays],
  );
  const core = useMemo(
    () => deriveScheduleCore({ readiness, tasks, deliveries, weather, today, calendar }),
    [readiness, tasks, deliveries, weather, today, calendar],
  );
  const critical = signals.filter((s) => s.severity === "critical").length;
  const warning = signals.length - critical;
  const tone = critical ? "is-critical" : warning ? "is-warning" : "is-clear";
  const brief = useMemo(
    () => buildFieldBrief({ project, signals, core, today, weatherKnown: weather !== null }),
    [project, signals, core, today, weather],
  );

  return (
    <section className="fo-panel" aria-label="Field gate">
      <div className="fo-panel__head">
        <h2>Field gate · next 10 working days</h2>
        <div className="fo-panel__actions">
          <button type="button" className="cmd-btn" onClick={() => navigate(createPageUrl("SiteReadiness"))}>Site readiness</button>
          <button type="button" className="cmd-btn" onClick={() => navigate(createPageUrl("DelayLog"))}>Delay log</button>
          <button type="button" className="cmd-btn cmd-btn--primary" onClick={() => setBriefOpen(true)}>Field brief</button>
        </div>
      </div>
      <div className="fo-gate">
        <div className="fo-gate__core">
          <ScheduleCoreRing
            days={core}
            ariaLabel={`Schedule core: ${core.filter((d) => d.tone === "critical").length} critical and ${core.filter((d) => d.tone === "warning").length} watch days in the next ten working days`}
          />
          <div className="fo-gate__read" aria-hidden="true">
            <div>
              <div className={`fo-gate__num ${tone}`}>{critical || warning || "OK"}</div>
              <div className="fo-gate__cap">{critical ? "Critical" : warning ? "To watch" : "Gate clear"}</div>
            </div>
          </div>
          <div className="fo-gate__legend">
            <span><i className="is-critical" />Blocked</span>
            <span><i className="is-warning" />Watch</span>
            <span><i className="is-clear" />Ready</span>
            <span><i className="is-empty" />Nothing on site</span>
          </div>
          {weather === null ? (
            <div className="fo-gate__legend">Forecast unavailable — weather not checked</div>
          ) : null}
        </div>
        <div className="fo-signals" role="list" aria-label="Field findings">
          {signals.length === 0 ? (
            <div className="fo-empty" role="listitem">
              No field findings. Readiness checklists, delay notices and daily reports are current for the next ten working days.
            </div>
          ) : signals.slice(0, 12).map((s) => (
            <button
              type="button"
              role="listitem"
              key={s.id}
              className={`fo-signal is-${s.severity}`}
              onClick={() => navigate(targetUrl(s))}
              aria-label={`${s.severity} ${s.title}. ${s.action}`}
            >
              <span className="fo-signal__code">{s.code}</span>
              <span>
                <span className="fo-signal__title">{s.title}</span>
                <span className="fo-signal__detail" style={{ display: "block" }}>{s.detail}</span>
              </span>
              <span className="fo-signal__action">{s.action} →</span>
            </button>
          ))}
        </div>
      </div>
      <CopyTextModal
        open={briefOpen}
        title="Field brief"
        eyebrow={[project?.project_number, project?.name].filter(Boolean).join(" · ")}
        text={brief}
        onClose={() => setBriefOpen(false)}
      />
    </section>
  );
}
