/**
 * DailyCoverage — field days in the last five working days that have no daily
 * report, with a one-click "File it" that opens the form on that date.
 *
 * Renders nothing until the schedule has loaded: an unloaded schedule is not
 * evidence that no field work happened.
 */
import { useMemo } from "react";
import type { ComponentType, PropsWithChildren } from "react";
import { Button as ButtonRaw } from "@/components/design-system";
import { missingDailyReports } from "@/lib/fieldOversight";
import type { DailyLogLike, DeliveryLike, IsoDate, ScheduleTaskLike } from "@/lib/fieldOversight";
import type { WorkingCalendar } from "@/lib/schedule/workingCalendar";
import "@/styles/field-oversight.css";

const Button = ButtonRaw as unknown as ComponentType<PropsWithChildren<Record<string, unknown>>>;

export interface DailyCoverageProps {
  ready: boolean;
  tasks: readonly ScheduleTaskLike[];
  deliveries: readonly DeliveryLike[];
  logs: readonly DailyLogLike[];
  today: IsoDate;
  calendar: WorkingCalendar;
  onFile: ((date: IsoDate) => void) | null;
}

function longDay(iso: IsoDate): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export function DailyCoverage({ ready, tasks, deliveries, logs, today, calendar, onFile }: DailyCoverageProps) {
  const missing = useMemo(
    () => (ready ? missingDailyReports({ tasks, deliveries, logs, today, calendar }) : []),
    [ready, tasks, deliveries, logs, today, calendar],
  );
  if (!missing.length) return null;
  return (
    <section className="fo-missing" aria-label="Missing daily reports">
      <div className="fo-missing__head">
        <h2>{missing.length} field day{missing.length === 1 ? "" : "s"} without a daily report</h2>
        <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Last five working days · erection or deliveries on the schedule</span>
      </div>
      {missing.map((m) => (
        <div className="fo-missing__row" key={m.date}>
          <b>{longDay(m.date)}</b>
          <span>{m.reasons.join(" · ")}</span>
          {onFile ? (
            <Button variant="secondary" onClick={() => onFile(m.date)} aria-label={`File the daily report for ${longDay(m.date)}`}>File it</Button>
          ) : <span />}
        </div>
      ))}
    </section>
  );
}
