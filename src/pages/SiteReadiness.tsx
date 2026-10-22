/**
 * Site Readiness — one checklist per erection sequence. A sequence with open
 * items raises an RD finding on Command Center's field gate as it comes inside
 * five working days, and is critical inside the 48-hour gate.
 *
 * Rows are `action_items` (category SITE_READINESS); see
 * src/lib/fieldOversight/readiness.ts for the storage contract.
 */
import { useEffect, useMemo, useState } from "react";
import type { ComponentType, PropsWithChildren } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { entities } from "@/api/supabaseClient";
import { useProjectId } from "@/hooks/useProjectId";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { useAppSecurity } from "@/components/shared/useAppSecurity";
import { usePermissions } from "@/services/permissions";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { invalidateEntity } from "@/services/cacheRegistry";
import { toUserErrorMessage, withProjectId } from "@/lib/mutations/standardMutation";
import { todayLocalISO } from "@/lib/dateMath";
import { useOrgName } from "@/pages/documentControl/BoardReportShell";
import { Modal as ModalRaw } from "@/components/design-system";
import DeleteDialogRaw from "@/components/shared/DeleteDialog";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { OperationalSummary, PageHeader, Pill, useCommandSkin } from "@/components/command";
import { CopyTextModal } from "@/components/fieldOversight/CopyTextModal";
import { useFieldOversightSources, FIELD_OVERSIGHT_KEYS } from "@/hooks/useFieldOversightSources";
import {
  READINESS_ITEMS, buildReadinessRequest, cycleReadinessMark, defaultMobilizationDate,
  isErectionTask, readinessCreateInput, readinessEditInput, readinessTone, readinessUpdatePatch,
  workingDaysToStart,
} from "@/lib/fieldOversight";
import type { ProjectLike, ReadinessDraft, ReadinessRecord, ReadinessTone } from "@/lib/fieldOversight";
import "@/styles/command.css";
import "@/styles/field-oversight.css";

type AnyProps = PropsWithChildren<Record<string, unknown>>;
const Modal = ModalRaw as unknown as ComponentType<AnyProps>;
const DeleteDialog = DeleteDialogRaw as unknown as ComponentType<AnyProps>;

const TONE_PILL: Record<ReadinessTone, "good" | "danger" | "warn" | "neutral" | "info"> = {
  ready: "good", critical: "danger", warning: "warn", open: "info", past: "neutral",
};

function shortDay(iso: string | null): string {
  if (!iso) return "no date";
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

interface EditorState { mode: "create" | "edit"; record: ReadinessRecord | null; draft: ReadinessDraft }

export default function SiteReadiness() {
  useCommandSkin();
  const projectId = useProjectId();
  // ProjectContext is untyped JS; read the one shape this page uses.
  const { activeProject } = useProjectContext() as { activeProject: ProjectLike | null };
  const project = activeProject?.id === projectId ? activeProject : null;
  const { user } = useAppSecurity();
  const orgName = useOrgName();
  const { can } = usePermissions();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const focusId = params.get("id");
  const today = todayLocalISO();
  const by = (user?.full_name as string | undefined) || user?.email || null;

  const src = useFieldOversightSources(projectId, project, { delays: false, deliveries: false, logs: false, weather: false });
  useRealtimeInvalidation("action_items", projectId, [[...FIELD_OVERSIGHT_KEYS.readiness(projectId)]]);

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [requestFor, setRequestFor] = useState<ReadinessRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReadinessRecord | null>(null);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  useEffect(() => { setEditor(null); setRequestFor(null); setDeleteTarget(null); }, [projectId]);

  useEffect(() => {
    if (!focusId || src.isLoading) return;
    document.getElementById(`fo-seq-${focusId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusId, src.isLoading]);

  const erectionTasks = useMemo(() => src.tasks.filter(isErectionTask), [src.tasks]);
  const canWrite = can("edit", "site_readiness");

  const refresh = () => invalidateEntity(qc, "action_item", projectId);

  const saveMut = useMutation({
    mutationFn: async (state: EditorState) => {
      if (!state.draft.sequence.trim()) throw new Error("Name the sequence or area.");
      if (state.mode === "create") return entities.ActionItem.create(withProjectId(readinessCreateInput(state.draft), projectId) as never);
      const record = state.record;
      if (!record || record.raw.project_id !== projectId) throw new Error("Reopen this sequence in its own project before saving.");
      return entities.ActionItem.update(record.id, readinessEditInput(record.raw, state.draft, record.marks) as never);
    },
    onSuccess: async (_r, state) => {
      setEditor(null);
      toast.success(state.mode === "create" ? "Sequence added" : "Sequence updated");
      await refresh();
    },
    onError: (err) => toast.error(toUserErrorMessage(err, "Could not save the sequence")),
  });

  const toggleMut = useMutation({
    mutationFn: async ({ record, key }: { record: ReadinessRecord; key: string }) => {
      if (record.raw.project_id !== projectId) throw new Error("This checklist belongs to another project.");
      const marks = cycleReadinessMark(record.marks, key, by, new Date().toISOString());
      return entities.ActionItem.update(record.id, readinessUpdatePatch(record.raw, record.sequence, marks) as never);
    },
    onMutate: ({ record, key }) => setPending((p) => ({ ...p, [`${record.id}:${key}`]: true })),
    onSettled: async (_d, _e, { record, key }) => {
      setPending((p) => { const next = { ...p }; delete next[`${record.id}:${key}`]; return next; });
      await refresh();
    },
    onError: (err) => toast.error(toUserErrorMessage(err, "Could not update the checklist")),
  });

  const deleteMut = useMutation({
    mutationFn: async (record: ReadinessRecord) => {
      if (record.raw.project_id !== projectId) throw new Error("This sequence belongs to another project.");
      return entities.ActionItem.delete(record.id);
    },
    onSuccess: async () => { setDeleteTarget(null); setEditor(null); toast.success("Sequence deleted"); await refresh(); },
    onError: (err) => toast.error(toUserErrorMessage(err, "Could not delete the sequence")),
  });

  if (!projectId) {
    return (
      <div className="fo-cc sbp-command-page">
        <PageHeader eyebrow="Field" title="Site Readiness" subtitle="Select a project to see its erection sequences." />
      </div>
    );
  }
  if (src.isLoading) return <div className="fo-cc sbp-command-page"><LoadingSkeleton variant="page" /></div>;
  if (src.isError) {
    return (
      <div className="fo-cc sbp-command-page">
        <PageHeader eyebrow="Field" title="Site Readiness" />
        <div role="alert" className="fo-panel"><div className="fo-panel__body">
          <p>{toUserErrorMessage(src.error, "Readiness checklists could not be loaded.")}</p>
          <button type="button" className="cmd-btn" onClick={src.refetch}>Retry</button>
        </div></div>
      </div>
    );
  }

  const list = src.readiness;
  const tones = list.map((r) => readinessTone(r, today, src.calendar));
  const soonOpen = tones.filter((t) => t === "critical" || t === "warning").length;
  const ready = tones.filter((t) => t === "ready").length;
  const openItems = list.reduce((n, r) => n + r.open.length, 0);

  const openCreate = () => setEditor({
    mode: "create", record: null,
    draft: { sequence: "", scheduleTaskId: null, mobilizationDate: defaultMobilizationDate(today, src.calendar), owner: by, notes: null },
  });
  const openEdit = (record: ReadinessRecord) => setEditor({
    mode: "edit", record,
    draft: {
      sequence: record.sequence, scheduleTaskId: record.scheduleTaskId,
      mobilizationDate: record.raw.due_date ?? null, owner: record.owner, notes: record.raw.description ?? null,
    },
  });

  return (
    <div className="fo-cc sbp-command-page">
      <PageHeader
        eyebrow={`${project?.name ?? "Project"} / Field`}
        title="Site Readiness"
        subtitle="One checklist per erection sequence. The crew does not mobilize to a site that is not ready — open items hold the 48-hour gate."
        meta={`${list.length} sequence${list.length === 1 ? "" : "s"} · ${openItems} open item${openItems === 1 ? "" : "s"}`}
        actions={can("create", "site_readiness") ? (
          <button type="button" className="cmd-btn cmd-btn--primary" onClick={openCreate}><Plus size={14} /> Add sequence</button>
        ) : null}
      />
      <OperationalSummary
        ariaLabel="Site readiness summary"
        metrics={[
          { label: "Sequences", value: list.length, sublabel: "tracked" },
          { label: "Ready", value: ready, sublabel: "clear to mobilize", tone: ready ? "good" : "neutral" },
          { label: "Not ready · 5 days", value: soonOpen, sublabel: "mobilizing soon with open items", tone: soonOpen ? "danger" : "good" },
          { label: "Open items", value: openItems, sublabel: "across all sequences", tone: openItems ? "warn" : "good" },
        ]}
      />

      {list.length === 0 ? (
        <div className="fo-panel"><div className="fo-empty">
          No erection sequences yet. Add each sequence, link it to its erection task on the schedule, and work the checklist down with the GC.
          Anything still open inside two working days shows on Command Center as critical.
        </div></div>
      ) : (
        <div className="fo-grid">
          {list.map((r, idx) => {
            const tone = tones[idx];
            const wd = workingDaysToStart(r, today, src.calendar);
            const pct = Math.round((r.doneCount / READINESS_ITEMS.length) * 100);
            const cls = tone === "ready" ? "is-ready" : tone === "critical" ? "is-critical" : tone === "warning" ? "is-warning" : "";
            const task = r.scheduleTaskId ? src.tasks.find((t) => t.id === r.scheduleTaskId) : undefined;
            return (
              <section key={r.id} id={`fo-seq-${r.id}`} className={`fo-card ${cls}`} aria-label={r.sequence}
                style={focusId === r.id ? { boxShadow: "0 0 0 2px var(--cmd-gold)" } : undefined}>
                <div className="fo-card__head">
                  <div style={{ minWidth: 0 }}>
                    <h3 className="fo-card__title">{r.sequence}</h3>
                    <div className="fo-card__sub">
                      {task ? `${task.task_name ?? "Erection task"} · ` : ""}{r.start ? `mob ${shortDay(r.start)}` : "no mobilization date"}
                      {wd !== null && wd >= 0 ? ` · ${wd === 0 ? "today" : `${wd} work day${wd === 1 ? "" : "s"} out`}` : ""}
                      {r.owner ? ` · ${r.owner}` : ""}
                    </div>
                  </div>
                  <Pill tone={TONE_PILL[tone]}>{r.open.length ? `${r.open.length} open` : "Ready"}</Pill>
                </div>
                <div className="fo-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${r.sequence} readiness`}>
                  <i style={{ width: `${pct}%` }} />
                </div>
                <div className="fo-check">
                  {READINESS_ITEMS.map((item) => {
                    const mark = r.marks[item.key];
                    const busy = !!pending[`${r.id}:${item.key}`];
                    const state = mark?.state ?? "open";
                    return (
                      <button
                        key={item.key}
                        type="button"
                        className={`fo-check__item is-${state}`}
                        disabled={!canWrite || busy}
                        aria-pressed={state === "done"}
                        aria-label={`${item.label}: ${state === "done" ? "done" : state === "na" ? "not applicable" : "open"}. Click to change.`}
                        onClick={() => toggleMut.mutate({ record: r, key: item.key })}
                      >
                        <span className="fo-check__box">{state === "done" ? "✓" : state === "na" ? "N/A" : ""}</span>
                        <span className="fo-check__label">{item.label}</span>
                        <span className="fo-check__meta">{mark ? [mark.by, mark.at ? shortDay(mark.at.slice(0, 10)) : null].filter(Boolean).join(" · ") : item.party}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="fo-card__foot">
                  <button type="button" className="cmd-btn" disabled={!r.open.some((i) => i.party !== "Erector")} onClick={() => setRequestFor(r)}>Request to GC</button>
                  {canWrite ? <button type="button" className="cmd-btn" onClick={() => openEdit(r)}>Edit</button> : null}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {editor ? (
        <Modal
          open
          onClose={() => setEditor(null)}
          title={editor.mode === "create" ? "Add erection sequence" : `Edit ${editor.record?.sequence ?? "sequence"}`}
          eyebrow="SITE READINESS"
          width={620}
          footer={(
            <div className="fo-modal-actions">
              {editor.mode === "edit" && editor.record && can("delete", "site_readiness") ? (
                <button type="button" className="cmd-btn" style={{ marginRight: "auto" }} onClick={() => setDeleteTarget(editor.record)}>Delete</button>
              ) : null}
              <button type="button" className="cmd-btn" onClick={() => setEditor(null)}>Cancel</button>
              <button type="button" className="cmd-btn cmd-btn--primary" disabled={saveMut.isPending} onClick={() => saveMut.mutate(editor)}>
                {saveMut.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          )}
        >
          <div className="fo-form">
            <div className="fo-field is-wide">
              <label htmlFor="fo-seq">Sequence or area *</label>
              <input id="fo-seq" value={editor.draft.sequence} placeholder="Sequence 2 — Bldg B, Grid 1–6"
                onChange={(e) => setEditor({ ...editor, draft: { ...editor.draft, sequence: e.target.value } })} />
            </div>
            <div className="fo-field is-wide">
              <label htmlFor="fo-task">Erection task it gates</label>
              <select id="fo-task" value={editor.draft.scheduleTaskId ?? ""}
                onChange={(e) => setEditor({ ...editor, draft: { ...editor.draft, scheduleTaskId: e.target.value || null } })}>
                <option value="">— not linked —</option>
                {erectionTasks.map((t) => (
                  <option key={t.id} value={t.id}>{`${t.task_name ?? "Erection task"} · ${shortDay(t.start_date ?? null)}`}</option>
                ))}
              </select>
              <span className="fo-hint">Linked: mobilization follows the task's start date on the schedule.{erectionTasks.length ? "" : " No erection-phase tasks are on this schedule yet."}</span>
            </div>
            <div className="fo-field">
              <label htmlFor="fo-mob">Planned mobilization</label>
              <input id="fo-mob" type="date" value={editor.draft.mobilizationDate ?? ""}
                onChange={(e) => setEditor({ ...editor, draft: { ...editor.draft, mobilizationDate: e.target.value || null } })} />
              <span className="fo-hint">Used when no task is linked.</span>
            </div>
            <div className="fo-field">
              <label htmlFor="fo-owner">Owner</label>
              <input id="fo-owner" value={editor.draft.owner ?? ""}
                onChange={(e) => setEditor({ ...editor, draft: { ...editor.draft, owner: e.target.value || null } })} />
            </div>
            <div className="fo-field is-wide">
              <label htmlFor="fo-notes">Notes</label>
              <textarea id="fo-notes" value={editor.draft.notes ?? ""}
                onChange={(e) => setEditor({ ...editor, draft: { ...editor.draft, notes: e.target.value || null } })} />
            </div>
          </div>
        </Modal>
      ) : null}

      <CopyTextModal
        open={!!requestFor}
        title={`Readiness request — ${requestFor?.sequence ?? ""}`}
        eyebrow="PASTE INTO YOUR EMAIL"
        text={requestFor ? buildReadinessRequest({ record: requestFor, project, senderName: by, orgName }) : ""}
        onClose={() => setRequestFor(null)}
      />

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget && !deleteMut.isPending) deleteMut.mutate(deleteTarget); }}
        busy={deleteMut.isPending}
        title="Delete sequence"
        description={`Delete the readiness checklist for ${deleteTarget?.sequence ?? "this sequence"}? This cannot be undone.`}
      />
    </div>
  );
}
