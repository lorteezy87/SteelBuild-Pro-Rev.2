/**
 * Delay Log — crew and crane standby, logged the day it happens, costed, and
 * carried to a written notice. Each entry is a change request (reason
 * "Delay / standby"), so it keeps its official CR number and can be converted
 * to a change order from the Change Requests register.
 *
 * Permissions mirror the database: any project member may log a delay
 * (change_requests INSERT), only a PM may edit one or record a notice
 * (change_requests UPDATE).
 */
import { useEffect, useMemo, useRef, useState } from "react";
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
import { useProjectRole } from "@/hooks/useProjectRole";
import { useNumberedCreateDraft } from "@/hooks/useNumberedCreateDraft";
import { invalidateEntity } from "@/services/cacheRegistry";
import { toUserErrorMessage, withProjectId } from "@/lib/mutations/standardMutation";
import { todayLocalISO } from "@/lib/dateMath";
import { useOrgName } from "@/pages/documentControl/BoardReportShell";
import { Modal as ModalRaw } from "@/components/design-system";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import {
  AttentionQueue, DataTable, OperationalSummary, PageHeader, Pill, useCommandSkin,
} from "@/components/command";
import type { AttentionItem, Column } from "@/components/command";
import { CopyTextModal } from "@/components/fieldOversight/CopyTextModal";
import { useFieldOversightSources, FIELD_OVERSIGHT_KEYS } from "@/hooks/useFieldOversightSources";
import { useNoticeWindow } from "@/hooks/useNoticeWindow";
import {
  DELAY_CAUSES, buildDelayNotice, delayCreateFields, delayCost, delayUpdateFields, draftFromRecord, draftInputs,
  emptyDelayDraft, formatMoney, isErectionTask, isOpenExposure, needsNotice, noticeSentPatch, noticeState, validateDelayDraft,
} from "@/lib/fieldOversight";
import type { DelayCause, DelayDraft, DelayRecord, NoticeState, ProjectLike } from "@/lib/fieldOversight";
import "@/styles/command.css";
import "@/styles/field-oversight.css";

type AnyProps = PropsWithChildren<Record<string, unknown>>;
const Modal = ModalRaw as unknown as ComponentType<AnyProps>;

function shortDay(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function noticePill(n: NoticeState) {
  switch (n.kind) {
    case "sent": return <Pill tone="good">Noticed {shortDay(n.on)}</Pill>;
    case "overdue": return <Pill tone="danger">Notice {n.workingDaysLate}d late</Pill>;
    case "due": return <Pill tone="warn">{n.workingDaysLeft === 0 ? "Notice due today" : `Notice due · ${n.workingDaysLeft}d`}</Pill>;
    default: return <Pill tone="neutral">No date</Pill>;
  }
}

interface EditorState { record: DelayRecord | null; draft: DelayDraft }

export default function DelayLog() {
  useCommandSkin();
  const projectId = useProjectId();
  // ProjectContext is untyped JS; read the one shape this page uses.
  const { activeProject } = useProjectContext() as { activeProject: ProjectLike | null };
  const project = activeProject?.id === projectId ? activeProject : null;
  const { user } = useAppSecurity();
  const orgName = useOrgName();
  const { can } = usePermissions();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const today = todayLocalISO();
  const senderName = (user?.full_name as string | undefined) || user?.email || null;
  const [noticeWindow, setNoticeWindow] = useNoticeWindow(projectId);

  const src = useFieldOversightSources(projectId, project, { readiness: false, deliveries: false, weather: false });
  useRealtimeInvalidation("change_requests", projectId, [[...FIELD_OVERSIGHT_KEYS.delays(projectId)]]);

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [noticeFor, setNoticeFor] = useState<DelayRecord | null>(null);
  const createDraft = useNumberedCreateDraft(projectId, !!editor && !editor.record, "delay-log");
  useEffect(() => { setEditor(null); setNoticeFor(null); }, [projectId]);

  const { isLoading: roleLoading } = useProjectRole(projectId);
  const canCreate = can("create", "delay");
  const canEdit = can("edit", "delay");

  // Deep links: ?from_log=<daily log id> prefills a new delay; ?id=<delay> opens its notice.
  const handled = useRef<string | null>(null);
  useEffect(() => {
    // Wait for the project role: can() reads as viewer until it resolves.
    if (src.isLoading || !projectId || roleLoading) return;
    const fromLog = params.get("from_log");
    const focus = params.get("id");
    const token = `${fromLog ?? ""}|${focus ?? ""}`;
    if (handled.current === token) return;
    handled.current = token;
    if (fromLog) {
      const log = src.logs.find((l) => l.id === fromLog);
      if (log && canCreate) {
        const d = emptyDelayDraft(log.date?.slice(0, 10) || today);
        setEditor({ record: null, draft: {
          ...d,
          crew: log.headcount != null ? String(log.headcount) : "",
          // The daily's delay_hours is not defined as hours per worker, so it
          // is quoted for the PM to split rather than guessed into Hours each.
          whatHappened: [log.delays, log.delay_hours != null ? `Daily log recorded ${log.delay_hours} delay hours.` : null].filter(Boolean).join("\n"),
          dailyLogId: log.id,
        } });
      }
    } else if (focus) {
      const rec = src.delays.find((x) => x.id === focus);
      if (rec) setNoticeFor(rec);
    }
  }, [src.isLoading, roleLoading, src.logs, src.delays, params, projectId, canCreate, today]);

  const erectionTasks = useMemo(() => src.tasks.filter(isErectionTask), [src.tasks]);
  const refresh = () => invalidateEntity(qc, "change_request", projectId);

  const saveMut = useMutation({
    mutationFn: async (state: EditorState) => {
      // A recovery re-sends the original payload; the form is locked and not re-validated.
      const recovering = !state.record && createDraft.recoveryPending;
      if (!recovering) {
        const errors = validateDelayDraft(state.draft);
        if (errors.length) throw new Error(errors.join(" "));
      }
      if (!state.record) {
        return createDraft.save(withProjectId({ ...delayCreateFields(state.draft), status: "Submitted" }, projectId), entities.ChangeRequest.create as never);
      }
      if (state.record.raw.project_id !== projectId) throw new Error("Reopen this delay in its own project before saving.");
      return entities.ChangeRequest.update(state.record.id, delayUpdateFields(state.draft, state.record.raw) as never);
    },
    onSuccess: async (_r, state) => {
      setEditor(null);
      toast.success(state.record ? "Delay updated" : "Delay logged");
      if (params.get("from_log")) { params.delete("from_log"); setParams(params, { replace: true }); }
      await refresh();
    },
    onError: (err) => toast.error(toUserErrorMessage(err, "Could not save the delay")),
  });

  const noticeMut = useMutation({
    mutationFn: async (record: DelayRecord) => {
      if (record.raw.project_id !== projectId) throw new Error("This delay belongs to another project.");
      return entities.ChangeRequest.update(record.id, noticeSentPatch(record, today) as never);
    },
    onSuccess: async () => { setNoticeFor(null); toast.success(`Notice recorded as sent ${shortDay(today)}`); await refresh(); },
    onError: (err) => toast.error(toUserErrorMessage(err, "Could not record the notice")),
  });

  if (!projectId) {
    return (
      <div className="fo-cc sbp-command-page">
        <PageHeader eyebrow="Field" title="Delay Log" subtitle="Select a project to see its delays." />
      </div>
    );
  }
  if (src.isLoading) return <div className="fo-cc sbp-command-page"><LoadingSkeleton variant="page" /></div>;
  if (src.isError) {
    return (
      <div className="fo-cc sbp-command-page">
        <PageHeader eyebrow="Field" title="Delay Log" />
        <div role="alert" className="fo-panel"><div className="fo-panel__body">
          <p>{toUserErrorMessage(src.error, "The delay log could not be loaded.")}</p>
          <button type="button" className="cmd-btn" onClick={src.refetch}>Retry</button>
        </div></div>
      </div>
    );
  }

  const delays = src.delays;
  const states = new Map(delays.map((d) => [d.id, noticeState(d.inputs, today, noticeWindow, src.calendar)]));
  // Approved, rejected or converted delays no longer raise notice findings.
  const unnoticed = delays.filter((d) => { const n = states.get(d.id); return needsNotice(d) && (n?.kind === "due" || n?.kind === "overdue"); });
  const overdue = unnoticed.filter((d) => states.get(d.id)?.kind === "overdue");
  const manHours = delays.reduce<number | null>((sum, d) => (d.cost.manHours === null ? sum : (sum ?? 0) + d.cost.manHours), null);
  const exposure = delays.filter(isOpenExposure).reduce<number | null>((sum, d) => (d.cost.total === null ? sum : (sum ?? 0) + d.cost.total), null);
  const converted = delays.filter((d) => d.raw.change_order_id).length;

  const attention: AttentionItem[] = unnoticed.map((d) => {
    const n = states.get(d.id) as NoticeState;
    return {
      id: d.id,
      issue: `${d.number ?? "Delay"} · ${d.inputs.cause ? DELAY_CAUSES[d.inputs.cause] : "Delay"}`,
      deadline: shortDay(d.inputs.impactDate),
      risk: [n.kind === "overdue" ? `Notice ${n.workingDaysLate}d late` : "Notice due", formatMoney(d.cost.total)].join(" · "),
      owner: d.inputs.responsibleParty,
      nextAction: "Write and send the notice",
      tone: n.kind === "overdue" || (n.kind === "due" && n.workingDaysLeft === 0) ? "danger" : "warn",
      onOpen: () => setNoticeFor(d),
    };
  });

  const columns: Column<DelayRecord>[] = [
    { key: "num", header: "CR #", render: (d) => <span className="cmd-row__num">{d.number ?? "—"}</span> },
    { key: "date", header: "Date", render: (d) => shortDay(d.inputs.impactDate) },
    { key: "cause", header: "Cause", render: (d) => (d.inputs.cause ? DELAY_CAUSES[d.inputs.cause] : "—") },
    { key: "party", header: "Responsible", render: (d) => d.inputs.responsibleParty ?? "—" },
    { key: "mh", header: "Man-hrs", align: "right", render: (d) => (d.cost.manHours === null ? "—" : Math.round(d.cost.manHours).toLocaleString("en-US")) },
    { key: "cost", header: "Cost", align: "right", render: (d) => <span style={{ fontFamily: "var(--font-mono, monospace)", fontWeight: 700 }}>{formatMoney(d.cost.total)}</span> },
    { key: "notice", header: "Notice", render: (d) => (needsNotice(d) || d.inputs.noticeSentOn ? noticePill(states.get(d.id) as NoticeState) : <Pill tone="neutral">Closed out</Pill>) },
    { key: "status", header: "CR status", render: (d) => <Pill tone={d.status === "Approved" ? "good" : d.status === "Rejected" ? "neutral" : "info"}>{d.status ?? "—"}</Pill> },
    {
      key: "act", header: "", align: "right", render: (d) => (
        <span style={{ display: "inline-flex", gap: 6 }}>
          <button type="button" className="cmd-btn" onClick={() => setNoticeFor(d)}>Notice</button>
          {canEdit ? <button type="button" className="cmd-btn" onClick={() => setEditor({ record: d, draft: draftFromRecord(d, today) })}>Edit</button> : null}
        </span>
      ),
    },
  ];

  const byCause = new Map<string, number>();
  for (const d of delays.filter(isOpenExposure)) {
    if (d.cost.total === null) continue;
    const k = d.inputs.cause ?? "other";
    byCause.set(k, (byCause.get(k) ?? 0) + d.cost.total);
  }
  const causeRows = [...byCause.entries()].sort((a, b) => b[1] - a[1]);
  const maxCause = causeRows.length ? causeRows[0][1] || 1 : 1;

  const draft = editor?.draft;
  const preview = draft ? delayCost(draftInputs(draft)) : null;
  const setDraft = (patch: Partial<DelayDraft>) => { if (editor) setEditor({ ...editor, draft: { ...editor.draft, ...patch } }); };
  const affectedTask = noticeFor?.inputs.scheduleTaskId ? src.tasks.find((t) => t.id === noticeFor.inputs.scheduleTaskId) : undefined;

  return (
    <div className="fo-cc sbp-command-page">
      <PageHeader
        eyebrow={`${project?.name ?? "Project"} / Field`}
        title="Delay Log"
        subtitle="Crew and crane standby for someone else's reason — logged the day it happens, costed, and noticed in writing."
        meta={(
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span>{delays.length} logged · {unnoticed.length} without notice</span>
            <label htmlFor="fo-window" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              Notice window
              <input id="fo-window" type="number" min={0} max={30} value={noticeWindow} style={{ width: 52 }}
                onChange={(e) => setNoticeWindow(Number(e.target.value))} aria-describedby="fo-window-hint" />
              working days
            </label>
            <span id="fo-window-hint">— check each subcontract's notice clause</span>
          </span>
        )}
        actions={canCreate ? (
          <button type="button" className="cmd-btn cmd-btn--primary" onClick={() => setEditor({ record: null, draft: emptyDelayDraft(today) })}>
            <Plus size={14} /> Log delay
          </button>
        ) : null}
      />
      <OperationalSummary
        ariaLabel="Delay log summary"
        metrics={[
          { label: "Without notice", value: unnoticed.length, sublabel: "no written notice yet", tone: unnoticed.length ? "warn" : "good" },
          { label: "Notice overdue", value: overdue.length, sublabel: `past the ${noticeWindow}-day window`, tone: overdue.length ? "danger" : "good" },
          { label: "Man-hours lost", value: manHours === null ? "—" : Math.round(manHours).toLocaleString("en-US"), sublabel: "where crew and hours are recorded" },
          { label: "Open exposure", value: formatMoney(exposure), sublabel: "not yet approved or rejected", tone: exposure ? "warn" : "neutral" },
          { label: "Converted to CO", value: converted, sublabel: "via Change Requests", tone: converted ? "good" : "neutral" },
        ]}
      />
      <AttentionQueue title="Notice Attention" items={attention} emptyMessage="Every logged delay has a written notice on record." />

      <section className="fo-panel" aria-label="Delay register">
        <div className="fo-panel__head"><h2>Register</h2></div>
        <DataTable columns={columns} rows={delays} emptyMessage="No delays logged. When the crew or crane can't work for someone else's reason, log it the same day." />
      </section>

      {causeRows.length ? (
        <section className="fo-panel" aria-label="Open exposure by cause">
          <div className="fo-panel__head"><h2>Open exposure by cause</h2></div>
          <div className="fo-panel__body" style={{ display: "grid", gap: 8 }}>
            {causeRows.map(([k, v]) => (
              <div key={k} style={{ display: "grid", gridTemplateColumns: "minmax(140px, 220px) 1fr auto", gap: 10, alignItems: "center", fontSize: 12.5 }}>
                <span>{DELAY_CAUSES[k as DelayCause] ?? k}</span>
                <div className="fo-progress" style={{ margin: 0 }}><i style={{ width: `${Math.max(3, Math.round((v / maxCause) * 100))}%` }} /></div>
                <span style={{ fontFamily: "var(--font-mono, monospace)", fontWeight: 700 }}>{formatMoney(v)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {editor && draft ? (
        <Modal
          open
          onClose={() => setEditor(null)}
          title={editor.record ? `Edit ${editor.record.number ?? "delay"}` : "Log a delay"}
          eyebrow="DELAY & STANDBY"
          width={680}
          footer={(
            <div className="fo-modal-actions">
              <span style={{ marginRight: "auto", alignSelf: "center", fontFamily: "var(--font-mono, monospace)", fontSize: 12 }}>
                {preview?.manHours !== null && preview?.manHours !== undefined ? `${Math.round(preview.manHours)} MH · ` : ""}Total {formatMoney(preview?.total ?? null)}
              </span>
              <button type="button" className="cmd-btn" onClick={() => setEditor(null)}>Cancel</button>
              <button type="button" className="cmd-btn cmd-btn--primary" disabled={saveMut.isPending} onClick={() => saveMut.mutate(editor)}>
                {saveMut.isPending ? "Saving…" : editor.record ? "Save" : createDraft.recoveryPending ? "Recover saved delay" : "Log delay"}
              </button>
            </div>
          )}
        >
          {!editor.record && createDraft.recoveryPending ? (
            <p role="status" className="fo-errors" style={{ marginBottom: 12 }}>
              The last save may have completed. Saving again recovers that original delay; changes entered here will not be applied. Check the register before logging another.
            </p>
          ) : null}
          <fieldset className="fo-form" disabled={saveMut.isPending || (!editor.record && createDraft.recoveryPending)} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <div className="fo-field">
              <label htmlFor="dl-date">Date of impact *</label>
              <input id="dl-date" type="date" value={draft.impactDate} onChange={(e) => setDraft({ impactDate: e.target.value })} />
            </div>
            <div className="fo-field">
              <label htmlFor="dl-cause">Cause *</label>
              <select id="dl-cause" value={draft.cause} onChange={(e) => setDraft({ cause: e.target.value as DelayCause })}>
                {Object.entries(DELAY_CAUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="fo-field">
              <label htmlFor="dl-party">Responsible party</label>
              <input id="dl-party" value={draft.responsibleParty} placeholder={project?.general_contractor ?? "GC, fabricator, other trade"} onChange={(e) => setDraft({ responsibleParty: e.target.value })} />
            </div>
            <div className="fo-field">
              <label htmlFor="dl-task">Work affected</label>
              <select id="dl-task" value={draft.scheduleTaskId} onChange={(e) => setDraft({ scheduleTaskId: e.target.value })}>
                <option value="">— not linked —</option>
                {erectionTasks.map((t) => <option key={t.id} value={t.id}>{`${t.task_name ?? "Erection task"} · ${shortDay(t.start_date ?? null)}`}</option>)}
              </select>
            </div>
            <div className="fo-field">
              <label htmlFor="dl-crew">Crew on standby (ironworkers)</label>
              <input id="dl-crew" inputMode="decimal" value={draft.crew} onChange={(e) => setDraft({ crew: e.target.value })} />
            </div>
            <div className="fo-field">
              <label htmlFor="dl-hours">Hours each</label>
              <input id="dl-hours" inputMode="decimal" value={draft.hoursEach} onChange={(e) => setDraft({ hoursEach: e.target.value })} />
            </div>
            <div className="fo-field">
              <label htmlFor="dl-rate">Labor rate ($ / man-hour)</label>
              <input id="dl-rate" inputMode="decimal" value={draft.laborRate} onChange={(e) => setDraft({ laborRate: e.target.value })} />
            </div>
            <div className="fo-field">
              <label htmlFor="dl-crane">Crane standby hours</label>
              <input id="dl-crane" inputMode="decimal" value={draft.craneHours} onChange={(e) => setDraft({ craneHours: e.target.value })} />
            </div>
            <div className="fo-field">
              <label htmlFor="dl-crate">Crane rate ($ / hour)</label>
              <input id="dl-crate" inputMode="decimal" value={draft.craneRate} onChange={(e) => setDraft({ craneRate: e.target.value })} />
            </div>
            <div className="fo-field">
              <label htmlFor="dl-other">Other cost ($)</label>
              <input id="dl-other" inputMode="decimal" value={draft.otherCost} onChange={(e) => setDraft({ otherCost: e.target.value })} />
            </div>
            <div className="fo-field is-wide">
              <label htmlFor="dl-what">What happened</label>
              <textarea id="dl-what" value={draft.whatHappened} onChange={(e) => setDraft({ whatHappened: e.target.value })} />
              <span className="fo-hint">Who, what, when you found out, and who you told. Write it the day it happens.</span>
            </div>
            {editor.record ? (
              <div className="fo-field">
                <label htmlFor="dl-noticed">Notice sent on</label>
                <input id="dl-noticed" type="date" value={draft.noticeSentOn} onChange={(e) => setDraft({ noticeSentOn: e.target.value })} />
              </div>
            ) : null}
            {validateDelayDraft(draft).length && !(!editor.record && createDraft.recoveryPending) ? (
              <p className="fo-errors is-wide" role="status">{validateDelayDraft(draft).join(" ")}</p>
            ) : null}
          </fieldset>
        </Modal>
      ) : null}

      <CopyTextModal
        open={!!noticeFor}
        title={`Notice of delay — ${noticeFor?.number ?? ""}`}
        eyebrow="REVIEW, THEN SEND FROM YOUR MAIL"
        text={noticeFor ? buildDelayNotice({ record: noticeFor, project, senderName, orgName, today, affectedWork: affectedTask?.task_name ?? null }) : ""}
        onClose={() => setNoticeFor(null)}
        extraAction={noticeFor && canEdit && !noticeFor.inputs.noticeSentOn
          ? { label: noticeMut.isPending ? "Recording…" : "Mark notice sent today", onClick: () => noticeMut.mutate(noticeFor), disabled: noticeMut.isPending }
          : null}
      />
    </div>
  );
}
