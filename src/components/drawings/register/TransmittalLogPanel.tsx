/**
 * TransmittalLogPanel — the on-skin Doc Control transmittal register.
 *
 * The header is an auditable distribution record. Users may inspect attached
 * revision snapshots, update the header/attachment set when permitted, and
 * soft-delete the header while retaining its items for history.
 */
import { Fragment, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import { usePermissions } from "@/services/permissions";
import { useTransmittals } from "@/hooks/useTransmittals";
import type { TransmittalAttachment, TransmittalRow } from "@/hooks/useTransmittals";
import { useDrawingRegister } from "@/hooks/useDrawingRegister";
import type { DrawingRegisterRow } from "@/hooks/useDrawingRegister";
import { fmtDate } from "@/pages/drawingSubmittalHub/format";
import { Pill } from "@/components/command";
import type { PillTone } from "@/components/command";
import { attachableRegisterRows, resolveTransmittalDisplay } from "./docControl.derive";

function directionTone(direction: string): PillTone {
  if (direction === "incoming") return "info";
  if (direction === "outgoing") return "good";
  return "neutral";
}

interface FormState {
  transmittal_number: string;
  direction: "incoming" | "outgoing" | "internal";
  party: string;
  subject: string;
  date: string;
  notes: string;
}

interface SheetOption {
  revisionId: string;
  drawingId: string | null;
  sheetNumber: string | null;
  sheetTitle: string | null;
  revisionCode: string | null;
  historical: boolean;
}

const EMPTY_FORM: FormState = {
  transmittal_number: "",
  direction: "incoming",
  party: "",
  subject: "",
  date: "",
  notes: "",
};

function formForTransmittal(transmittal: TransmittalRow): FormState {
  const { party, date } = resolveTransmittalDisplay(transmittal);
  return {
    transmittal_number: transmittal.transmittal_number,
    direction: transmittal.direction,
    party: party || "",
    subject: transmittal.subject || "",
    date: date ? String(date).slice(0, 10) : "",
    notes: transmittal.notes || "",
  };
}

function headerPatch(form: FormState) {
  const incoming = form.direction === "incoming";
  return {
    transmittal_number: form.transmittal_number.trim(),
    direction: form.direction,
    received_from: incoming ? (form.party.trim() || null) : null,
    sent_to: incoming ? null : (form.party.trim() || null),
    subject: form.subject.trim() || null,
    date_sent: incoming ? null : (form.date || null),
    date_received: incoming ? (form.date || null) : null,
    notes: form.notes.trim() || null,
  };
}

function buildSheetOptions(
  register: DrawingRegisterRow[],
  attachedItems: TransmittalAttachment[],
): SheetOption[] {
  const byRevision = new Map<string, SheetOption>();
  for (const row of register) {
    if (!row.current_revision_id) continue;
    byRevision.set(row.current_revision_id, {
      revisionId: row.current_revision_id,
      drawingId: row.drawing_id,
      sheetNumber: row.sheet_number,
      sheetTitle: row.sheet_title,
      revisionCode: row.current_revision,
      historical: false,
    });
  }
  for (const item of attachedItems) {
    if (byRevision.has(item.drawing_revision_id)) continue;
    byRevision.set(item.drawing_revision_id, {
      revisionId: item.drawing_revision_id,
      drawingId: item.drawing_id,
      sheetNumber: item.sheet_number,
      sheetTitle: item.sheet_title,
      revisionCode: item.revision_code,
      historical: true,
    });
  }
  return [...byRevision.values()].sort((a, b) =>
    String(a.sheetNumber || "").localeCompare(String(b.sheetNumber || ""), undefined, { numeric: true })
    || String(a.revisionCode || "").localeCompare(String(b.revisionCode || ""), undefined, { numeric: true }),
  );
}

interface TransmittalEditorProps {
  title: string;
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  sheetOptions: SheetOption[];
  selected: Set<string>;
  onToggleSheet: (revisionId: string) => void;
  onCancel: () => void;
  onSave: () => void;
  isSaving: boolean;
  saveLabel: string;
}

function TransmittalEditor({
  title,
  form,
  setForm,
  sheetOptions,
  selected,
  onToggleSheet,
  onCancel,
  onSave,
  isSaving,
  saveLabel,
}: TransmittalEditorProps) {
  const partyLabel = form.direction === "incoming" ? "Received from" : "Sent to";
  return (
    <div style={{ padding: 14, borderRadius: 2, background: "var(--cmd-surface)", border: "1px solid var(--cmd-border)" }}>
      <div style={{ marginBottom: 10, color: "var(--cmd-text)", fontSize: 13, fontWeight: 800 }}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 10 }}>
        <label style={{ display: "grid", gap: 4, color: "var(--cmd-text-muted)", fontSize: 10, fontWeight: 800 }}>
          Transmittal # *
          <input className="sbd-input" aria-label="Transmittal number" value={form.transmittal_number}
            onChange={(event) => setForm((current) => ({ ...current, transmittal_number: event.target.value }))} />
        </label>
        <label style={{ display: "grid", gap: 4, color: "var(--cmd-text-muted)", fontSize: 10, fontWeight: 800 }}>
          Direction
          <select className="sbd-select" aria-label="Direction" value={form.direction}
            onChange={(event) => setForm((current) => ({ ...current, direction: event.target.value as FormState["direction"] }))}>
            <option value="incoming">Incoming</option>
            <option value="outgoing">Outgoing</option>
            <option value="internal">Internal</option>
          </select>
        </label>
        <label style={{ display: "grid", gap: 4, color: "var(--cmd-text-muted)", fontSize: 10, fontWeight: 800 }}>
          {partyLabel}
          <input className="sbd-input" aria-label={partyLabel} value={form.party}
            onChange={(event) => setForm((current) => ({ ...current, party: event.target.value }))} />
        </label>
        <label style={{ display: "grid", gap: 4, color: "var(--cmd-text-muted)", fontSize: 10, fontWeight: 800 }}>
          Date
          <input className="sbd-input" aria-label="Transmittal date" type="date" value={form.date}
            onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} />
        </label>
        <label style={{ display: "grid", gridColumn: "1 / -1", gap: 4, color: "var(--cmd-text-muted)", fontSize: 10, fontWeight: 800 }}>
          Subject
          <input className="sbd-input" aria-label="Subject" value={form.subject}
            onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))} />
        </label>
        <label style={{ display: "grid", gridColumn: "1 / -1", gap: 4, color: "var(--cmd-text-muted)", fontSize: 10, fontWeight: 800 }}>
          Notes
          <textarea className="sbd-input" aria-label="Notes" rows={3} value={form.notes}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
        </label>
      </div>

      <div style={{ fontSize: 9, color: "var(--cmd-text-muted)", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", margin: "6px 0" }}>
        Attach sheets ({selected.size} selected)
      </div>
      <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid var(--cmd-border)", borderRadius: 2, padding: 6 }}>
        {sheetOptions.length === 0 ? (
          <div style={{ color: "var(--cmd-text-muted)", fontSize: 12, padding: 8 }}>No sheets with a tracked revision to attach.</div>
        ) : sheetOptions.map((option) => {
          const sheetLabel = option.sheetNumber || "Unknown sheet";
          const revisionLabel = option.revisionCode || "unmarked";
          return (
            <label key={option.revisionId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 6px", cursor: "pointer", fontSize: 12, color: "var(--cmd-text)" }}>
              <input type="checkbox" className="cmd-check"
                aria-label={`Attach ${sheetLabel} revision ${revisionLabel}`}
                checked={selected.has(option.revisionId)}
                onChange={() => onToggleSheet(option.revisionId)} />
              <span style={{ fontWeight: 700 }}>{sheetLabel}</span>
              <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--cmd-text-muted)" }}>Rev {revisionLabel}</span>
              <span style={{ color: "var(--cmd-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{option.sheetTitle || ""}</span>
              {option.historical && <span style={{ marginLeft: "auto", color: "var(--cmd-text-muted)", fontSize: 9 }}>previous revision</span>}
            </label>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
        <button type="button" className="cmd-btn cmd-btn--ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="cmd-btn cmd-btn--primary"
          disabled={isSaving || !form.transmittal_number.trim()} onClick={onSave}>
          {isSaving ? "Saving…" : saveLabel}
        </button>
      </div>
    </div>
  );
}

export function TransmittalLogPanel({ projectId }: { projectId: string | null }) {
  const { data: transmittals = [], isLoading, error } = useTransmittals(projectId);
  const { data: register = [] } = useDrawingRegister(projectId);
  const { can } = usePermissions();
  const canCreate = can("create", "drawing");
  const canEdit = can("edit", "drawing");
  const canDelete = can("delete", "drawing");
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const attachable = useMemo(() => attachableRegisterRows(register), [register]);
  const activeTransmittal = transmittals.find((transmittal) => transmittal.id === activeId) ?? null;
  const sheetOptions = useMemo(
    () => buildSheetOptions(attachable, editing && activeTransmittal ? activeTransmittal.items : []),
    [activeTransmittal, attachable, editing],
  );

  const toggleSheet = (revisionId: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(revisionId)) next.delete(revisionId);
    else next.add(revisionId);
    return next;
  });

  const resetEditor = () => {
    setForm(EMPTY_FORM);
    setSelected(new Set());
    setCreateOpen(false);
    setEditing(false);
  };

  const openCreate = () => {
    if (createOpen) {
      resetEditor();
      return;
    }
    setActiveId(null);
    setConfirmingDelete(false);
    setDeleteConfirmation("");
    setForm(EMPTY_FORM);
    setSelected(new Set());
    setCreateOpen(true);
    setEditing(false);
  };

  const openDetails = (transmittal: TransmittalRow) => {
    const closing = activeId === transmittal.id;
    resetEditor();
    setConfirmingDelete(false);
    setDeleteConfirmation("");
    setActiveId(closing ? null : transmittal.id);
  };

  const startEdit = (transmittal: TransmittalRow) => {
    setCreateOpen(false);
    setActiveId(transmittal.id);
    setConfirmingDelete(false);
    setDeleteConfirmation("");
    setForm(formForTransmittal(transmittal));
    setSelected(new Set(transmittal.items.map((item) => item.drawing_revision_id)));
    setEditing(true);
  };

  const startDelete = (transmittal: TransmittalRow) => {
    resetEditor();
    setActiveId(transmittal.id);
    setDeleteConfirmation("");
    setConfirmingDelete(true);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("Select a project before logging a transmittal");
      const patch = headerPatch(form);
      if (!patch.transmittal_number) throw new Error("Transmittal number is required");
      const transmittal = await entities.DrawingTransmittal.create({ project_id: projectId, ...patch } as never);
      const transmittalId = (transmittal as { id: string }).id;
      for (const revisionId of selected) {
        await entities.DrawingTransmittalItem.create({
          project_id: projectId,
          transmittal_id: transmittalId,
          drawing_revision_id: revisionId,
        } as never);
      }
      return selected.size;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["drawing-transmittals", projectId] });
      toast.success(`Transmittal logged${count ? ` · ${count} sheet${count === 1 ? "" : "s"}` : ""}`);
      resetEditor();
    },
    onError: (mutationError) => {
      queryClient.invalidateQueries({ queryKey: ["drawing-transmittals", projectId] });
      toast.error("Failed to log transmittal: " + ((mutationError as Error)?.message || "unknown"));
    },
  });

  const editMutation = useMutation({
    mutationFn: async (transmittal: TransmittalRow) => {
      if (!projectId) throw new Error("Select a project before editing a transmittal");
      const patch = headerPatch(form);
      if (!patch.transmittal_number) throw new Error("Transmittal number is required");
      await entities.DrawingTransmittal.update(transmittal.id, patch as never);

      const existingByRevision = new Map(
        transmittal.items.map((item) => [item.drawing_revision_id, item]),
      );
      const additions = [...selected].filter((revisionId) => !existingByRevision.has(revisionId));
      const removals = transmittal.items.filter((item) => !selected.has(item.drawing_revision_id));
      await Promise.all([
        ...additions.map((revisionId) => entities.DrawingTransmittalItem.create({
          project_id: projectId,
          transmittal_id: transmittal.id,
          drawing_revision_id: revisionId,
        } as never)),
        ...removals.map((item) => entities.DrawingTransmittalItem.delete(item.id)),
      ]);
      return selected.size;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["drawing-transmittals", projectId] });
      toast.success(`Transmittal updated · ${count} sheet${count === 1 ? "" : "s"}`);
      resetEditor();
    },
    onError: (mutationError) => {
      queryClient.invalidateQueries({ queryKey: ["drawing-transmittals", projectId] });
      toast.error("Failed to update transmittal: " + ((mutationError as Error)?.message || "unknown"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (transmittal: TransmittalRow) => {
      await entities.DrawingTransmittal.update(transmittal.id, { is_deleted: true } as never);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drawing-transmittals", projectId] });
      toast.success("Transmittal deleted. Its audit history was retained.");
      setActiveId(null);
      setConfirmingDelete(false);
      setDeleteConfirmation("");
    },
    onError: (mutationError) => {
      queryClient.invalidateQueries({ queryKey: ["drawing-transmittals", projectId] });
      toast.error("Failed to delete transmittal: " + ((mutationError as Error)?.message || "unknown"));
    },
  });

  if (!projectId) return <div style={{ padding: 24, color: "var(--cmd-text-muted)", fontSize: 13 }}>Select a project.</div>;
  if (isLoading) return <div style={{ padding: 24, color: "var(--cmd-text-muted)", fontSize: 13 }}>Loading transmittals…</div>;
  if (error) return <div style={{ padding: 24, color: "var(--cmd-danger)", fontSize: 13 }}>Failed to load transmittals: {(error as Error)?.message || "unknown"}</div>;

  return (
    <section className="detailing-cc" style={{ padding: 0, gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0, color: "var(--cmd-text)", fontSize: 16, fontWeight: 700 }}>Transmittals</h3>
          <p style={{ margin: "4px 0 0", color: "var(--cmd-text-muted)", fontSize: 12 }}>
            Distribution log — who received which revisions, and when.
          </p>
        </div>
        {canCreate && (
          <button type="button" className="cmd-btn cmd-btn--primary" onClick={openCreate}>
            {createOpen ? "Cancel" : "Log transmittal"}
          </button>
        )}
      </div>

      {canCreate && createOpen && (
        <TransmittalEditor
          title="Log transmittal"
          form={form}
          setForm={setForm}
          sheetOptions={sheetOptions}
          selected={selected}
          onToggleSheet={toggleSheet}
          onCancel={resetEditor}
          onSave={() => createMutation.mutate()}
          isSaving={createMutation.isPending}
          saveLabel="Save transmittal"
        />
      )}

      {transmittals.length === 0 ? (
        <div className="cmd-table-wrap">
          <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--cmd-text-muted)", fontSize: 13 }}>No transmittals logged yet.</div>
        </div>
      ) : (
        <div className="cmd-table-wrap">
          <table className="cmd-table">
            <thead>
              <tr>
                <th>Transmittal #</th>
                <th>Dir.</th>
                <th>Party</th>
                <th>Subject</th>
                <th>Date</th>
                <th style={{ textAlign: "center" }}>Sheets</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {transmittals.map((transmittal) => {
                const { party, date } = resolveTransmittalDisplay(transmittal);
                const expanded = activeId === transmittal.id;
                return (
                  <Fragment key={transmittal.id}>
                    <tr>
                      <td style={{ fontWeight: 700, color: "var(--cmd-text)", whiteSpace: "nowrap" }}>{transmittal.transmittal_number}</td>
                      <td><Pill tone={directionTone(transmittal.direction)}>{transmittal.direction}</Pill></td>
                      <td style={{ color: "var(--cmd-text)" }}>{party || "—"}</td>
                      <td style={{ color: "var(--cmd-text-muted)", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{transmittal.subject || "—"}</td>
                      <td style={{ color: "var(--cmd-text-muted)", whiteSpace: "nowrap" }}>{date ? fmtDate(date) : "—"}</td>
                      <td style={{ textAlign: "center" }}>
                        <span style={{ fontVariantNumeric: "tabular-nums", color: transmittal.item_count > 0 ? "var(--cmd-text)" : "var(--cmd-text-muted)" }}>{transmittal.item_count}</span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button type="button" className="cmd-btn cmd-btn--ghost"
                          aria-expanded={expanded} aria-controls={`transmittal-${transmittal.id}-details`}
                          onClick={() => openDetails(transmittal)}>
                          {expanded ? "Close" : "View"}
                          <span className="sr-only"> {transmittal.transmittal_number}</span>
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr id={`transmittal-${transmittal.id}-details`}>
                        <td colSpan={7} style={{ padding: 12, background: "var(--cmd-surface)" }}>
                          {editing ? (
                            <TransmittalEditor
                              title={`Edit ${transmittal.transmittal_number}`}
                              form={form}
                              setForm={setForm}
                              sheetOptions={sheetOptions}
                              selected={selected}
                              onToggleSheet={toggleSheet}
                              onCancel={resetEditor}
                              onSave={() => editMutation.mutate(transmittal)}
                              isSaving={editMutation.isPending}
                              saveLabel="Save changes"
                            />
                          ) : confirmingDelete ? (
                            <div style={{ border: "1px solid var(--cmd-danger)", borderRadius: 2, padding: 12 }}>
                              <div style={{ color: "var(--cmd-text)", fontSize: 13, fontWeight: 800 }}>Delete {transmittal.transmittal_number}?</div>
                              <p style={{ color: "var(--cmd-text-muted)", fontSize: 12 }}>
                                This removes it from the active register but retains the transmittal and attached-sheet history for audit purposes.
                                Type <strong>{transmittal.transmittal_number}</strong> to confirm.
                              </p>
                              <input className="sbd-input" style={{ maxWidth: 320 }}
                                aria-label={`Type ${transmittal.transmittal_number} to confirm deletion`}
                                value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} />
                              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
                                <button type="button" className="cmd-btn cmd-btn--ghost" onClick={() => { setConfirmingDelete(false); setDeleteConfirmation(""); }}>Cancel</button>
                                <button type="button" className="cmd-btn cmd-btn--ghost"
                                  style={{ borderColor: "var(--cmd-danger)", color: "var(--cmd-danger-text)" }}
                                  disabled={deleteMutation.isPending || deleteConfirmation !== transmittal.transmittal_number}
                                  onClick={() => deleteMutation.mutate(transmittal)}>
                                  {deleteMutation.isPending ? "Deleting…" : "Confirm delete"}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: "grid", gap: 12 }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                                <div style={{ color: "var(--cmd-text)", fontSize: 13, fontWeight: 800 }}>Transmittal details</div>
                                <div style={{ display: "flex", gap: 8 }}>
                                  {canEdit && <button type="button" className="cmd-btn cmd-btn--ghost" onClick={() => startEdit(transmittal)}>Edit</button>}
                                  {canDelete && <button type="button" className="cmd-btn cmd-btn--ghost" style={{ color: "var(--cmd-danger-text)" }} onClick={() => startDelete(transmittal)}>Delete</button>}
                                </div>
                              </div>
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                                <div><div style={{ color: "var(--cmd-text-muted)", fontSize: 9, fontWeight: 800, textTransform: "uppercase" }}>Counterparty</div><div style={{ color: "var(--cmd-text)", fontSize: 12 }}>{party || "—"}</div></div>
                                <div><div style={{ color: "var(--cmd-text-muted)", fontSize: 9, fontWeight: 800, textTransform: "uppercase" }}>Date</div><div style={{ color: "var(--cmd-text)", fontSize: 12 }}>{date ? fmtDate(date) : "—"}</div></div>
                                <div><div style={{ color: "var(--cmd-text-muted)", fontSize: 9, fontWeight: 800, textTransform: "uppercase" }}>Subject</div><div style={{ color: "var(--cmd-text)", fontSize: 12 }}>{transmittal.subject || "—"}</div></div>
                                <div style={{ gridColumn: "1 / -1" }}><div style={{ color: "var(--cmd-text-muted)", fontSize: 9, fontWeight: 800, textTransform: "uppercase" }}>Notes</div><div style={{ color: "var(--cmd-text)", fontSize: 12, whiteSpace: "pre-wrap" }}>{transmittal.notes || "No notes recorded."}</div></div>
                              </div>
                              <div>
                                <div style={{ color: "var(--cmd-text-muted)", fontSize: 9, fontWeight: 800, textTransform: "uppercase", marginBottom: 6 }}>Attached sheets ({transmittal.item_count})</div>
                                {transmittal.items.length === 0 ? (
                                  <div style={{ color: "var(--cmd-text-muted)", fontSize: 12 }}>No drawing revisions attached.</div>
                                ) : (
                                  <div style={{ display: "grid", gap: 4 }}>
                                    {transmittal.items.map((item) => (
                                      <div key={item.id} style={{ display: "flex", gap: 8, alignItems: "baseline", color: "var(--cmd-text)", fontSize: 12 }}>
                                        <span style={{ fontWeight: 800 }}>{item.sheet_number || "Unknown sheet"}</span>
                                        <span style={{ color: "var(--cmd-text-muted)" }}>Rev {item.revision_code || "—"}</span>
                                        <span style={{ color: "var(--cmd-text-muted)" }}>{item.sheet_title || ""}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
