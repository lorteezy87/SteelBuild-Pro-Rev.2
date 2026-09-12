import React, { useState, useEffect, useRef } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { entities } from "@/api/supabaseClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getNextFormattedNumber } from "../shared/numberSequencing";
import RelatedScheduleTasksChips from "@/components/shared/RelatedScheduleTasksChips";
import AutoLinkSuggestions from "@/components/shared/AutoLinkSuggestions";
import { RFI_TYPES, buildRfiPreflight } from "@/lib/rfiPreflight";
import { findDuplicateRfis } from "@/lib/rfiDedup";
import FormField from "@/components/shared/FormField";
import { toUserErrorMessage } from "@/lib/mutations/standardMutation";
import { buildRfiCreatePayload } from "@/pages/rfis/rfiMutationHelpers";
import RfiPdfAttachments from "./RfiPdfAttachments";
import { useRfiPdfAttachments } from "./useRfiPdfAttachments";
import {
  buildDrawingSetOptions,
  buildRfiFormPayload,
  buildWorkPackageOptions,
  cleanRfiNumericFields,
  deriveAutoLinkPatch,
  getActiveRfiProjectId,
  getRfiSubmissionError,
  seedRfiForm,
} from "./rfiFormDerivations";

/** @type {import('react').CSSProperties} */
const iStyle = {
  width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)",
  borderRadius: 2, padding: "8px 12px", color: "var(--text-primary)",
  fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box",
};
const labelStyle = {
  fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)",
  letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: 4,
};
const SectionLabel = ({ children }) => (
  <div style={{ gridColumn: "span 3", borderLeft: "3px solid var(--accent)", paddingLeft: 8, marginTop: 16, marginBottom: 8 }}>
    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", color: "var(--accent)", textTransform: "uppercase", fontWeight: 700 }}>{children}</span>
  </div>
);
const Field = ({ label, span = 1, children }) => (
  <div style={{ gridColumn: `span ${span}` }}>
    <label style={labelStyle}>{label}</label>
    {children}
  </div>
);

// Deterministic RFI preflight scorecard (always on). Renders the checks
// from buildRfiPreflight() with a score; required failures read as blockers.
const PreflightScorecard = ({ result }) => {
  if (!result) return null;
  const scoreColor = result.passed
    ? "var(--status-success)"
    : result.score >= 60 ? "var(--status-warning)" : "var(--status-error)";
  return (
    <div style={{ gridColumn: "span 3", border: "1px solid var(--border-default)", borderRadius: 6, padding: 12, background: "var(--bg-surface-low)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 700 }}>
          RFI Preflight
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 800, color: scoreColor }}>
          {result.score}%{result.passed ? " · Ready" : ` · ${result.blockers.length} to fix`}
        </span>
      </div>
      <div style={{ display: "grid", gap: 4 }}>
        {result.checks.map((c) => {
          const tone = c.pass ? "var(--status-success)" : c.required ? "var(--status-error)" : "var(--status-warning)";
          return (
            <div key={c.key} style={{ display: "flex", alignItems: "flex-start", gap: 8 }} title={c.hint || ""}>
              <span style={{ color: tone, fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: "16px", width: 12, flexShrink: 0 }}>
                {c.pass ? "✓" : c.required ? "✕" : "!"}
              </span>
              <span style={{ fontSize: 11, color: c.pass ? "var(--text-secondary)" : "var(--text-primary)", lineHeight: "16px" }}>
                {c.label}{!c.pass && c.required ? " (required)" : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Non-blocking duplicate-RFI warning (always on). Surfaces likely prior RFIs
// so the author links instead of re-asking (the RFI 007/008 pain).
const DuplicateWarning = ({ matches }) => {
  if (!matches || matches.length === 0) return null;
  return (
    <div style={{ gridColumn: "span 3", border: "1px solid var(--status-warning)", borderRadius: 6, padding: 12, background: "var(--warning-muted)" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--status-warning)", fontWeight: 700, marginBottom: 8 }}>
        Possible duplicate{matches.length > 1 ? "s" : ""} — review before submitting
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {matches.map((m) => (
          <div key={m.rfi.id} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 800, color: "var(--accent)", flexShrink: 0, minWidth: 64 }}>
              {m.rfi.rfi_number || "RFI"}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {m.rfi.title || "Untitled RFI"}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
                {m.reasons.join(" · ")}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function RFIFormModal({ projectId, onClose, onSave, saving, rfi = null, initialDrawingReference = "", prefill = null }) {
  const qc = useQueryClient();
  const trapRef = useFocusTrap(true);
  const [formData, setFormData] = useState(() => seedRfiForm({
    projectId,
    rfi,
    initialDrawingReference,
    prefill,
  }));
  const {
    inputRef: pdfInputRef,
    pendingFiles: pendingPdfFiles,
    existingDocuments: existingPdfDocs,
    addFiles: addPdfFiles,
    removeFile: removePendingPdf,
    resetPendingFiles,
    openDocument: openAttachment,
  } = useRfiPdfAttachments(rfi?.id);
  // Preflight override — when required checks fail, the author can still submit
  // by acknowledging and giving a reason (logged to metadata.preflight_override).
  const [overrideAck, setOverrideAck] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  useEffect(() => {
    setFormData(seedRfiForm({ projectId, rfi, initialDrawingReference, prefill }));
    resetPendingFiles();
    setOverrideAck(false);
    setOverrideReason("");
  }, [rfi, projectId, initialDrawingReference, prefill, resetPendingFiles]);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    initialData: [],
    staleTime: 5 * 60 * 1000,
  });
  // Work packages for the active project — used in the Linking section
  const activeProjectId = getActiveRfiProjectId(formData.project_id, projectId);
  const { data: workPackages = [] } = useQuery({
    queryKey: ["work_packages", activeProjectId],
    queryFn: () => entities.WorkPackage.filter({ project_id: activeProjectId }),
    enabled: !!activeProjectId,
    initialData: [],
    staleTime: 60 * 1000,
  });

  // Drawing sets for the active project — used in the Linking section
  const { data: drawingSets = [] } = useQuery({
    queryKey: ["drawing_sets", activeProjectId],
    queryFn: () => entities.DrawingSet.filter({ project_id: activeProjectId }),
    enabled: !!activeProjectId,
    initialData: [],
    staleTime: 60 * 1000,
  });

  // Drawings for the active project — used by AutoLinkSuggestions
  const { data: projectDrawings = [] } = useQuery({
    queryKey: ["drawings", activeProjectId],
    queryFn: () => activeProjectId ? entities.Drawing.filter({ project_id: activeProjectId }) : Promise.resolve([]),
    enabled: Boolean(activeProjectId),
    staleTime: 60_000,
  });

  // Existing RFIs for the active project — used by AutoLinkSuggestions
  const { data: existingRfis = [] } = useQuery({
    queryKey: ["rfis", activeProjectId],
    queryFn: () => activeProjectId ? entities.RFI.filter({ project_id: activeProjectId }) : Promise.resolve([]),
    enabled: Boolean(activeProjectId),
    staleTime: 60_000,
  });

  // Shared-entry mutation used only when the parent does not supply onSave.
  const internalMutation = useMutation({
    mutationFn: async (data) => {
      const clean = cleanRfiNumericFields(data);
      if (rfi) {
        return entities.RFI.update(rfi.id, clean);
      }
      const scoped = buildRfiCreatePayload(clean, projectId || clean.project_id);
      const rfiNumber = await getNextFormattedNumber({
        projectId: scoped.project_id,
        recordType: "RFI",
        entityName: "RFI",
        fieldName: "rfi_number",
        prefix: "RFI #",
      });
      if (!rfiNumber) throw new Error("RFI number allocation failed. The RFI was not saved.");
      return entities.RFI.create({
        ...scoped,
        rfi_number: rfiNumber,
      });
    },
    onSuccess: () => {
      // Invalidate both keyed and unkeyed RFI queries so the list refreshes
      qc.invalidateQueries({ queryKey: ["rfis"] });
      if (projectId) qc.invalidateQueries({ queryKey: ["rfis", projectId] });
      toast.success(rfi ? "RFI updated" : "RFI created");
      onClose();
    },
    onError: (err) =>
      toast.error(`Failed to save RFI: ${toUserErrorMessage(err, "Unknown error")}`),
  });

  const submitInFlightRef = useRef(false);

  const quickStatusMut = useMutation({
    mutationFn: (status) => entities.RFI.update(rfi.id, { status }),
    onSuccess: (_, status) => {
      qc.invalidateQueries({ queryKey: ["rfis"] });
      if (projectId) qc.invalidateQueries({ queryKey: ["rfis", projectId] });
      toast.success(`Status set to ${status}`);
      setFormData((f) => ({ ...f, status }));
    },
    onError: (err) => toast.error(toUserErrorMessage(err, "Status update failed")),
  });

  // Whether save is in progress — prefer parent's flag, fall back to internal
  const isSaving = saving || internalMutation.isPending;

  const set = (k, v) => setFormData((f) => ({ ...f, [k]: v }));
  const handleSubmit = () => {
    const pf = buildRfiPreflight(formData);
    const validationError = getRfiSubmissionError(
      formData,
      pf,
      overrideAck,
      overrideReason,
    );
    if (validationError) return toast.error(validationError);

    const payload = buildRfiFormPayload(
      formData,
      pf,
      !pf.passed ? overrideReason.trim() : null,
    );

    // If parent supplied onSave, delegate to it (parent handles persistence + cache).
    if (typeof onSave === "function") {
      if (submitInFlightRef.current) return;
      submitInFlightRef.current = true;
      Promise.resolve()
        .then(() => onSave(payload, pendingPdfFiles))
        .then(
          () => { submitInFlightRef.current = false; },
          () => { submitInFlightRef.current = false; },
        );
      return;
    }

    // Otherwise use the same RPC-backed mutation for shared entry points.
    if (submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    internalMutation.mutate(payload, {
      onSettled: () => { submitInFlightRef.current = false; },
    });
  };
  const handleFormKeyDown = (event) => {
    if (
      event.key !== "Enter"
      || event.target instanceof HTMLTextAreaElement
      || event.target instanceof HTMLButtonElement
    ) return;
    event.preventDefault();
    handleSubmit();
  };

  const statusBtnStyle = (s) => ({
    background: formData.status === s ? "var(--accent)" : "var(--bg-surface)",
    color: formData.status === s ? "var(--on-accent)" : "var(--text-muted)",
    border: `1px solid ${formData.status === s ? "var(--accent)" : "var(--border-default)"}`,
    borderRadius: 6, padding: "4px 10px", fontFamily: "var(--font-mono)",
    fontSize: 8, fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
    textTransform: "uppercase", letterSpacing: "0.06em",
  });

  const title = rfi
    ? `${rfi.rfi_number || "RFI"} — ${(rfi.title || "").slice(0, 30)}${(rfi.title || "").length > 30 ? "…" : ""}`
    : "New RFI";

  const preflight = buildRfiPreflight(formData);
  const duplicateMatches = findDuplicateRfis(formData, existingRfis);
  const workPackageOptions = buildWorkPackageOptions(workPackages);
  const drawingSetOptions = buildDrawingSetOptions(drawingSets);

  return (
    <div style={{ position: "fixed", inset: 0, background: "color-mix(in srgb, var(--bg-base) 65%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={trapRef} className="sbd-card-strong" style={{ background: "var(--bg-surface-secondary)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", maxWidth: 780, width: "96%", maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 80px color-mix(in srgb, var(--bg-base) 80%, transparent)" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "16px 24px 12px", borderBottom: "1px solid var(--divider)", background: "var(--bg-surface-low)", flexShrink: 0 }}>
          <h2 style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--text-primary)", margin: 0, textTransform: "uppercase", letterSpacing: "0.10em" }}>{title}</h2>
          {rfi && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {["Open", "Under Review", "Incomplete Response", "Answered", "Closed"].map((s) => (
                <button key={s} style={statusBtnStyle(s)} onClick={() => quickStatusMut.mutate(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <div id="rfi-form" onKeyDown={handleFormKeyDown} style={{ flex: 1, overflowY: "auto", padding: "0 24px 16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>

            {/* Section 1 — Identity */}
            <SectionLabel>Identity</SectionLabel>
            <Field label="Project" span={3}>
              <DarkSelect
                value={formData.project_id}
                onChange={(value) => set("project_id", value)}
                placeholder="Select project..."
                options={projects.map((p) => ({ value: p.id, label: p.name || p.project_number || "Unnamed project" }))}
              />
            </Field>
            <FormField label="Title *" labelStyle={labelStyle} style={{ gridColumn: "span 3" }}>
              {({ id }) => (
                <input id={id} style={iStyle} value={formData.title} onChange={(e) => set("title", e.target.value)} required />
              )}
            </FormField>
            <Field label="RFI Type" span={3}>
              <DarkSelect
                value={formData.rfi_type || ""}
                onChange={(value) => set("rfi_type", value)}
                placeholder="Classify this RFI..."
                options={RFI_TYPES.map((t) => ({ value: t, label: t }))}
              />
            </Field>

            {/* Section 2 — Details */}
            <SectionLabel>Details</SectionLabel>
            <Field label="RFI #">
              {rfi ? (
                <input
                  style={iStyle}
                  value={formData.rfi_number || ""}
                  onChange={(e) => set("rfi_number", e.target.value)}
                  placeholder="RFI 001"
                />
              ) : (
                <input
                  style={{ ...iStyle, opacity: 0.7 }}
                  value={formData.rfi_number || ""}
                  onChange={(e) => set("rfi_number", e.target.value)}
                  placeholder="Auto-assigned if blank"
                />
              )}
            </Field>
            <FormField label="Drawing Reference" labelStyle={labelStyle} style={{ gridColumn: "span 2" }}>
              {({ id }) => (
                <input id={id} style={iStyle} value={formData.drawing_reference} onChange={(e) => set("drawing_reference", e.target.value)} placeholder="e.g. Sheet A-2.3" />
              )}
            </FormField>
            <FormField label="Spec Section" labelStyle={labelStyle} style={{ gridColumn: "span 1" }}>
              {({ id }) => (
                <input id={id} style={iStyle} value={formData.spec_section} onChange={(e) => set("spec_section", e.target.value)} placeholder="e.g. 05120" />
              )}
            </FormField>
            <Field label="Discipline" span={3}>
              <DarkSelect
                value={formData.discipline || ""}
                onChange={(value) => set("discipline", value)}
                placeholder="Unspecified"
                options={["Structural", "Connections", "Misc Metals", "Anchor Bolts"].map((d) => ({ value: d, label: d }))}
              />
              <select
                style={{ display: "none" }}
                value={formData.discipline || ""}
                onChange={(e) => set("discipline", e.target.value)}
              >
                <option value="">— Unspecified —</option>
                {["Structural", "Connections", "Misc Metals", "Anchor Bolts"].map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </Field>
            <Field label="Piece Marks" span={2}>
              <input
                style={iStyle}
                value={formData.piece_marks}
                onChange={(e) => set("piece_marks", e.target.value)}
                placeholder="Affected pieces, e.g. C-12, B-7"
              />
            </Field>
            <Field label="Fab Hold" span={1}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", minHeight: 38 }}>
                <input
                  type="checkbox"
                  checked={!!formData.fab_hold}
                  onChange={(e) => set("fab_hold", e.target.checked)}
                />
                <span style={{ fontSize: 12, color: formData.fab_hold ? "var(--status-error)" : "var(--text-secondary)", fontWeight: formData.fab_hold ? 700 : 400 }}>
                  Hold fabrication
                </span>
              </label>
            </Field>
            {/* Section — Linking (work package + drawing set) */}
            <SectionLabel>Linking</SectionLabel>
            <div style={{ gridColumn: "span 3" }}>
              <AutoLinkSuggestions
                entity={formData}
                sources={{ drawings: projectDrawings, workPackages: workPackages, rfis: existingRfis }}
                onLink={(suggestion) => {
                  const patch = deriveAutoLinkPatch(suggestion);
                  if (patch) setFormData((current) => ({ ...current, ...patch }));
                }}
              />
            </div>
            <Field label="Work Package" span={1}>
              <DarkSelect
                value={formData.work_package_id || ""}
                onChange={(value) => set("work_package_id", value || null)}
                placeholder="None"
                options={workPackageOptions}
              />
            </Field>
            <Field label="Drawing Set" span={1}>
              <DarkSelect
                value={formData.drawing_set_id || ""}
                onChange={(value) => set("drawing_set_id", value || null)}
                placeholder="None"
                options={drawingSetOptions}
              />
            </Field>
            <Field label="Area / Sequence" span={1}>
              <input style={iStyle} value={formData.area_sequence || ""} onChange={(e) => set("area_sequence", e.target.value)} placeholder="e.g. Area A, Seq 3" />
            </Field>

            <FormField label="Description" labelStyle={labelStyle} style={{ gridColumn: "span 3" }}>
              {({ id }) => (
                <textarea id={id} style={{ ...iStyle, minHeight: 70, resize: "vertical" }} value={formData.description} onChange={(e) => set("description", e.target.value)} />
              )}
            </FormField>
            <FormField label="Question / Issue" labelStyle={labelStyle} style={{ gridColumn: "span 3" }}>
              {({ id }) => (
                <textarea id={id} style={{ ...iStyle, minHeight: 70, resize: "vertical" }} value={formData.question} onChange={(e) => set("question", e.target.value)} />
              )}
            </FormField>
            <FormField label="Proposed Resolution" labelStyle={labelStyle} style={{ gridColumn: "span 3" }}>
              {({ id }) => (
                <textarea id={id} style={{ ...iStyle, minHeight: 56, resize: "vertical" }} value={formData.proposed_solution} onChange={(e) => set("proposed_solution", e.target.value)} placeholder="Your recommended answer — speeds review and documents intent." />
              )}
            </FormField>
            {duplicateMatches.length > 0 && <DuplicateWarning matches={duplicateMatches} />}
            <PreflightScorecard result={preflight} />
            {!preflight.passed && (
              <div style={{ gridColumn: "span 3", border: "1px solid var(--status-error)", borderRadius: 6, padding: 12, background: "var(--danger-muted)" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: overrideAck ? 8 : 0 }}>
                  <input type="checkbox" checked={overrideAck} onChange={(e) => setOverrideAck(e.target.checked)} style={{ width: 14, height: 14, cursor: "pointer", flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: "var(--text-primary)", fontWeight: 700 }}>
                    Submit anyway — override {preflight.blockers.length} unresolved required item{preflight.blockers.length === 1 ? "" : "s"}
                  </span>
                </label>
                {overrideAck && (
                  <textarea
                    style={{ ...iStyle, minHeight: 48, resize: "vertical" }}
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="Reason for overriding preflight (required, logged with the RFI)"
                  />
                )}
              </div>
            )}

            {/* Section 3 — Routing */}
            <SectionLabel>Routing</SectionLabel>
            <Field label="Priority">
              <DarkSelect value={formData.priority} onChange={(value) => set("priority", value)} options={["Critical", "High", "Medium", "Low"].map((o) => ({ value: o, label: o }))} />
              <select style={{ display: "none" }} value={formData.priority} onChange={(e) => set("priority", e.target.value)}>
                {["Critical", "High", "Medium", "Low"].map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <DarkSelect value={formData.status} onChange={(value) => set("status", value)} options={["Open", "Under Review", "Incomplete Response", "Answered", "Closed"].map((o) => ({ value: o, label: o }))} />
              <select style={{ display: "none" }} value={formData.status} onChange={(e) => set("status", e.target.value)}>
                {["Open", "Under Review", "Incomplete Response", "Answered", "Closed"].map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Ball in Court">
              <DarkSelect value={formData.ball_in_court} onChange={(value) => set("ball_in_court", value)} options={["Contractor", "GC", "Engineer", "Architect", "Owner"].map((o) => ({ value: o, label: o }))} />
              <select style={{ display: "none" }} value={formData.ball_in_court} onChange={(e) => set("ball_in_court", e.target.value)}>
                {["Contractor", "GC", "Engineer", "Architect", "Owner"].map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Submitted By">
              <input style={iStyle} value={formData.submitted_by} onChange={(e) => set("submitted_by", e.target.value)} />
            </Field>
            <Field label="Submitted Date">
              <input type="date" style={iStyle} value={formData.submitted_date} onChange={(e) => set("submitted_date", e.target.value)} />
            </Field>
            <Field label="Date Required">
              <input type="date" style={iStyle} value={formData.date_required} onChange={(e) => set("date_required", e.target.value)} />
            </Field>

            {/* Section 4 — Response */}
            <SectionLabel>Response</SectionLabel>
            <Field label="Assigned To">
              <input style={iStyle} value={formData.assigned_to} onChange={(e) => set("assigned_to", e.target.value)} />
            </Field>
            <Field label="Distribution List" span={2}>
              <input style={iStyle} value={formData.distribution_list} onChange={(e) => set("distribution_list", e.target.value)} placeholder="Names or emails, comma-separated" />
            </Field>
            <Field label="Response / Answer" span={3}>
              <textarea style={{ ...iStyle, minHeight: 70, resize: "vertical" }} value={formData.answer} onChange={(e) => set("answer", e.target.value)} />
            </Field>
            <Field label="Answered By">
              <input style={iStyle} value={formData.answered_by} onChange={(e) => set("answered_by", e.target.value)} />
            </Field>
            <Field label="Date Answered" span={2}>
              <input type="date" style={iStyle} value={formData.date_answered} onChange={(e) => set("date_answered", e.target.value)} />
            </Field>

            {/* Section 5 — Impact */}
            <SectionLabel>Impact</SectionLabel>
            <div style={{ gridColumn: "span 3", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)" }}>
                  <input type="checkbox" checked={formData.cost_impact} onChange={(e) => set("cost_impact", e.target.checked)} style={{ width: 14, height: 14, cursor: "pointer" }} />
                  Cost Impact
                </label>
                {formData.cost_impact && (
                  <input
                    type="number"
                    placeholder="Amount $"
                    style={{ ...iStyle, width: 160 }}
                    value={formData.cost_impact_amount}
                    onChange={(e) => set("cost_impact_amount", e.target.value)}
                  />
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)" }}>
                  <input type="checkbox" checked={formData.schedule_impact} onChange={(e) => set("schedule_impact", e.target.checked)} style={{ width: 14, height: 14, cursor: "pointer" }} />
                  Schedule Impact
                </label>
                {formData.schedule_impact && (
                  <input
                    type="number"
                    placeholder="Days"
                    style={{ ...iStyle, width: 120 }}
                    value={formData.schedule_impact_days}
                    onChange={(e) => set("schedule_impact_days", e.target.value)}
                  />
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                {[
                  ["drawing_revision_required", "Drawing revision required"],
                  ["change_order_likely", "Change order likely"],
                  ["fab_impact", "Fabrication impact"],
                  ["erection_impact", "Erection impact"],
                ].map(([key, lbl]) => (
                  <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)" }}>
                    <input type="checkbox" checked={!!formData[key]} onChange={(e) => set(key, e.target.checked)} style={{ width: 14, height: 14, cursor: "pointer" }} />
                    {lbl}
                  </label>
                ))}
              </div>
            </div>

            <SectionLabel>PDF Attachments</SectionLabel>
            <RfiPdfAttachments
              inputRef={pdfInputRef}
              existingDocuments={existingPdfDocs}
              pendingFiles={pendingPdfFiles}
              onAddFiles={addPdfFiles}
              onOpenDocument={openAttachment}
              onRemoveFile={removePendingPdf}
            />

          </div>

          {/* Inbound chips — schedule tasks that link to this RFI. Read-only;
              edit the link from the schedule task's LINKS tab. Only renders
              when we're editing an existing RFI (new RFIs have no id yet). */}
          {rfi?.id && formData.project_id && (
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--divider)" }}>
              <RelatedScheduleTasksChips
                projectId={formData.project_id}
                relatedField="related_rfi_ids"
                targetId={rfi.id}
              />
            </div>
          )}
        </div>
        {/* Footer */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "12px 24px", borderTop: "1px solid var(--divider)", background: "var(--bg-surface)", flexShrink: 0 }}>
          <button type="button" onClick={onClose} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 4, padding: "8px 16px", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={isSaving} style={{ background: "var(--accent)", color: "var(--on-accent)", border: "none", borderRadius: 4, padding: "8px 20px", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, cursor: isSaving ? "not-allowed" : "pointer", textTransform: "uppercase", letterSpacing: "0.08em", opacity: isSaving ? 0.6 : 1 }}>
            {isSaving ? "Saving..." : rfi ? "Update RFI" : "Submit RFI"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DarkSelect({ value, options, onChange, placeholder = "Select..." }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const close = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen((next) => !next)} style={darkSelectButtonStyle}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: selected ? "var(--text-primary)" : "var(--text-muted)" }}>
          {selected?.label || placeholder}
        </span>
        <span style={{ color: "var(--text-muted)", transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.12s" }}>v</span>
      </button>
      {open && (
        <div style={darkSelectMenuStyle}>
          {placeholder && (
            <button type="button" onClick={() => { onChange(""); setOpen(false); }} style={darkSelectOptionStyle(!value)}>
              {placeholder}
            </button>
          )}
          {options.map((option) => (
            <button key={option.value} type="button" onClick={() => { onChange(option.value); setOpen(false); }} style={darkSelectOptionStyle(option.value === value)}>
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const darkSelectButtonStyle = {
  ...iStyle,
  minHeight: 37,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  textAlign: "left",
  cursor: "pointer",
  background: "var(--bg-input)",
  borderRadius: 8,
};

const darkSelectMenuStyle = {
  position: "absolute",
  zIndex: 4000,
  top: "calc(100% + 4px)",
  left: 0,
  right: 0,
  maxHeight: 220,
  overflowY: "auto",
  padding: 4,
  background: "var(--bg-surface-secondary)",
  border: "1px solid color-mix(in srgb, var(--accent) 32%, var(--border-default))",
  borderRadius: 10,
  boxShadow: "0 18px 46px color-mix(in srgb, var(--bg-base) 74%, transparent), inset 0 1px 0 color-mix(in srgb, var(--text-primary) 6%, transparent)",
};

const darkSelectOptionStyle = (active) => ({
  width: "100%",
  border: "1px solid transparent",
  borderRadius: 7,
  background: active ? "var(--accent-muted)" : "transparent",
  color: active ? "var(--accent)" : "var(--text-primary)",
  padding: "8px 10px",
  textAlign: "left",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  fontWeight: active ? 800 : 600,
  cursor: "pointer",
});
