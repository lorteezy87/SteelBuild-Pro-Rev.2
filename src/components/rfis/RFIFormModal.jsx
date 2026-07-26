import React, { useState, useEffect, useRef } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { entities, resolveFileUrl } from "@/api/supabaseClient";
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
  const pdfInputRef = useRef(null);

  const empty = {
    project_id: projectId || "",
    title: "", description: "", question: "", answer: "",
    drawing_reference: "", spec_section: "",
    priority: "Medium", status: "Open",
    // Discipline drives the RFIs page filter chips (All / Structural /
    // Connections / Misc Metals / Anchor Bolts) and the row's
    // discipline column. Field was missing from this form, so RFIs
    // imported from CSV showed a discipline but the user couldn't
    // change it — only fix it via the bulk-edit modal.
    discipline: "",
    submitted_by: "", submitted_date: new Date().toISOString().split("T")[0],
    date_required: "", date_answered: "",
    assigned_to: "", answered_by: "",
    ball_in_court: "Contractor",
    cost_impact: false, cost_impact_amount: "",
    schedule_impact: false, schedule_impact_days: "",
    distribution_list: "",
    work_package_id: "",
    drawing_set_id: "",
    area_sequence: "",
    // RFI workflow backbone fields. Held as local form fields and folded into
    // metadata.{rfi_type,proposed_solution} on submit, so no schema change is
    // required.
    rfi_type: "",
    proposed_solution: "",
    // Fabrication-protection fields — also metadata-held (no schema change):
    //   fab_hold     → mark that this RFI should hold fabrication of its sheets
    //   piece_marks  → affected piece marks (comma/space separated)
    fab_hold: false,
    piece_marks: "",
    // Qualitative impact flags (metadata-held like the fields above) — beyond the
    // cost/schedule columns; shown on the RFI and used as answer-time triggers.
    fab_impact: false,
    erection_impact: false,
    drawing_revision_required: false,
    change_order_likely: false,
  };

  // Seed the workflow-backbone fields from metadata when editing an existing
  // RFI (they live under metadata, not as top-level columns).
  const seedFromRfi = (r) => ({
    ...empty,
    ...r,
    rfi_type: r?.metadata?.rfi_type || "",
    proposed_solution: r?.metadata?.proposed_solution || "",
    fab_hold: !!r?.metadata?.fab_hold,
    piece_marks: r?.metadata?.piece_marks || "",
    fab_impact: !!r?.metadata?.fab_impact,
    erection_impact: !!r?.metadata?.erection_impact,
    drawing_revision_required: !!r?.metadata?.drawing_revision_required,
    change_order_likely: !!r?.metadata?.change_order_likely,
  });

  // Pre-fill drawing_reference when the modal is opened for a NEW
  // RFI (rfi === null) — used by the drawing-hub "Create RFI from
  // zone" flow so the user sees the sheet + zone context baked in
  // before they start typing. Still editable, just not blank.
  // `prefill` (optional) seeds a brand-new RFI with values carried in from
  // another screen — e.g. the "Create RFI from revision delta" flow. The user
  // still reviews/edits before saving; project_id always wins last so the RFI
  // lands on the right project regardless of what prefill carries.
  const seedEmpty = {
    ...empty,
    drawing_reference: initialDrawingReference || empty.drawing_reference,
    ...(prefill || {}),
    project_id: projectId || empty.project_id,
  };
  const [formData, setFormData] = useState(rfi ? seedFromRfi(rfi) : seedEmpty);
  const [pendingPdfFiles, setPendingPdfFiles] = useState([]);
  // Preflight override — when required checks fail, the author can still submit
  // by acknowledging and giving a reason (logged to metadata.preflight_override).
  const [overrideAck, setOverrideAck] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  useEffect(() => {
    setFormData(rfi
      ? seedFromRfi(rfi)
      : { ...empty, drawing_reference: initialDrawingReference || "", ...(prefill || {}), project_id: projectId || "" });
    setPendingPdfFiles([]);
    setOverrideAck(false);
    setOverrideReason("");
  }, [rfi, projectId, initialDrawingReference, prefill]);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    initialData: [],
    staleTime: 5 * 60 * 1000,
  });
  const { data: existingPdfDocs = [] } = useQuery({
    queryKey: ["rfi-documents", rfi?.id],
    queryFn: () => rfi?.id ? entities.Document.filter({ rfi_id: rfi.id }, "-uploaded_date") : [],
    enabled: !!rfi?.id,
    initialData: [],
    staleTime: 30 * 1000,
  });

  // Work packages for the active project — used in the Linking section
  const activeProjectId = formData.project_id || projectId;
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
      // Coerce empty-string numeric fields to null so Postgres doesn't reject them
      const clean = {
        ...data,
        cost_impact_amount:   data.cost_impact_amount   === "" ? null : data.cost_impact_amount   !== undefined ? Number(data.cost_impact_amount)   : null,
        schedule_impact_days: data.schedule_impact_days === "" ? null : data.schedule_impact_days !== undefined ? Number(data.schedule_impact_days) : null,
      };
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
  const addPdfFiles = (fileList) => {
    const incoming = Array.from(fileList || []);
    const pdfs = [];
    const rejected = [];
    for (const file of incoming) {
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
      if (isPdf) pdfs.push(file);
      else rejected.push(file.name || "Unknown file");
    }
    if (rejected.length) toast.warning("Only PDF files can be attached to RFIs");
    if (!pdfs.length) return;
    setPendingPdfFiles((prev) => {
      const existing = new Set(prev.map((file) => `${file.name}:${file.size}`));
      return [...prev, ...pdfs.filter((file) => !existing.has(`${file.name}:${file.size}`))];
    });
  };
  const removePendingPdf = (fileName, size) => {
    setPendingPdfFiles((prev) => prev.filter((file) => !(file.name === fileName && file.size === size)));
    if (pdfInputRef.current) pdfInputRef.current.value = "";
  };
  const isAllowedFileReference = (value) => {
    if (!value || typeof value !== "string") return false;
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (/^https?:\/\//i.test(trimmed)) return true;
    // Treat non-protocol values as storage paths that must be signed.
    return !/^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  };

  const openAttachment = async (fileUrl) => {
    if (!isAllowedFileReference(fileUrl)) {
      toast.error("Blocked unsafe attachment URL");
      return;
    }
    const resolvedUrl = await resolveFileUrl(fileUrl);
    if (!resolvedUrl || !/^https?:\/\//i.test(resolvedUrl)) {
      toast.error("Unable to open attachment");
      return;
    }
    window.open(resolvedUrl, "_blank", "noopener,noreferrer");
  };

  const buildPayload = (pf, overrideReasonText = null) => {
    // rfi_type / proposed_solution are local-only fields — fold them into the
    // existing metadata JSON and strip the top-level keys so we never send a
    // non-column (no schema dependency). The preflight score + any override
    // reason are recorded the same way — queryable, no migration.
    const { rfi_type, proposed_solution, fab_hold, piece_marks, fab_impact, erection_impact, drawing_revision_required, change_order_likely, ...rest } = formData;
    return {
      ...rest,
      metadata: {
        ...(formData.metadata || {}),
        rfi_type,
        proposed_solution,
        fab_hold: !!fab_hold,
        piece_marks: (piece_marks || "").trim(),
        fab_impact: !!fab_impact,
        erection_impact: !!erection_impact,
        drawing_revision_required: !!drawing_revision_required,
        change_order_likely: !!change_order_likely,
        preflight_score: pf ? pf.score : (formData.metadata?.preflight_score ?? null),
        preflight_override: overrideReasonText
          ? { reason: overrideReasonText, score: pf?.score ?? null, blockers: (pf?.blockers || []).map((b) => b.key), at: new Date().toISOString() }
          : (formData.metadata?.preflight_override ?? null),
      },
    };
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.title?.trim()) return toast.error("Title is required");

    // Preflight gate — required-check failures block submission so
    // under-specified RFIs don't ship. The author can still submit by
    // acknowledging the override and giving a reason (logged). Soft checks
    // never block.
    const pf = buildRfiPreflight(formData);
    if (!pf.passed) {
      if (!overrideAck) {
        return toast.error(`Preflight: resolve ${pf.blockers.map((b) => b.label).join("; ")} — or check "Submit anyway" and give a reason`);
      }
      if (!overrideReason.trim()) {
        return toast.error("Enter a reason to override the preflight and submit");
      }
    }

    const payload = buildPayload(pf, !pf.passed ? overrideReason.trim() : null);

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

  const statusBtnStyle = (s) => ({
    background: formData.status === s ? "var(--accent)" : "var(--bg-surface)",
    color: formData.status === s ? "white" : "var(--text-muted)",
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

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={trapRef} className="sbd-card-strong" style={{ background: "var(--bg-surface-secondary)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", maxWidth: 780, width: "96%", maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.8)" }}>
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

        <form id="rfi-form" onSubmit={handleSubmit} style={{ flex: 1, overflowY: "auto", padding: "0 24px 16px" }}>
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
                  placeholder="RFI #001"
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
                  if (suggestion.type === "work_package" || suggestion.type === "sequence") {
                    set("work_package_id", suggestion.entityId);
                  }
                  if (suggestion.type === "drawing") {
                    const drawing = suggestion.matchedEntity;
                    if (drawing.drawing_set_id) set("drawing_set_id", drawing.drawing_set_id);
                  }
                }}
              />
            </div>
            <Field label="Work Package" span={1}>
              <DarkSelect
                value={formData.work_package_id || ""}
                onChange={(value) => set("work_package_id", value || null)}
                placeholder="None"
                options={workPackages.map((wp) => ({
                  value: wp.id,
                  label: [wp.wp_number, wp.name].filter(Boolean).join(" — ") || wp.id.slice(0, 8),
                }))}
              />
            </Field>
            <Field label="Drawing Set" span={1}>
              <DarkSelect
                value={formData.drawing_set_id || ""}
                onChange={(value) => set("drawing_set_id", value || null)}
                placeholder="None"
                options={drawingSets
                  .filter((ds) => !ds.is_deleted)
                  .map((ds) => ({
                    value: ds.id,
                    label: [ds.set_name, ds.revision ? `Rev ${ds.revision}` : null].filter(Boolean).join(" — ") || ds.id.slice(0, 8),
                  }))}
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
            <div style={{ gridColumn: "span 3" }}>
              <input
                ref={pdfInputRef}
                type="file"
                accept="application/pdf,.pdf"
                multiple
                style={{ display: "none" }}
                onChange={(e) => addPdfFiles(e.target.files)}
              />
              <div
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); addPdfFiles(e.dataTransfer.files); }}
                style={attachmentDropStyle}
              >
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    Attach RFI PDFs
                  </div>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                    Upload sketches, vendor responses, marked-up sheets, or official RFI PDFs. Files are linked to this RFI after save.
                  </div>
                </div>
                <button type="button" onClick={() => pdfInputRef.current?.click()} style={uploadButtonStyle}>
                  Select PDF
                </button>
              </div>
              {(existingPdfDocs.length > 0 || pendingPdfFiles.length > 0) && (
                <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                  {existingPdfDocs.map((doc) => (
                    <AttachmentRow
                      key={doc.id}
                      name={doc.display_name || doc.file_name || "RFI PDF"}
                      meta={`${Math.round(Number(doc.file_size_kb) || 0)} KB - uploaded`}
                      onOpen={() => openAttachment(doc.file_url)}
                    />
                  ))}
                  {pendingPdfFiles.map((file) => (
                    <AttachmentRow
                      key={`${file.name}:${file.size}`}
                      name={file.name}
                      meta={`${Math.round(file.size / 1024)} KB - pending save`}
                      onRemove={() => removePendingPdf(file.name, file.size)}
                    />
                  ))}
                </div>
              )}
            </div>

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
        </form>
        {/* Footer */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "12px 24px", borderTop: "1px solid var(--divider)", background: "var(--bg-surface)", flexShrink: 0 }}>
          <button type="button" onClick={onClose} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 4, padding: "8px 16px", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Cancel
          </button>
          <button type="submit" form="rfi-form" disabled={isSaving} style={{ background: "var(--accent)", color: "white", border: "none", borderRadius: 4, padding: "8px 20px", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, cursor: isSaving ? "not-allowed" : "pointer", textTransform: "uppercase", letterSpacing: "0.08em", opacity: isSaving ? 0.6 : 1 }}>
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

function AttachmentRow({ name, meta, onOpen, onRemove }) {
  return (
    <div style={attachmentRowStyle}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 800, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
          {meta}
        </div>
      </div>
      {onOpen && (
        <button type="button" onClick={onOpen} style={attachmentActionStyle}>
          Open
        </button>
      )}
      {onRemove && (
        <button type="button" onClick={onRemove} style={{ ...attachmentActionStyle, color: "var(--status-error)", borderColor: "var(--danger-border)" }}>
          Remove
        </button>
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
  boxShadow: "0 18px 46px rgba(0,0,0,0.74), inset 0 1px 0 rgba(255,255,255,0.06)",
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

const attachmentDropStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 14,
  padding: 14,
  border: "1px dashed color-mix(in srgb, var(--accent) 45%, var(--border-default))",
  borderRadius: 12,
  background: "linear-gradient(135deg, rgba(86,176,255,0.08), rgba(255,255,255,0.025))",
};

const uploadButtonStyle = {
  border: "1px solid var(--accent-border)",
  borderRadius: 8,
  background: "var(--accent-muted)",
  color: "var(--accent)",
  padding: "8px 13px",
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const attachmentRowStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: 10,
  alignItems: "center",
  padding: "9px 10px",
  border: "1px solid var(--border-default)",
  borderRadius: 9,
  background: "rgba(255,255,255,0.035)",
};

const attachmentActionStyle = {
  border: "1px solid var(--border-default)",
  borderRadius: 7,
  background: "rgba(255,255,255,0.04)",
  color: "var(--accent)",
  padding: "5px 8px",
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  fontWeight: 900,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  textDecoration: "none",
  cursor: "pointer",
};
