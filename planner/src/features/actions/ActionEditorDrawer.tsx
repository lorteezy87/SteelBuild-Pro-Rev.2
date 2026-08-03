import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import type { PlannerActionRecord, PlannerActionUpdate } from "@planner/data/actionRepository";
import type { PlannerAuditEvent } from "@planner/data/auditRepository";
import DateChangeConfirmation, { type ConfirmedChange } from "./DateChangeConfirmation";
import ConflictResolutionPanel from "./ConflictResolutionPanel";

type EditableAction = PlannerActionRecord;
type ActionEditorDrawerProps = {
  action: EditableAction;
  isOpen: boolean;
  history?: readonly PlannerAuditEvent[];
  onClose: () => void;
  onSave: (patch: PlannerActionUpdate, expectedUpdatedAt: string) => Promise<unknown> | void;
  onArchive: (expectedUpdatedAt: string) => Promise<unknown> | void;
  onFetchCurrentAction?: (projectId: string, actionId: string) => Promise<PlannerActionRecord>;
};

type EditorValues = { title: string; priority: string; status: string; workstream: string; actionDate: string; followUpDate: string; dueDate: string; impactDate: string; owner: string; waitingOn: string; sourceType: string; sourceId: string; description: string };
type ConflictOperation = "save" | "archive";
const onlineSensitiveFields = new Set<keyof EditorValues>(["actionDate", "followUpDate", "dueDate", "impactDate", "owner", "sourceType", "sourceId"]);
const confirmationFields: Array<[keyof EditorValues, keyof PlannerActionUpdate, string]> = [["actionDate", "action_date", "Action date"], ["followUpDate", "follow_up_date", "Follow-up date"], ["dueDate", "due_date", "Required date"], ["impactDate", "impact_date", "Impact date"], ["owner", "assigned_user_id", "Owner"]];

function isOnline(): boolean { return typeof navigator === "undefined" || navigator.onLine !== false; }
function isPlannerConflict(error: unknown): boolean { return error instanceof Error && error.name === "PlannerConflictError"; }
function valueFromAction(action: EditableAction): EditorValues { return { title: action.title ?? "", priority: action.priority ?? "Medium", status: action.status ?? "Open", workstream: action.workstream ?? "", actionDate: action.action_date ?? "", followUpDate: action.follow_up_date ?? "", dueDate: action.due_date ?? "", impactDate: action.impact_date ?? "", owner: action.assigned_user_id ?? "", waitingOn: action.waiting_on ?? "", sourceType: action.source_entity_type ?? "", sourceId: action.source_entity_id ?? "", description: action.description ?? "" }; }
function nullableText(value: string): string | null { return value.trim() || null; }
function nullableDate(value: string): string | null { return value || null; }
function fieldPatch(field: keyof EditorValues, value: string): PlannerActionUpdate {
  switch (field) {
    case "title": return { title: value.trim() }; case "priority": return { priority: value }; case "status": return { status: value };
    case "workstream": return { workstream: nullableText(value) }; case "actionDate": return { action_date: nullableDate(value) }; case "followUpDate": return { follow_up_date: nullableDate(value) };
    case "dueDate": return { due_date: nullableDate(value) }; case "impactDate": return { impact_date: nullableDate(value) }; case "owner": return { assigned_user_id: nullableText(value) };
    case "waitingOn": return { waiting_on: nullableText(value) }; case "description": return { description: nullableText(value) };
    case "sourceType": return { source_entity_type: nullableText(value) }; case "sourceId": return { source_entity_id: nullableText(value) };
  }
}
function dirtyPatch(dirtyFields: ReadonlySet<keyof EditorValues>, values: EditorValues): PlannerActionUpdate {
  const patch: PlannerActionUpdate = {};
  for (const field of dirtyFields) Object.assign(patch, fieldPatch(field, values[field]));
  if (dirtyFields.has("sourceType") || dirtyFields.has("sourceId")) Object.assign(patch, { source_entity_type: nullableText(values.sourceType), source_entity_id: nullableText(values.sourceId) });
  return patch;
}
function rebaseValues(freshValues: EditorValues, userValues: EditorValues, dirtyFields: ReadonlySet<keyof EditorValues>): EditorValues {
  const rebasedValues = { ...freshValues };
  for (const field of dirtyFields) rebasedValues[field] = userValues[field];
  return rebasedValues;
}
function changesForConfirmation(original: EditorValues, proposed: EditorValues, dirtyFields: ReadonlySet<keyof EditorValues>): ConfirmedChange[] { return confirmationFields.flatMap(([field, , label]) => !dirtyFields.has(field) || original[field] === proposed[field] ? [] : [{ label, previousValue: original[field], nextValue: proposed[field] }]); }

export default function ActionEditorDrawer({ action, isOpen, history = [], onClose, onSave, onArchive, onFetchCurrentAction }: ActionEditorDrawerProps) {
  const [currentAction, setCurrentAction] = useState<EditableAction>(action);
  const [values, setValues] = useState<EditorValues>(() => valueFromAction(action));
  const [openedValues, setOpenedValues] = useState<EditorValues>(() => valueFromAction(action));
  const [dirtyFields, setDirtyFields] = useState<Set<keyof EditorValues>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [conflicted, setConflicted] = useState(false);
  const [conflictOperation, setConflictOperation] = useState<ConflictOperation>("save");
  const [isSaving, setIsSaving] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const baseline = valueFromAction(currentAction);
  const online = isOnline();
  useEffect(() => { const initialValues = valueFromAction(action); setCurrentAction(action); setValues(initialValues); setOpenedValues(initialValues); setDirtyFields(new Set()); setError(null); setConfirming(false); setConflicted(false); }, [action]);
  useEffect(() => { if (!isOpen) return undefined; openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; closeRef.current?.focus(); return () => openerRef.current?.focus(); }, [isOpen]);
  if (!isOpen) return null;

  const close = () => { onClose(); openerRef.current?.focus(); };
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (confirming) return;
    if (event.key === "Escape" && !isSaving) { event.preventDefault(); close(); return; }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const elements = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])')];
    if (!elements.length) return;
    const first = elements[0]; const last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  const update = (field: keyof EditorValues) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => { const nextValue = event.target.value; setValues((current) => ({ ...current, [field]: nextValue })); setDirtyFields((current) => { const next = new Set(current); if (nextValue === openedValues[field]) next.delete(field); else next.add(field); return next; }); };
  const confirmationChanges = changesForConfirmation(baseline, values, dirtyFields);
  const requiresOnline = [...dirtyFields].some((field) => onlineSensitiveFields.has(field));
  const save = async () => {
    if (requiresOnline && !online) { setError("Changing Planner dates, ownership, or source links requires an online connection."); return; }
    if (!values.title.trim()) { setError("Title is required."); return; }
    if (Boolean(values.sourceType.trim()) !== Boolean(values.sourceId.trim())) { setError("Source type and Source ID must be provided together."); return; }
    if (confirmationChanges.length > 0) { setConfirming(true); return; }
    await persist();
  };
  const persist = async () => {
    setError(null); setIsSaving(true); setConfirming(false);
    try { const patch = dirtyPatch(dirtyFields, values); await onSave(patch, currentAction.updated_at); setCurrentAction((current) => ({ ...current, ...patch })); setOpenedValues(values); setDirtyFields(new Set()); close(); }
    catch (saveError) { if (isPlannerConflict(saveError)) await recoverConflict("save"); else setError(saveError instanceof Error ? saveError.message : "Unable to save this action."); }
    finally { setIsSaving(false); }
  };
  const recoverConflict = async (operation: ConflictOperation) => {
    if (!onFetchCurrentAction) { setError("This record changed, but the current server value could not be loaded."); return; }
    try {
      const freshAction = await onFetchCurrentAction(currentAction.project_id, currentAction.id);
      setCurrentAction(freshAction);
      if (operation === "save") {
        const freshValues = valueFromAction(freshAction);
        setOpenedValues(freshValues);
        setValues(rebaseValues(freshValues, values, dirtyFields));
      }
      setConflictOperation(operation); setConflicted(true);
    }
    catch { setError("This record changed, but the current server value could not be loaded."); }
  };
  const archivePersist = async () => {
    setError(null); setIsSaving(true);
    try { await onArchive(currentAction.updated_at); close(); }
    catch (archiveError) { if (isPlannerConflict(archiveError)) await recoverConflict("archive"); else setError(archiveError instanceof Error ? archiveError.message : "Unable to archive this action."); }
    finally { setIsSaving(false); }
  };
  const archive = async () => {
    if (!online) { setError("Archiving a Planner action requires an online connection."); return; }
    if (!window.confirm("Archive this action? It will remain available in Archive and is not deleted.")) return;
    await archivePersist();
  };

  return <aside ref={dialogRef} className="planner-action-drawer" aria-labelledby="planner-action-editor-heading" role="dialog" aria-modal={confirming ? undefined : true} aria-hidden={confirming || undefined} onKeyDown={handleKeyDown}>
    <div className="planner-action-drawer__header"><h2 id="planner-action-editor-heading">Edit action</h2><button ref={closeRef} className="planner-button" type="button" onClick={close}>Close</button></div>
    <div className="planner-action-fields">
      <Field label="Title" value={values.title} onChange={update("title")} />
      <Field label="Priority" value={values.priority} onChange={update("priority")} />
      <Field label="Status" value={values.status} onChange={update("status")} />
      <Field label="Workstream" value={values.workstream} onChange={update("workstream")} />
      <Field label="Action date" type="date" value={values.actionDate} onChange={update("actionDate")} />
      <Field label="Follow-up date" type="date" value={values.followUpDate} onChange={update("followUpDate")} />
      <Field label="Required date" type="date" value={values.dueDate} onChange={update("dueDate")} />
      <Field label="Impact date" type="date" value={values.impactDate} onChange={update("impactDate")} />
      <Field label="Owner" value={values.owner} onChange={update("owner")} />
      <Field label="Waiting on" value={values.waitingOn} onChange={update("waitingOn")} />
      <Field label="Source type" value={values.sourceType} onChange={update("sourceType")} />
      <Field label="Source ID" value={values.sourceId} onChange={update("sourceId")} />
      <label>Description<textarea aria-label="Description" value={values.description} onChange={update("description")} /></label>
    </div>
    {requiresOnline && !online && <p role="alert">Changing Planner dates, ownership, or source links requires an online connection.</p>}
    {error && <p role="alert">{error}</p>}
    {confirming && <DateChangeConfirmation changes={confirmationChanges} onCancel={() => setConfirming(false)} onConfirm={() => void persist()} restoreFocusElement={saveRef.current} />}
    {conflicted && <ConflictResolutionPanel currentValue={conflictOperation === "archive" ? currentAction.status : baseline.dueDate} proposedValue={conflictOperation === "archive" ? "Archive this action" : values.dueDate} operation={conflictOperation} onDismiss={() => setConflicted(false)} onRetry={() => { setConflicted(false); if (conflictOperation === "archive") { if (window.confirm("Archive this action using the refreshed server version?")) void archivePersist(); } else if (confirmationChanges.length > 0) setConfirming(true); else void persist(); }} />}
    <div className="planner-action-panel__actions"><button ref={saveRef} className="planner-button planner-button--primary" type="button" disabled={isSaving} onClick={() => void save()}>Save changes</button><button className="planner-button" type="button" disabled={isSaving || !online} onClick={() => void archive()}>Archive action</button></div>
    <section aria-labelledby="planner-action-history-heading"><h3 id="planner-action-history-heading">History</h3>{history.length === 0 ? <p>No immutable Planner history is available for this project.</p> : <ol>{history.filter((event) => event.entity_id === currentAction.id).map((event) => <li key={event.id}>{event.event_type} — {event.occurred_at}</li>)}</ol>}</section>
  </aside>;
}

function Field({ label, type = "text", value, onChange }: { label: string; type?: string; value: string; onChange: (event: ChangeEvent<HTMLInputElement>) => void }) { return <label>{label}<input aria-label={label} type={type} value={value} onChange={onChange} /></label>; }
