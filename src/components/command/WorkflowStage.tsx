import type { ReactNode } from "react";

export type WorkflowStageState = "complete" | "current" | "blocked" | "upcoming";

export interface WorkflowStageItem {
  id: string;
  label: ReactNode;
  state?: WorkflowStageState;
  detail?: ReactNode;
}

export interface WorkflowStageProps {
  stages: WorkflowStageItem[];
  currentStage?: string | null;
  compact?: boolean;
  ariaLabel?: string;
}

const STATE_LABEL: Record<WorkflowStageState, string> = {
  complete: "Complete",
  current: "Current",
  blocked: "Blocked",
  upcoming: "Upcoming",
};

const STATE_CLASS: Record<WorkflowStageState, string> = {
  complete: "cmd-chip--good",
  current: "cmd-chip--gold",
  blocked: "cmd-chip--danger",
  upcoming: "",
};

export function WorkflowStage({
  stages,
  currentStage,
  compact = false,
  ariaLabel = "Workflow stages",
}: WorkflowStageProps) {
  return (
    <ol
      aria-label={ariaLabel}
      className="sbp-workflow-stage"
      style={{ display: "flex", flexWrap: "wrap", gap: compact ? 5 : 8, listStyle: "none", margin: 0, padding: 0 }}
    >
      {stages.map((stage) => {
        const state = stage.state ?? (stage.id === currentStage ? "current" : "upcoming");
        return (
          <li
            key={stage.id}
            data-stage-state={state}
            aria-current={state === "current" ? "step" : undefined}
            className={`cmd-chip ${STATE_CLASS[state]}`.trim()}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: compact ? 26 : 30 }}
          >
            <span style={{ fontWeight: 750 }}>{stage.label}</span>
            <span className="cmd-row__meta">{STATE_LABEL[state]}</span>
            {stage.detail ? <span className="cmd-row__meta">{stage.detail}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
