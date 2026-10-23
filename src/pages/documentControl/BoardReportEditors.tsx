/**
 * BoardReportEditors — create, edit and delete for the Board Report's four logs.
 *
 * NO NEW WRITE PATHS.
 * Each record type already has exactly one way it is saved, and every rule
 * that matters lives in it: RFI numbers come only from the sequence RPC
 * (useRfiPageMutations), submittal status moves run the smart triggers and the
 * audit log (useSubmittalsPageMutations), a sheet add queues its detailing task
 * and a sheet delete is soft with Undo (useSheetMutations), and a transmittal
 * moves only through the shared lifecycle RPCs — issue, acknowledge, void
 * (transmittalWrites). This module only opens those paths from the Board
 * Report. It owns no persistence.
 *
 * The forms are the app's own (SheetFormModal, SubmittalFormModal,
 * RFIFormModal). Only the transmittal dialogs are drawn here, because the
 * hub's transmittal editor is inline in its log rather than a reusable form,
 * and edits drafts, which this log never shows. Deletes confirm through
 * DeleteDialog; a transmittal is voided, never deleted.
 *
 * Each host mounts only while it is open, so the reads a form needs (sets,
 * drawings, RFIs to link) cost nothing until someone opens it.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { entities } from "@/api/supabaseClient";
import DeleteDialog from "@/components/shared/DeleteDialog";
import SheetFormModal from "@/components/drawings/SheetFormModal";
import { EMPTY_FORM } from "@/components/drawings/drawingsConfig";
import RFIFormModal from "@/components/rfis/RFIFormModal";
import SubmittalFormModal from "@/pages/submittals/SubmittalFormModal";
import { useSubmittalsPageQueries } from "@/pages/submittals/useSubmittalsPageQueries";
import { useSubmittalsPageMutations } from "@/pages/submittals/useSubmittalsPageMutations";
import { splitCreateSubmittalPayload } from "@/pages/submittals/submittalMutationHelpers";
import type { Submittal } from "@/pages/submittals/types";
import { useRfiPageMutations } from "@/pages/rfis/useRfiPageMutations";
import { useSheetMutations } from "@/pages/drawings/useSheetMutations";
import { buildDeleteSheetConfirm } from "@/pages/drawings/drawingActionHelpers";
import { useDrawingRegister } from "@/hooks/useDrawingRegister";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { attachableRegisterRows } from "@/components/drawings/register/docControl.derive";
import { toUserErrorMessage } from "@/lib/mutations/standardMutation";
import { invalidateEntity } from "@/services/cacheRegistry";
import {
  acknowledgeTransmittal,
  createAndSendTransmittal,
  voidTransmittal,
} from "@/lib/transmittals/transmittalWrites";
import { DC_DARK, DC_FONT, DC_LIGHT, DC_SIGNAL, type DcSkin } from "./boardReportTheme";
import { PaneButton } from "./BoardReportShell";
import type { RegisterRow, RfiRow, SubmittalRow, TransmittalRow } from "./useBoardReportData";

/* ─── intents ────────────────────────────────────────────────────────────── */

export type EditorIntent =
  | { kind: "sheet"; mode: "create" }
  | { kind: "sheet"; mode: "edit" | "delete"; row: RegisterRow }
  | { kind: "submittal"; mode: "create" }
  | { kind: "submittal"; mode: "edit" | "delete"; row: SubmittalRow }
  | { kind: "rfi"; mode: "create" }
  | { kind: "rfi"; mode: "edit" | "delete"; row: RfiRow }
  | { kind: "transmittal"; mode: "create" }
  | { kind: "transmittal"; mode: "ack" | "void"; row: TransmittalRow };

export interface EditorHostProps {
  intent: EditorIntent | null;
  projectId: string;
  projectName: string;
  dark: boolean;
  onClose: () => void;
}

const noop = () => {};

export function BoardReportEditorHost({ intent, ...rest }: EditorHostProps) {
  if (!intent) return null;
  switch (intent.kind) {
    case "sheet":
      return <SheetHost intent={intent} {...rest} />;
    case "submittal":
      return <SubmittalHost intent={intent} {...rest} />;
    case "rfi":
      return <RfiHost intent={intent} {...rest} />;
    case "transmittal":
      return <TransmittalHost intent={intent} {...rest} />;
  }
}

type HostProps<K extends EditorIntent["kind"]> = Omit<EditorHostProps, "intent"> & {
  intent: Extract<EditorIntent, { kind: K }>;
};

/* ─── sheets ─────────────────────────────────────────────────────────────── */

function SheetHost({ intent, projectId, projectName, dark, onClose }: HostProps<"sheet">) {
  const queryClient = useQueryClient();
  const { createMut, updateMut, deleteMut } = useSheetMutations({
    projectId,
    projectName,
    queryClient,
    onCreated: onClose,
    onUpdated: onClose,
  });
  const register = useDrawingRegister(projectId);
  const existingSetNames = useMemo(
    () => [...new Set((register.data ?? []).map((r) => r.drawing_set_name).filter((n): n is string => Boolean(n)))].sort(),
    [register.data],
  );

  // The form edits the stored drawing row, not the register view of it.
  const editId = intent.mode === "edit" ? intent.row.id : null;
  const drawing = useQuery({
    queryKey: ["board-report", "drawing", editId],
    enabled: Boolean(editId),
    queryFn: () => entities.Drawing.get(editId as string),
  });

  if (intent.mode === "delete") {
    const plan = buildDeleteSheetConfirm({ id: intent.row.id, sheet_number: intent.row.sheet });
    return (
      <DeleteDialog
        open
        onClose={onClose}
        busy={deleteMut.isPending}
        onConfirm={() => deleteMut.mutateAsync({ id: intent.row.id, project_id: intent.row.projectId })}
        title={plan.title}
        description={plan.description}
      />
    );
  }

  if (editId && (drawing.isPending || drawing.isError || !drawing.data)) {
    return (
      <LoadState
        dark={dark}
        what={`sheet ${intent.mode === "edit" ? intent.row.sheet : ""}`}
        error={drawing.isError ? drawing.error : null}
        onClose={onClose}
      />
    );
  }

  return (
    <SheetFormModal
      initial={editId ? drawing.data : EMPTY_FORM}
      existingSetNames={existingSetNames}
      saving={createMut.isPending || updateMut.isPending}
      onClose={onClose}
      onSave={(form: Record<string, unknown>) => {
        if (editId) updateMut.mutate({ ...form, id: editId });
        else createMut.mutate(form);
      }}
    />
  );
}

/* ─── submittals ─────────────────────────────────────────────────────────── */

function SubmittalHost({ intent, projectId, projectName, dark, onClose }: HostProps<"submittal">) {
  const q = useSubmittalsPageQueries(projectId);
  const rows = q.rows as Submittal[];
  const muts = useSubmittalsPageMutations({
    projectId,
    rows: rows as Parameters<typeof useSubmittalsPageMutations>[0]["rows"],
    activeProject: { name: projectName },
    selectedId: null,
    setSelectedId: noop,
    setToDelete: noop,
    setReleaseBlock: noop,
    setSelectedIds: noop,
    setShowBulkEdit: noop,
    setShowBulkDelete: noop,
    setShowBulkAdd: noop,
    setShowNewRound: noop,
    setShowSheetResponse: noop,
  });

  if (intent.mode === "delete") {
    return (
      <DeleteDialog
        open
        onClose={onClose}
        busy={muts.deleteMut.isPending}
        onConfirm={() => muts.deleteMut.mutateAsync(intent.row.id)}
        title={`Delete submittal ${intent.row.pkg}?`}
        description="This submittal and its comment thread will be soft-deleted. This cannot be undone from the UI."
      />
    );
  }

  const editing = intent.mode === "edit" ? rows.find((r) => r.id === intent.row.id) ?? null : null;
  if (q.isLoading || q.queryError || (intent.mode === "edit" && !editing)) {
    return (
      <LoadState
        dark={dark}
        what={intent.mode === "edit" ? `package ${intent.row.pkg}` : "the submittal form"}
        error={q.queryError ?? (q.isLoading ? null : new Error("This package is no longer in the log."))}
        onClose={onClose}
      />
    );
  }

  return (
    <SubmittalFormModal
      open
      initial={editing ?? {}}
      projectId={projectId}
      projectName={projectName}
      availableSets={q.drawingSets}
      allDrawings={q.allDrawings}
      allRfis={q.allRfis}
      saving={muts.createMut.isPending || muts.updateMut.isPending}
      existingNumbers={
        new Set(
          rows
            .filter((row) => row.id !== editing?.id)
            .map((row) => String(row.submittal_number || "").trim())
            .filter(Boolean),
        )
      }
      onClose={onClose}
      onSubmit={async (data) => {
        try {
          if (editing?.id) {
            await muts.updateMut.mutateAsync({ id: editing.id, ...data });
          } else {
            // Drawing-type components are created by the Submittals page, which
            // owns that flow; the UI-only key is split off so it never reaches
            // the insert as a phantom column.
            const { submittalData } = splitCreateSubmittalPayload(data);
            await muts.createMut.mutateAsync(submittalData);
            toast.success("Submittal created");
          }
          onClose();
        } catch {
          // The mutation's onError has already said why; keep the form open
          // with the user's input so they can correct and resubmit.
        }
      }}
    />
  );
}

/* ─── RFIs ───────────────────────────────────────────────────────────────── */

function RfiHost({ intent, projectId, projectName, dark, onClose }: HostProps<"rfi">) {
  const editId = intent.mode === "edit" ? intent.row.id : null;
  const rfi = useQuery({
    queryKey: ["board-report", "rfi", editId],
    enabled: Boolean(editId),
    queryFn: () => entities.RFI.get(editId as string),
  });
  const editingRFI = (editId ? rfi.data ?? null : null) as Parameters<typeof useRfiPageMutations>[0]["editingRFI"];

  const muts = useRfiPageMutations({
    projectId,
    // The Board Report's own read is refreshed in place alongside the RFI page's.
    queryKeys: [["rfis", projectId], ["rfis"], ["board-report", "rfis", projectId]],
    projects: [{ id: projectId, name: projectName }],
    projectMap: { [projectId]: projectName },
    selectedRFI: null,
    setSelectedRFI: noop,
    setDeleteTarget: noop,
    setSelectedIds: noop,
    setShowBulkDelete: noop,
    // saveRfi closes the form only once the write (and any PDF upload) lands.
    setShowForm: (open) => {
      if (!open) onClose();
    },
    setEditingRFI: noop,
    editingRFI,
  });

  if (intent.mode === "delete") {
    return (
      <DeleteDialog
        open
        onClose={onClose}
        busy={muts.deleteMut.isPending}
        onConfirm={() => muts.deleteMut.mutateAsync(intent.row.id)}
        title={`Delete ${intent.row.number}?`}
        description="The RFI is removed from the log. Its attachments stay in Documents."
      />
    );
  }

  if (editId && (rfi.isPending || rfi.isError || !rfi.data)) {
    return (
      <LoadState
        dark={dark}
        what={intent.mode === "edit" ? intent.row.number : "the RFI"}
        error={rfi.isError ? rfi.error : null}
        onClose={onClose}
      />
    );
  }

  return (
    <RFIFormModal
      projectId={projectId}
      rfi={editingRFI}
      saving={muts.isSaving}
      onClose={onClose}
      onSave={(data: Record<string, unknown>, files: File[]) => muts.saveRfi(data, files)}
    />
  );
}

/* ─── transmittals ───────────────────────────────────────────────────────── */

const PURPOSES = [
  "For Review",
  "For Approval",
  "For Construction",
  "For Fabrication",
  "For Erection",
  "For Record",
  "For Information",
  "Resubmitted",
];

const todayInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * Transmittals follow the shared lifecycle (see transmittalWrites): the Board
 * shows only issued ones, and an issued transmittal is a contractual snapshot
 * — its sheets are frozen at send. So the Board offers issue, acknowledge and
 * void, and never an edit or a delete of something already sent.
 */
function TransmittalHost({ intent, projectId, dark, onClose }: HostProps<"transmittal">) {
  if (intent.mode === "void") return <VoidDialog row={intent.row} projectId={projectId} dark={dark} onClose={onClose} />;
  if (intent.mode === "ack") return <AcknowledgeDialog row={intent.row} projectId={projectId} dark={dark} onClose={onClose} />;
  return <IssueTransmittalDialog projectId={projectId} dark={dark} onClose={onClose} />;
}

interface XmForm {
  subject: string;
  company: string;
  attention: string;
  purpose: string;
  date: string;
  notes: string;
}

function IssueTransmittalDialog({ projectId, dark, onClose }: { projectId: string; dark: boolean; onClose: () => void }) {
  const skin = dark ? DC_DARK : DC_LIGHT;
  const queryClient = useQueryClient();
  const register = useDrawingRegister(projectId);
  const [form, setForm] = useState<XmForm>(() => ({
    subject: "",
    company: "",
    attention: "",
    purpose: "For Review",
    date: todayInput(),
    notes: "",
  }));
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // One row per shop drawing: send_transmittal snapshots each sheet's CURRENT
  // revision itself, so the pick is the drawing, not a revision.
  const sheets = useMemo(() => {
    const seen = new Set<string>();
    return attachableRegisterRows(register.data ?? []).filter((r) => {
      if (!r.drawing_id || seen.has(r.drawing_id)) return false;
      seen.add(r.drawing_id);
      return true;
    });
  }, [register.data]);

  const missing = !form.subject.trim()
    ? "A subject is required"
    : !form.attention.trim()
      ? "Name who it goes to"
      : picked.size === 0
        ? "Pick at least one sheet"
        : !form.date
          ? "Pick the date sent"
          : null;

  const issue = useMutation({
    mutationFn: () =>
      createAndSendTransmittal(projectId, {
        subject: form.subject,
        sentTo: form.attention,
        recipientCompany: form.company,
        purpose: form.purpose,
        notes: form.notes,
        drawingIds: [...picked],
        sentDate: form.date,
      }),
    onSuccess: async (sent) => {
      await invalidateEntity(queryClient, "drawingTransmittal", projectId);
      toast.success(`${String(sent.transmittal_number ?? "Transmittal")} issued · ${picked.size} sheet${picked.size === 1 ? "" : "s"}`);
      onClose();
    },
    onError: (error) => {
      void invalidateEntity(queryClient, "drawingTransmittal", projectId);
      toast.error(`Failed to issue transmittal: ${toUserErrorMessage(error, "unknown")}`);
    },
  });

  const set = <K extends keyof XmForm>(key: K) => (value: XmForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const toggle = (drawingId: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(drawingId)) next.delete(drawingId);
      else next.add(drawingId);
      return next;
    });

  return (
    <DcDialog
      dark={dark}
      wide
      title="New transmittal"
      onClose={onClose}
      footer={
        <>
          <PaneButton dark={dark} variant="secondary" onClick={onClose}>Cancel</PaneButton>
          <PaneButton dark={dark} onClick={() => issue.mutate()} disabled={issue.isPending || Boolean(missing)} title={missing ?? undefined}>
            {issue.isPending ? "Issuing…" : "Issue transmittal"}
          </PaneButton>
        </>
      }
    >
      <span style={{ font: `400 13px/1.5 ${DC_FONT.ui}`, color: skin.textSecondary }}>
        The number comes from the project sequence. Issuing records each sheet&apos;s current revision as sent, and the
        list cannot be changed afterwards — void and reissue instead.
      </span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 14 }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <Field dark={dark} label="Subject" required>
            <DcInput dark={dark} value={form.subject} onChange={set("subject")} ariaLabel="Subject" />
          </Field>
        </div>
        <Field dark={dark} label="Attention" required>
          <DcInput dark={dark} value={form.attention} onChange={set("attention")} ariaLabel="Attention" />
        </Field>
        <Field dark={dark} label="Recipient company">
          <DcInput dark={dark} value={form.company} onChange={set("company")} ariaLabel="Recipient company" />
        </Field>
        <Field dark={dark} label="Purpose">
          <select aria-label="Purpose" value={form.purpose} onChange={(e) => set("purpose")(e.target.value)} style={inputStyle(skin, false)}>
            {PURPOSES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </Field>
        <Field dark={dark} label="Date sent" required>
          <DcInput dark={dark} mono type="date" value={form.date} onChange={set("date")} ariaLabel="Date sent" />
        </Field>
        <div style={{ gridColumn: "1 / -1" }}>
          <Field dark={dark} label="Notes">
            <textarea
              aria-label="Notes"
              rows={3}
              value={form.notes}
              onChange={(e) => set("notes")(e.target.value)}
              style={{ ...inputStyle(skin, false), resize: "vertical" }}
            />
          </Field>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", font: `600 13px/1 ${DC_FONT.ui}` }}>
          <span>Sheets</span>
          <span style={{ font: `400 12px/1 ${DC_FONT.mono}`, color: skin.textMuted }}>{picked.size} selected</span>
        </div>
        <div style={{ maxHeight: 220, overflowY: "auto", border: `1px solid ${skin.paneBorder}` }}>
          {register.isPending ? (
            <div style={{ padding: 12, font: `400 13px/1.4 ${DC_FONT.ui}`, color: skin.textMuted }}>Reading the register…</div>
          ) : sheets.length === 0 ? (
            <div style={{ padding: 12, font: `400 13px/1.4 ${DC_FONT.ui}`, color: skin.textMuted }}>
              No sheets with a tracked revision to issue.
            </div>
          ) : (
            sheets.map((r) => {
              const sheet = r.sheet_number || "Unknown sheet";
              const rev = r.current_revision || "unmarked";
              return (
                <label
                  key={r.drawing_id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "18px 72px 52px minmax(0,1fr)",
                    gap: 10,
                    alignItems: "center",
                    padding: "8px 12px",
                    borderBottom: `1px solid ${skin.rowBorder}`,
                    cursor: "pointer",
                    font: `400 13px/1.2 ${DC_FONT.ui}`,
                  }}
                >
                  <input
                    type="checkbox"
                    aria-label={`Issue ${sheet} revision ${rev}`}
                    checked={picked.has(r.drawing_id)}
                    onChange={() => toggle(r.drawing_id)}
                  />
                  <span style={{ font: `600 12px/1 ${DC_FONT.mono}` }}>{sheet}</span>
                  <span style={{ font: `400 12px/1 ${DC_FONT.mono}`, color: skin.textMuted }}>Rev {rev}</span>
                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: skin.textSecondary }}>
                    {r.sheet_title || ""}
                  </span>
                </label>
              );
            })
          )}
        </div>
      </div>
    </DcDialog>
  );
}

function AcknowledgeDialog({
  row,
  projectId,
  dark,
  onClose,
}: {
  row: TransmittalRow;
  projectId: string;
  dark: boolean;
  onClose: () => void;
}) {
  const skin = dark ? DC_DARK : DC_LIGHT;
  const queryClient = useQueryClient();
  const [by, setBy] = useState(row.contact || "");
  const [date, setDate] = useState(todayInput());
  const [notes, setNotes] = useState("");

  const save = useMutation({
    mutationFn: () => acknowledgeTransmittal(row.id, { by, date, notes }),
    onSuccess: async () => {
      await invalidateEntity(queryClient, "drawingTransmittal", projectId);
      toast.success(`${row.number} acknowledged by ${by.trim()}`);
      onClose();
    },
    onError: (error) => toast.error(`Failed to record acknowledgement: ${toUserErrorMessage(error, "unknown")}`),
  });

  return (
    <DcDialog
      dark={dark}
      title={`Record acknowledgement — ${row.number}`}
      onClose={onClose}
      footer={
        <>
          <PaneButton dark={dark} variant="secondary" onClick={onClose}>Cancel</PaneButton>
          <PaneButton
            dark={dark}
            onClick={() => save.mutate()}
            disabled={save.isPending || !by.trim() || !date}
            title={!by.trim() ? "Name who confirmed receipt" : undefined}
          >
            {save.isPending ? "Saving…" : "Record acknowledgement"}
          </PaneButton>
        </>
      }
    >
      <span style={{ font: `400 13px/1.5 ${DC_FONT.ui}`, color: skin.textSecondary }}>
        Sent to {row.recipient}. Record who at the recipient confirmed receipt — the name is the evidence.
      </span>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 160px", gap: 14 }}>
        <Field dark={dark} label="Acknowledged by" required>
          <DcInput dark={dark} value={by} onChange={setBy} ariaLabel="Acknowledged by" />
        </Field>
        <Field dark={dark} label="Date received">
          <DcInput dark={dark} mono type="date" value={date} onChange={setDate} ariaLabel="Date received" />
        </Field>
      </div>
      <Field dark={dark} label="Notes">
        <textarea
          aria-label="Acknowledgement notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          style={{ ...inputStyle(skin, false), resize: "vertical" }}
        />
      </Field>
    </DcDialog>
  );
}

function VoidDialog({
  row,
  projectId,
  dark,
  onClose,
}: {
  row: TransmittalRow;
  projectId: string;
  dark: boolean;
  onClose: () => void;
}) {
  const skin = dark ? DC_DARK : DC_LIGHT;
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");

  const run = useMutation({
    mutationFn: () => voidTransmittal(row.id, reason),
    onSuccess: async () => {
      await invalidateEntity(queryClient, "drawingTransmittal", projectId);
      toast.success(`${row.number} voided. The record and its sheet list are kept.`);
      onClose();
    },
    onError: (error) => toast.error(`Failed to void transmittal: ${toUserErrorMessage(error, "unknown")}`),
  });

  return (
    <DcDialog
      dark={dark}
      title={`Void transmittal ${row.number}?`}
      onClose={onClose}
      footer={
        <>
          <PaneButton dark={dark} variant="secondary" onClick={onClose}>Cancel</PaneButton>
          <PaneButton
            dark={dark}
            tone="danger"
            onClick={() => run.mutate()}
            disabled={run.isPending || !reason.trim()}
            title={!reason.trim() ? "A reason is required" : undefined}
          >
            {run.isPending ? "Voiding…" : "Void transmittal"}
          </PaneButton>
        </>
      }
    >
      <span style={{ font: `400 13px/1.5 ${DC_FONT.ui}`, color: skin.textSecondary }}>
        It leaves this log and stops counting toward acknowledgements. Nothing is deleted: the issued sheet list and
        the reason stay on the record. Tell {row.recipient} separately if they should discard what they received.
      </span>
      <Field dark={dark} label="Reason" required>
        <textarea
          aria-label="Void reason"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          style={{ ...inputStyle(skin, false), resize: "vertical" }}
        />
      </Field>
    </DcDialog>
  );
}

/* ─── Board Report dialog chrome ─────────────────────────────────────────── */

/**
 * A fixed overlay in the Board Report's own skin. CLAUDE.md: never Radix
 * Dialog and never <form>, so this is a plain div with a focus trap, Escape to
 * close and a backdrop click to dismiss.
 */
function DcDialog({
  title,
  dark,
  wide = false,
  onClose,
  footer,
  children,
}: {
  title: string;
  dark: boolean;
  wide?: boolean;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const skin = dark ? DC_DARK : DC_LIGHT;
  const trapRef = useFocusTrap(true);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(12, 15, 18, 0.55)",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          width: "100%",
          maxWidth: wide ? 680 : 520,
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
          background: skin.paneBg,
          color: skin.text,
          border: `1px solid ${skin.paneBorder}`,
          boxShadow: "0 18px 48px rgba(0,0,0,.28)",
          padding: "22px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 18,
          fontFamily: DC_FONT.ui,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <span style={{ font: `600 20px/1.2 ${DC_FONT.ui}`, textWrap: "pretty" }}>{title}</span>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              marginLeft: "auto",
              background: "none",
              border: 0,
              color: skin.textMuted,
              font: `400 20px/1 ${DC_FONT.ui}`,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>
        {children}
        {footer ? (
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, borderTop: `1px solid ${skin.rowBorder}`, paddingTop: 16 }}>
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** What a form host shows while its record loads, or why it could not. */
function LoadState({ dark, what, error, onClose }: { dark: boolean; what: string; error: unknown; onClose: () => void }) {
  const skin = dark ? DC_DARK : DC_LIGHT;
  return (
    <DcDialog
      dark={dark}
      title={error ? `Could not open ${what}` : `Opening ${what}…`}
      onClose={onClose}
      footer={<PaneButton dark={dark} variant="secondary" onClick={onClose}>Close</PaneButton>}
    >
      <span style={{ font: `400 13px/1.5 ${DC_FONT.ui}`, color: error ? DC_SIGNAL.redText : skin.textMuted }}>
        {error ? toUserErrorMessage(error, "The record could not be read.") : "Reading the current record so the form starts from what is stored."}
      </span>
    </DcDialog>
  );
}

function Field({ label, required = false, dark, children }: { label: string; required?: boolean; dark: boolean; children: ReactNode }) {
  const skin = dark ? DC_DARK : DC_LIGHT;
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <span style={{ font: `500 12px/1 ${DC_FONT.ui}`, color: skin.textMuted }}>
        {label}
        {required ? <span style={{ color: DC_SIGNAL.accent }}> *</span> : null}
      </span>
      {children}
    </label>
  );
}

function inputStyle(skin: DcSkin, mono: boolean) {
  return {
    width: "100%",
    boxSizing: "border-box" as const,
    padding: "8px 10px",
    borderRadius: 6,
    border: `1px solid ${skin.controlBorder}`,
    background: skin.paneBg,
    color: skin.text,
    font: mono ? `400 13px/1.3 ${DC_FONT.mono}` : `400 13px/1.3 ${DC_FONT.ui}`,
  };
}

function DcInput({
  value,
  onChange,
  ariaLabel,
  dark,
  mono = false,
  type = "text",
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  dark: boolean;
  mono?: boolean;
  type?: "text" | "date";
  placeholder?: string;
}) {
  const skin = dark ? DC_DARK : DC_LIGHT;
  return (
    <input
      type={type}
      aria-label={ariaLabel}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={inputStyle(skin, mono)}
    />
  );
}
