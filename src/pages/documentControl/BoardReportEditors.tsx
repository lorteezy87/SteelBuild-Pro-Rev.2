/**
 * BoardReportEditors — create, edit and delete for the Board Report's four logs.
 *
 * NO NEW WRITE PATHS.
 * Each record type already has exactly one way it is saved, and every rule
 * that matters lives in it: RFI numbers come only from the sequence RPC
 * (useRfiPageMutations), submittal status moves run the smart triggers and the
 * audit log (useSubmittalsPageMutations), a sheet add queues its detailing task
 * and a sheet delete is soft with Undo (useSheetMutations), and a transmittal's
 * items are resolved before its header is written (transmittalWrites). This
 * module only opens those paths from the Board Report. It owns no persistence.
 *
 * The forms are the app's own (SheetFormModal, SubmittalFormModal,
 * RFIFormModal). Only the transmittal editor and the acknowledgement dialog
 * are drawn here, because the hub's transmittal editor is inline in its log
 * rather than a reusable form. Deletes all confirm through DeleteDialog.
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
import { useTransmittals } from "@/hooks/useTransmittals";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { attachableRegisterRows } from "@/components/drawings/register/docControl.derive";
import { toUserErrorMessage } from "@/lib/mutations/standardMutation";
import { invalidateEntity } from "@/services/cacheRegistry";
import {
  clearTransmittalAcknowledgement,
  createTransmittal,
  recordTransmittalAcknowledgement,
  resolveTransmittalTargets,
  softDeleteTransmittal,
  updateTransmittal,
  type TransmittalHeader,
} from "@/lib/transmittals/transmittalWrites";
import { buildSheetOptions, drawingIdForRevisionOption } from "@/lib/transmittals/transmittalSheetOptions";
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
  | { kind: "transmittal"; mode: "edit" | "delete" | "ack" | "unack"; row: TransmittalRow };

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

function TransmittalHost({ intent, projectId, dark, onClose }: HostProps<"transmittal">) {
  const queryClient = useQueryClient();
  const refresh = () => invalidateEntity(queryClient, "drawingTransmittal", projectId);
  const fail = (verb: string) => (error: unknown) => {
    void refresh();
    toast.error(`Failed to ${verb}: ${toUserErrorMessage(error, "unknown")}`);
  };

  const remove = useMutation({
    mutationFn: (id: string) => softDeleteTransmittal(id),
    onSuccess: async () => {
      await refresh();
      toast.success("Transmittal deleted. Its audit history was retained.");
    },
    onError: fail("delete transmittal"),
  });

  const unack = useMutation({
    mutationFn: (id: string) => clearTransmittalAcknowledgement(id),
    onSuccess: async () => {
      await refresh();
      toast.success("Acknowledgement cleared");
      onClose();
    },
    onError: fail("clear acknowledgement"),
  });

  if (intent.mode === "delete") {
    return (
      <DeleteDialog
        open
        onClose={onClose}
        busy={remove.isPending}
        onConfirm={() => remove.mutateAsync(intent.row.id)}
        title={`Delete transmittal ${intent.row.number}?`}
        description="It leaves the log and stops counting toward acknowledgements. The header and its sheet list are kept for audit."
      />
    );
  }

  if (intent.mode === "unack") {
    const skin = dark ? DC_DARK : DC_LIGHT;
    return (
      <DcDialog
        dark={dark}
        title={`Clear acknowledgement on ${intent.row.number}?`}
        onClose={onClose}
        footer={
          <>
            <PaneButton dark={dark} variant="secondary" onClick={onClose}>Cancel</PaneButton>
            <PaneButton dark={dark} onClick={() => unack.mutate(intent.row.id)} disabled={unack.isPending}>
              {unack.isPending ? "Clearing…" : "Clear acknowledgement"}
            </PaneButton>
          </>
        }
      >
        <span style={{ font: `400 13px/1.5 ${DC_FONT.ui}`, color: skin.textSecondary }}>
          The transmittal goes back to awaiting acknowledgement and starts aging again from its send date.
          Use this only when receipt was recorded against the wrong transmittal.
        </span>
      </DcDialog>
    );
  }

  if (intent.mode === "ack") {
    return <AcknowledgeDialog row={intent.row} projectId={projectId} dark={dark} onClose={onClose} />;
  }

  return (
    <TransmittalEditor row={intent.mode === "create" ? null : intent.row} projectId={projectId} dark={dark} onClose={onClose} />
  );
}

interface XmForm {
  number: string;
  company: string;
  attention: string;
  purpose: string;
  date: string;
  subject: string;
  notes: string;
}

function TransmittalEditor({
  row,
  projectId,
  dark,
  onClose,
}: {
  /** null to log a new transmittal. */
  row: TransmittalRow | null;
  projectId: string;
  dark: boolean;
  onClose: () => void;
}) {
  const skin = dark ? DC_DARK : DC_LIGHT;
  const queryClient = useQueryClient();
  const register = useDrawingRegister(projectId);
  // Only an edit needs the existing item list.
  const log = useTransmittals(projectId, { enabled: Boolean(row) });
  const existing = row ? (log.data ?? []).find((t) => t.id === row.id) ?? null : null;

  const [form, setForm] = useState<XmForm>(() => ({
    number: row?.number === "—" ? "" : row?.number ?? "",
    company: row?.recipientCompany ?? "",
    attention: row?.contact ?? "",
    purpose: row && row.purpose !== "—" ? row.purpose : "For Review",
    date: row?.dateSentRaw ? row.dateSentRaw.slice(0, 10) : todayInput(),
    subject: row?.subject ?? "",
    notes: row?.notes ?? "",
  }));
  const [picked, setPicked] = useState<Set<string> | null>(row ? null : new Set());

  // Seed the picker from the stored items once they arrive.
  useEffect(() => {
    if (picked === null && existing) {
      setPicked(new Set(existing.items.flatMap((i) => (i.drawing_revision_id ? [i.drawing_revision_id] : []))));
    }
  }, [existing, picked]);

  const options = useMemo(
    () => buildSheetOptions(attachableRegisterRows(register.data ?? []), existing?.items ?? []),
    [register.data, existing],
  );

  const header = (): TransmittalHeader => ({
    transmittal_number: form.number.trim(),
    // The Board Report logs what went OUT; incoming sets belong to the hub log.
    direction: "outgoing",
    recipient_company: form.company.trim() || null,
    sent_to: form.attention.trim() || null,
    purpose: form.purpose || null,
    // An untouched date keeps its stored timestamp instead of snapping to midnight.
    date_sent: row?.dateSentRaw && row.dateSentRaw.slice(0, 10) === form.date ? row.dateSentRaw : form.date || null,
    subject: form.subject.trim() || null,
    notes: form.notes.trim() || null,
  });

  const save = useMutation({
    mutationFn: async () => {
      const chosen = picked ?? new Set<string>();
      const resolve = (revisionId: string) => drawingIdForRevisionOption(options, revisionId);
      if (row && existing) {
        await updateTransmittal(projectId, existing, header(), chosen, resolve);
        return { created: null as Record<string, unknown> | null, count: chosen.size };
      }
      const created = await createTransmittal(projectId, header(), resolveTransmittalTargets(chosen, resolve));
      return { created, count: chosen.size };
    },
    onSuccess: async ({ created, count }) => {
      await invalidateEntity(queryClient, "drawingTransmittal", projectId);
      const sheets = count ? ` · ${count} sheet${count === 1 ? "" : "s"}` : "";
      // The log hides drafts. Say so rather than letting a new record vanish.
      if (created && String(created.status ?? "").toLowerCase() === "draft") {
        toast.success(`Transmittal saved as a draft${sheets}. It joins this log once it is sent.`);
      } else {
        toast.success(`Transmittal ${row ? "updated" : "logged"}${sheets}`);
      }
      onClose();
    },
    onError: (error) => {
      void invalidateEntity(queryClient, "drawingTransmittal", projectId);
      toast.error(`Failed to ${row ? "update" : "log"} transmittal: ${toUserErrorMessage(error, "unknown")}`);
    },
  });

  const loadingItems = Boolean(row) && (log.isPending || picked === null);
  if (row && log.isError) {
    return <LoadState dark={dark} what={`transmittal ${row.number}`} error={log.error} onClose={onClose} />;
  }
  if (row && !log.isPending && !existing) {
    return (
      <LoadState dark={dark} what={`transmittal ${row.number}`} error={new Error("It is no longer in the log.")} onClose={onClose} />
    );
  }

  const set = <K extends keyof XmForm>(key: K) => (value: XmForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const chosen = picked ?? new Set<string>();
  const toggle = (revisionId: string) =>
    setPicked((current) => {
      const next = new Set(current ?? []);
      if (next.has(revisionId)) next.delete(revisionId);
      else next.add(revisionId);
      return next;
    });

  return (
    <DcDialog
      dark={dark}
      wide
      title={row ? `Edit transmittal ${row.number}` : "New transmittal"}
      onClose={onClose}
      footer={
        <>
          <PaneButton dark={dark} variant="secondary" onClick={onClose}>Cancel</PaneButton>
          <PaneButton
            dark={dark}
            onClick={() => save.mutate()}
            disabled={save.isPending || loadingItems || !form.number.trim()}
            title={!form.number.trim() ? "A transmittal number is required" : undefined}
          >
            {save.isPending ? "Saving…" : row ? "Save changes" : "Log transmittal"}
          </PaneButton>
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 14 }}>
        <Field dark={dark} label="Transmittal no." required>
          <DcInput dark={dark} mono value={form.number} onChange={set("number")} ariaLabel="Transmittal number" placeholder="T-118-065" />
        </Field>
        <Field dark={dark} label="Date sent">
          <DcInput dark={dark} mono type="date" value={form.date} onChange={set("date")} ariaLabel="Date sent" />
        </Field>
        <Field dark={dark} label="Recipient company">
          <DcInput dark={dark} value={form.company} onChange={set("company")} ariaLabel="Recipient company" />
        </Field>
        <Field dark={dark} label="Attention">
          <DcInput dark={dark} value={form.attention} onChange={set("attention")} ariaLabel="Attention" />
        </Field>
        <Field dark={dark} label="Purpose">
          <select
            aria-label="Purpose"
            value={form.purpose}
            onChange={(e) => set("purpose")(e.target.value)}
            style={inputStyle(skin, false)}
          >
            {[...new Set([...PURPOSES, form.purpose].filter(Boolean))].map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </Field>
        <Field dark={dark} label="Subject">
          <DcInput dark={dark} value={form.subject} onChange={set("subject")} ariaLabel="Subject" />
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
          <span style={{ font: `400 12px/1 ${DC_FONT.mono}`, color: skin.textMuted }}>{chosen.size} selected</span>
        </div>
        <div style={{ maxHeight: 220, overflowY: "auto", border: `1px solid ${skin.paneBorder}` }}>
          {loadingItems ? (
            <div style={{ padding: 12, font: `400 13px/1.4 ${DC_FONT.ui}`, color: skin.textMuted }}>Reading the sheet list…</div>
          ) : options.length === 0 ? (
            <div style={{ padding: 12, font: `400 13px/1.4 ${DC_FONT.ui}`, color: skin.textMuted }}>
              No sheets with a tracked revision to attach.
            </div>
          ) : (
            options.map((o) => {
              const sheet = o.sheetNumber || "Unknown sheet";
              const rev = o.revisionCode || "unmarked";
              return (
                <label
                  key={o.revisionId}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "18px 72px 52px minmax(0,1fr) auto",
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
                    aria-label={`Attach ${sheet} revision ${rev}`}
                    checked={chosen.has(o.revisionId)}
                    onChange={() => toggle(o.revisionId)}
                  />
                  <span style={{ font: `600 12px/1 ${DC_FONT.mono}` }}>{sheet}</span>
                  <span style={{ font: `400 12px/1 ${DC_FONT.mono}`, color: skin.textMuted }}>Rev {rev}</span>
                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: skin.textSecondary }}>
                    {o.sheetTitle || ""}
                  </span>
                  {o.historical ? (
                    <span style={{ font: `400 11px/1 ${DC_FONT.ui}`, color: skin.textMuted }}>previous revision</span>
                  ) : (
                    <span />
                  )}
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
    mutationFn: () => {
      // A date-only pick is recorded at local noon so no time zone moves it to another day.
      const [y, m, d] = date.split("-").map(Number);
      const at = new Date(y, (m ?? 1) - 1, d ?? 1, 12).toISOString();
      return recordTransmittalAcknowledgement(row.id, { by, at, notes });
    },
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
