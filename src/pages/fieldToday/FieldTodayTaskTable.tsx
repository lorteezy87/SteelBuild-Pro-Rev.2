import { useMemo } from "react";
import PhaseBadge from "@/components/field/PhaseBadge";
import { DataTable, Pill, type Column } from "@/components/command";
import { PROGRESS_STEPS } from "@/lib/field/fieldToday";
import {
  URGENCY_DISPLAY,
  type FieldTaskRow,
  type ScheduleTaskRecord,
} from "./fieldTodayControlCenter.derive";

function urgencyTone(bucket: string): import("@/components/command").PillTone {
  switch (bucket) {
    case "overdue": return "danger";
    case "due-today": return "warn";
    case "active": return "good";
    case "upcoming": return "info";
    default: return "neutral";
  }
}

function statusTone(status: string): import("@/components/command").PillTone {
  if (status === "Complete") return "good";
  if (status === "In Progress") return "info";
  return "neutral";
}

interface ProgressButtonsProps {
  row: FieldTaskRow;
  saving: boolean;
  onSetProgress: (task: ScheduleTaskRecord, pct: number) => void;
}

function ProgressButtons({ row, saving, onSetProgress }: ProgressButtonsProps) {
  const accentColor = URGENCY_DISPLAY[row.urgencyBucket]?.color ?? "var(--accent)";
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "nowrap" }}>
      {PROGRESS_STEPS.map((step) => {
        const active = row.pct === step;
        return (
          <button
            key={step}
            type="button"
            disabled={saving}
            onClick={(event) => {
              event.stopPropagation();
              onSetProgress(row._task, step);
            }}
            aria-pressed={active}
            aria-label={step === 100 ? "Set progress complete" : `Set progress ${step}%`}
            style={{
              minHeight: 40,
              minWidth: 40,
              borderRadius: 6,
              border: `1px solid ${active ? accentColor : "var(--cmd-border)"}`,
              background: active
                ? `color-mix(in srgb, ${accentColor} 18%, var(--cmd-surface))`
                : "var(--cmd-surface)",
              color: active ? accentColor : "var(--cmd-text-muted)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 800,
              cursor: saving ? "wait" : "pointer",
              padding: "0 6px",
              flexShrink: 0,
            }}
          >
            {step === 100 ? "Done" : step}
          </button>
        );
      })}
    </div>
  );
}

export interface FieldTodayTaskTableProps {
  rows: FieldTaskRow[];
  savingTaskId?: string | null;
  onSetProgress: (task: ScheduleTaskRecord, pct: number) => void;
}

export default function FieldTodayTaskTable({
  rows,
  savingTaskId,
  onSetProgress,
}: FieldTodayTaskTableProps) {
  const columns = useMemo<Column<FieldTaskRow>[]>(() => [
    {
      key: "time",
      header: "Due Date",
      render: (row) => <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{row.time}</span>,
    },
    {
      key: "activity",
      header: "Activity",
      render: (row) => <span style={{ fontWeight: 600 }}>{row.activity}</span>,
    },
    {
      key: "phase",
      header: "Phase",
      render: (row) => <PhaseBadge phase={row.phase} source={row.phaseSource} />,
    },
    {
      key: "location",
      header: "Location",
      render: (row) => row.location || <span style={{ color: "var(--cmd-text-muted)" }}>—</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <Pill tone={statusTone(row.status)}>{row.status}</Pill>,
    },
    {
      key: "urgency",
      header: "Urgency",
      render: (row) => (
        <Pill tone={urgencyTone(row.urgencyBucket)}>
          {URGENCY_DISPLAY[row.urgencyBucket]?.label ?? row.urgencyBucket}
        </Pill>
      ),
    },
    {
      key: "progress",
      header: "Progress",
      render: (row) => (
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 180 }}>
          <div style={{ flex: 1, height: 6, borderRadius: 999, background: "var(--cmd-border)", overflow: "hidden", minWidth: 40 }}>
            <div
              style={{
                width: "100%",
                height: "100%",
                background: URGENCY_DISPLAY[row.urgencyBucket]?.color ?? "var(--accent)",
                transform: `scaleX(${row.pct / 100})`,
                transformOrigin: "left",
                transition: "transform 120ms ease",
              }}
            />
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 800, minWidth: 30, textAlign: "right", color: "var(--cmd-text)" }}>
            {row.pct}%
          </span>
        </div>
      ),
    },
    {
      key: "quickset",
      header: "Quick Set",
      render: (row) => (
        <ProgressButtons
          row={row}
          saving={savingTaskId === row.id}
          onSetProgress={onSetProgress}
        />
      ),
    },
    {
      key: "nextAction",
      header: "Next Action",
      render: (row) => <span style={{ color: "var(--cmd-text-muted)", fontSize: 12 }}>{row.nextAction}</span>,
    },
    {
      key: "reportedBy",
      header: "Crew",
      render: (row) => row.reportedBy || <span style={{ color: "var(--cmd-text-muted)" }}>—</span>,
    },
  ], [onSetProgress, savingTaskId]);

  return (
    <DataTable
      columns={columns}
      rows={rows}
      onRowClick={undefined}
      emptyMessage="No tasks match your filters."
    />
  );
}
