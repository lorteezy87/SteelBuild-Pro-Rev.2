import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { PHASES } from "@/utils/phases";
import type { PlannerActionCreate } from "@planner/data/actionRepository";
import type { ScheduleActivityCreate } from "@planner/data/scheduleRepository";

export type PlannerProjectOption = { id: string; name: string };
type RecordKind = "" | "action" | "schedule";
type NewTaskDialogProps = {
  isOpen: boolean;
  projects: readonly PlannerProjectOption[];
  onClose: () => void;
  onCreateAction: (payload: PlannerActionCreate) => Promise<unknown> | void;
  onCreateScheduleActivity: (payload: ScheduleActivityCreate) => Promise<unknown> | void;
};

const ACTION_PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;
const ACTION_STATUSES = ["Open", "In Progress", "Complete", "Cancelled", "Resolved", "Closed"] as const;
const SCHEDULE_STATUSES = ["Not Started", "In Progress", "Complete", "On Hold", "Delayed"] as const;
const SOURCE_TYPES = ["rfi", "submittal", "drawing_set", "change_order", "work_package", "delivery", "schedule_task", "meeting"] as const;

const modulePhases: unknown = PHASES;
if (!Array.isArray(modulePhases) || modulePhases.length === 0 || modulePhases.some((phase) => typeof phase !== "string" || !phase.trim())) {
  throw new Error("Planner schedule phases must be a non-empty string list.");
}
const CANONICAL_PHASES = new Set(modulePhases);
const CANONICAL_PHASE_LIST = modulePhases as readonly string[];

function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function optionalDate(value: string): string | undefined {
  return value || undefined;
}

function assertActionPayload(values: ActionValues): PlannerActionCreate {
  const projectId = values.projectId.trim();
  const title = values.title.trim();
  if (!projectId || !title) throw new Error("Project and title are required.");
  if (!ACTION_PRIORITIES.includes(values.priority)) throw new Error("Choose an allowed priority.");
  if (!ACTION_STATUSES.includes(values.status)) throw new Error("Choose an allowed status.");
  const sourceType = optionalText(values.sourceType);
  const sourceId = optionalText(values.sourceId);
  if (Boolean(sourceType) !== Boolean(sourceId)) throw new Error("Source type and Source ID must be provided together.");
  if (sourceType && !SOURCE_TYPES.includes(sourceType as typeof SOURCE_TYPES[number])) throw new Error("Choose an allowed source type.");
  return {
    project_id: projectId,
    title,
    priority: values.priority,
    status: values.status,
    description: optionalText(values.description),
    workstream: optionalText(values.workstream),
    action_date: optionalDate(values.actionDate),
    follow_up_date: optionalDate(values.followUpDate),
    due_date: optionalDate(values.dueDate),
    impact_date: optionalDate(values.impactDate),
    assigned_user_id: optionalText(values.owner),
    waiting_on: optionalText(values.waitingOn),
    ...(sourceType && sourceId ? { source_entity_type: sourceType, source_entity_id: sourceId } : {}),
  };
}

function assertSchedulePayload(values: ScheduleValues): ScheduleActivityCreate {
  const projectId = values.projectId.trim();
  const taskName = values.taskName.trim();
  if (!projectId || !taskName || !values.startDate || !values.endDate || !values.phase) {
    throw new Error("Project, task name, phase, start date, and end date are required.");
  }
  if (!CANONICAL_PHASES.has(values.phase)) throw new Error("Choose a canonical Planner phase.");
  if (values.endDate < values.startDate) throw new Error("End date cannot be before start date.");
  if (!SCHEDULE_STATUSES.includes(values.status)) throw new Error("Choose an allowed schedule status.");
  const percentComplete = Number(values.percentComplete);
  if (!Number.isFinite(percentComplete) || percentComplete < 0 || percentComplete > 100) throw new Error("Percent complete must be between 0 and 100.");
  return {
    project_id: projectId,
    task_name: taskName,
    phase: values.phase,
    start_date: values.startDate,
    end_date: values.endDate,
    status: values.status,
    percent_complete: percentComplete,
    notes: optionalText(values.notes),
  };
}

type ActionValues = {
  projectId: string; title: string; description: string; priority: typeof ACTION_PRIORITIES[number]; status: typeof ACTION_STATUSES[number];
  workstream: string; actionDate: string; followUpDate: string; dueDate: string; impactDate: string; owner: string; waitingOn: string; sourceType: string; sourceId: string;
};
type ScheduleValues = { projectId: string; taskName: string; phase: string; startDate: string; endDate: string; status: typeof SCHEDULE_STATUSES[number]; percentComplete: string; notes: string };
const INITIAL_ACTION: ActionValues = { projectId: "", title: "", description: "", priority: "Medium", status: "Open", workstream: "", actionDate: "", followUpDate: "", dueDate: "", impactDate: "", owner: "", waitingOn: "", sourceType: "", sourceId: "" };
const INITIAL_SCHEDULE: ScheduleValues = { projectId: "", taskName: "", phase: "", startDate: "", endDate: "", status: "Not Started", percentComplete: "0", notes: "" };

export default function NewTaskDialog({ isOpen, projects, onClose, onCreateAction, onCreateScheduleActivity }: NewTaskDialogProps) {
  const [kind, setKind] = useState<RecordKind>("");
  const [actionValues, setActionValues] = useState<ActionValues>(INITIAL_ACTION);
  const [scheduleValues, setScheduleValues] = useState<ScheduleValues>(INITIAL_SCHEDULE);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const recordKindRef = useRef<HTMLSelectElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const online = isOnline();
  useEffect(() => {
    if (!isOpen) return undefined;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    recordKindRef.current?.focus();
    return () => openerRef.current?.focus();
  }, [isOpen]);
  if (!isOpen) return null;

  const close = () => { onClose(); openerRef.current?.focus(); };
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && !isSaving) { event.preventDefault(); close(); return; }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const elements = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])')];
    if (!elements.length) return;
    const first = elements[0]; const last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  const updateAction = (field: keyof ActionValues) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setActionValues((current) => ({ ...current, [field]: event.target.value }));
  const updateSchedule = (field: keyof ScheduleValues) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setScheduleValues((current) => ({ ...current, [field]: event.target.value }));
  const submit = async () => {
    if (!online || !kind) return;
    setError(null);
    try {
      setIsSaving(true);
      if (kind === "action") await onCreateAction(assertActionPayload(actionValues));
      else await onCreateScheduleActivity(assertSchedulePayload(scheduleValues));
      setKind(""); setActionValues(INITIAL_ACTION); setScheduleValues(INITIAL_SCHEDULE); close();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Unable to create this Planner record.");
    } finally { setIsSaving(false); }
  };

  return (
    <section ref={dialogRef} className="planner-action-drawer" aria-labelledby="planner-new-task-heading" role="dialog" aria-modal="true" onKeyDown={handleKeyDown}>
      <div className="planner-action-drawer__header"><h2 id="planner-new-task-heading">New Planner record</h2><button className="planner-button" type="button" onClick={close}>Close</button></div>
      <label>Record kind<select ref={recordKindRef} aria-label="Record kind" value={kind} onChange={(event) => { setKind(event.target.value as RecordKind); setError(null); }}><option value="">Choose record kind</option><option value="action">Operational Action</option><option value="schedule">Schedule Activity</option></select></label>
      {!kind && <p>Choose a record kind to begin.</p>}
      {kind === "action" && <div className="planner-action-fields">
        <ProjectSelect projects={projects} value={actionValues.projectId} onChange={updateAction("projectId")} />
        <Field label="Title" value={actionValues.title} onChange={updateAction("title")} />
        <SelectField label="Priority" value={actionValues.priority} values={ACTION_PRIORITIES} onChange={updateAction("priority")} />
        <SelectField label="Status" value={actionValues.status} values={ACTION_STATUSES} onChange={updateAction("status")} />
        <Field label="Workstream" value={actionValues.workstream} onChange={updateAction("workstream")} />
        <Field label="Action date" type="date" value={actionValues.actionDate} onChange={updateAction("actionDate")} />
        <Field label="Follow-up date" type="date" value={actionValues.followUpDate} onChange={updateAction("followUpDate")} />
        <Field label="Required date" type="date" value={actionValues.dueDate} onChange={updateAction("dueDate")} />
        <Field label="Impact date" type="date" value={actionValues.impactDate} onChange={updateAction("impactDate")} />
        <Field label="Owner" value={actionValues.owner} onChange={updateAction("owner")} />
        <Field label="Waiting on" value={actionValues.waitingOn} onChange={updateAction("waitingOn")} />
        <SelectField label="Source type" value={actionValues.sourceType} values={SOURCE_TYPES} onChange={updateAction("sourceType")} allowBlank />
        <Field label="Source ID" value={actionValues.sourceId} onChange={updateAction("sourceId")} />
        <label>Description<textarea aria-label="Description" value={actionValues.description} onChange={updateAction("description")} /></label>
      </div>}
      {kind === "schedule" && <div className="planner-action-fields">
        <ProjectSelect projects={projects} value={scheduleValues.projectId} onChange={updateSchedule("projectId")} />
        <Field label="Task name" value={scheduleValues.taskName} onChange={updateSchedule("taskName")} />
        <SelectField label="Phase" value={scheduleValues.phase} values={CANONICAL_PHASE_LIST} onChange={updateSchedule("phase")} allowBlank />
        <Field label="Start date" type="date" value={scheduleValues.startDate} onChange={updateSchedule("startDate")} />
        <Field label="End date" type="date" value={scheduleValues.endDate} onChange={updateSchedule("endDate")} />
        <SelectField label="Schedule status" value={scheduleValues.status} values={SCHEDULE_STATUSES} onChange={updateSchedule("status")} />
        <Field label="Percent complete" type="number" value={scheduleValues.percentComplete} onChange={updateSchedule("percentComplete")} />
        <label>Notes<textarea aria-label="Notes" value={scheduleValues.notes} onChange={updateSchedule("notes")} /></label>
      </div>}
      {!online && <p role="alert">Creating Planner records requires an online connection.</p>}
      {error && <p role="alert">{error}</p>}
      {kind && <button className="planner-button planner-button--primary" type="button" disabled={!online || isSaving || projects.length === 0} onClick={() => void submit()}>{kind === "action" ? "Create action" : "Create schedule activity"}</button>}
    </section>
  );
}

function ProjectSelect({ projects, value, onChange }: { projects: readonly PlannerProjectOption[]; value: string; onChange: (event: ChangeEvent<HTMLSelectElement>) => void }) { return <label>Project<select aria-label="Project" value={value} onChange={onChange}><option value="">Choose project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>; }
function Field({ label, type = "text", value, onChange }: { label: string; type?: string; value: string; onChange: (event: ChangeEvent<HTMLInputElement>) => void }) { return <label>{label}<input aria-label={label} type={type} value={value} onChange={onChange} /></label>; }
function SelectField({ label, value, values, onChange, allowBlank = false }: { label: string; value: string; values: readonly string[]; onChange: (event: ChangeEvent<HTMLSelectElement>) => void; allowBlank?: boolean }) { return <label>{label}<select aria-label={label} value={value} onChange={onChange}>{allowBlank && <option value="">None</option>}{values.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select></label>; }
