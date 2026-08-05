import React, { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import { supabase } from "@/lib/supabase";
import { formatBudgetPercent } from "../shared/formatters";
import { getDraftDrawingsWarning } from "../shared/workflowValidation";
import { sortDrawingSetPackages, formatDrawingSetNumber } from "@/lib/drawingSetOrdering";
import AutoLinkSuggestions from "@/components/shared/AutoLinkSuggestions";
import PhoenixModal, { btnPrimary, btnSecondary, inputStyle, inputDisabledStyle, FormField } from "@/components/shared/PhoenixModal";
import { isPieceDrivenWorkPackageProgress } from "@/lib/pieceControl/wpProgressMapping";

const empty = {
  name: "", project_id: "", project_name: "", phase: "Detailing",
  released_date: "", scheduled_start_date: "", scheduled_end_date: "",
  status: "Not Started", tonnage: 0,
  shop_hours_budget: 0, shop_hours_actual: 0,
  field_hours_budget: 0, field_hours_actual: 0,
  crew: "", linked_drawing_ids: "", linked_rfi_ids: "", notes: "", percent_complete: 0,
  vif_confirmed: false, vif_confirmed_by: "", vif_confirmed_date: "",
  load_list_complete: false, sequence_confirmed: false,
  area: "", sequence_number: "", trade_phase: "", shipping_phase: "", install_phase: "",
};

const selectStyle = {
  ...inputStyle,
  cursor: "pointer",
};

const SectionDivider = ({ label }) => (
  <div style={{ gridColumn: "span 2", borderTop: "1px solid var(--divider)", paddingTop: 14, marginTop: 6 }}>
    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, letterSpacing: "0.14em", color: "var(--text-muted)", textTransform: "uppercase" }}>{label}</span>
  </div>
);

const calcStyle = (val, ref) => ({
  ...inputDisabledStyle,
  color: Number(val) > Number(ref) && Number(ref) > 0 ? "var(--status-error)" : "var(--text-muted)"
});

export default function WPFormModal({ open, onClose, onSave, wp, projects = [], nextNumber, allDrawings = [], defaultProjectId = "" }) {
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [linkedDrawingIds, setLinkedDrawingIds] = useState([]);
  const [setSearch, setSetSearch] = useState("");
  const [showSetDropdown, setShowSetDropdown] = useState(false);

  const activeProjectId = form.project_id || (wp && wp.project_id);
  const { data: projectRfis = [] } = useQuery({
    queryKey: ["rfis", activeProjectId],
    queryFn: () => activeProjectId ? entities.RFI.filter({ project_id: activeProjectId }) : [],
    enabled: Boolean(activeProjectId),
    staleTime: 60_000,
  });

  const { data: pieceProgressGate } = useQuery({
    queryKey: ["wp-piece-progress-gate", activeProjectId, wp?.id],
    enabled: Boolean(open && activeProjectId && wp?.id),
    staleTime: 30_000,
    queryFn: async () => {
      const db = supabase;
      const [{ data: project }, { data: pieces, error }] = await Promise.all([
        db.from("projects").select("piece_control_mode").eq("id", activeProjectId).maybeSingle(),
        db
          .from("pieces")
          .select("id, parent_piece_id, is_container, is_deleted, deleted_at")
          .eq("project_id", activeProjectId)
          .eq("work_package_id", wp.id)
          .eq("is_deleted", false)
          .is("deleted_at", null),
      ]);
      if (error) throw error;
      const rows = pieces || [];
      const parentIds = new Set(
        rows.map((row) => row.parent_piece_id).filter(Boolean),
      );
      const leafCount = rows.filter(
        (row) => !row.is_container && !parentIds.has(row.id),
      ).length;
      return {
        mode: project?.piece_control_mode ?? "off",
        leafCount,
      };
    },
  });
  const pieceDrivenProgress = isPieceDrivenWorkPackageProgress(
    pieceProgressGate?.mode,
    pieceProgressGate?.leafCount ?? 0,
  );

  useEffect(() => {
    if (wp) {
      setForm({ ...empty, ...wp });
      const drawingIds = (wp.linked_drawing_ids || "").split(",").map(s => s.trim()).filter(Boolean);
      setLinkedDrawingIds(drawingIds);
    } else {
      // Pre-select the project you're working in so the Linked Drawings picker
      // is unlocked immediately — its drawings are already loaded for this
      // project, and without this the picker stays behind a "Select a project"
      // gate even though you're inside one. project_name is filled on save.
      setForm({ ...empty, wp_number: nextNumber || "", project_id: defaultProjectId || "" });
      setLinkedDrawingIds([]);
    }
    setErrors({});
    setSetSearch("");
  }, [wp, open, nextNumber, defaultProjectId]);

  const validate = () => {
    const e = {};
    if (!form.name?.trim()) e.name = "Required";
    // Enforce workflow: Fabrication requires at least one approved linked drawing
    if (form.phase === "Fabrication" && linkedDrawingIds.length === 0) {
      e.phase = "Cannot advance to Fabrication without linked drawings";
    } else if (form.phase === "Fabrication" && !hasApprovedLinkedDrawings) {
      e.phase = "Linked drawings must be approved (Released/IFC) before Fabrication";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    // Strip read-only / server-generated fields before sending
    const { id: _id, created_at: _ca, updated_at: _ua, created_date: _cd, updated_date: _ud, ...rest } = form;
    const data = {
      ...rest,
      linked_drawing_ids: linkedDrawingIds.join(","),
      tonnage: Number(form.tonnage) || 0,
      shop_hours_budget: Number(form.shop_hours_budget) || 0,
      shop_hours_actual: Number(form.shop_hours_actual) || 0,
      field_hours_budget: Number(form.field_hours_budget) || 0,
      field_hours_actual: Number(form.field_hours_actual) || 0,
      percent_complete: Math.min(100, Math.max(0, Number(form.percent_complete) || 0)),
    };
    if (pieceDrivenProgress) {
      // Progress is written by refresh_work_package_progress from leaf pieces.
      delete data.percent_complete;
      delete data.status;
    }
    const proj = projects.find(p => p.id === form.project_id);
    if (proj) data.project_name = proj.name;
    onSave(data);
  };

  // Add EVERY sheet in a drawing set (§21: the set/package is the tracked unit
  // of fab assignment, not the individual sheet). We still persist the union of
  // sheet ids in linked_drawing_ids so downstream readiness checks are unchanged.
  const addSet = (opt) => {
    const ids = opt.drawings.map((d) => d.id).filter(Boolean);
    setLinkedDrawingIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return [...next];
    });
    setSetSearch("");
    setShowSetDropdown(false);
  };

  // Remove every linked sheet that belongs to this set.
  const removeSet = (group) => {
    const remove = new Set(group.ids);
    setLinkedDrawingIds((prev) => prev.filter((id) => !remove.has(id)));
  };

  const projectDrawings = allDrawings.filter(d => !form.project_id || d.project_id === form.project_id);

  // "Approved" = drawings past the BFA gate. In the corrected 7-stage flow
  // (migration 077): OFS, IFC, Released. "Approved" string kept for any
  // legacy submittal-shape data flowing through here.
  const APPROVED_STAGES = ["Released", "IFC", "Issued for Construction", "OFS", "Approved", "Approved as Noted"];

  // Group the project's drawings into SETS — the assignable unit. Set identity
  // is the (required) drawing_set_name; ungrouped sheets fall under "Unassigned"
  // and sort last. Reuses the canonical set-ordering helper (§21).
  const drawingSetOptions = useMemo(() => {
    const map = new Map();
    for (const d of projectDrawings) {
      if (!d?.id) continue;
      const name = (d.drawing_set_name || "").trim();
      const key = name.toLowerCase() || "__unassigned__";
      let opt = map.get(key);
      if (!opt) {
        opt = { key, set_name: name || "Unassigned", isUngrouped: !name, drawings: [] };
        map.set(key, opt);
      }
      opt.drawings.push(d);
    }
    return sortDrawingSetPackages([...map.values()]);
  }, [projectDrawings]);

  const linkedIdSet = useMemo(() => new Set(linkedDrawingIds), [linkedDrawingIds]);

  // Sets with at least one un-linked sheet — what the picker offers, filtered by
  // the search box. Carries linked/approved counts for the row display.
  const filteredSetOptions = drawingSetOptions
    .map((opt) => {
      let linkedCount = 0;
      let approvedCount = 0;
      for (const d of opt.drawings) {
        if (linkedIdSet.has(d.id)) linkedCount += 1;
        if (APPROVED_STAGES.includes(d.stage || d.status)) approvedCount += 1;
      }
      return { ...opt, linkedCount, approvedCount, total: opt.drawings.length };
    })
    .filter(
      (opt) =>
        opt.linkedCount < opt.total &&
        (!setSearch || opt.set_name.toLowerCase().includes(setSearch.toLowerCase())),
    );

  // Linked sheets grouped back into their sets — drives the chips + remove-by-set.
  const linkedSetGroups = useMemo(() => {
    const map = new Map();
    for (const id of linkedDrawingIds) {
      const d = allDrawings.find((dw) => dw.id === id);
      const name = (d?.drawing_set_name || "").trim();
      const key = name.toLowerCase() || "__unassigned__";
      let g = map.get(key);
      if (!g) {
        g = { key, set_name: name || "Unassigned", isUngrouped: !name, ids: [], total: 0 };
        map.set(key, g);
      }
      g.ids.push(id);
    }
    for (const opt of drawingSetOptions) {
      const g = map.get(opt.key);
      if (g) g.total = opt.drawings.length;
    }
    return sortDrawingSetPackages([...map.values()]);
  }, [linkedDrawingIds, allDrawings, drawingSetOptions]);

  const draftWarning = getDraftDrawingsWarning(linkedDrawingIds.join(","), allDrawings);
  const hasProjectSelected = !!form.project_id;
  const projectDrawingCount = projectDrawings.length;
  const hasApprovedLinkedDrawings = linkedDrawingIds.some(id => {
    const d = allDrawings.find(dw => dw.id === id);
    return d && APPROVED_STAGES.includes(d.stage || d.status);
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const shopBurn = (Number(form.shop_hours_budget) || 0) > 0 ? ((Number(form.shop_hours_actual) || 0) / (Number(form.shop_hours_budget) || 1)) * 100 : 0;
  const fieldBurn = (Number(form.field_hours_budget) || 0) > 0 ? ((Number(form.field_hours_actual) || 0) / (Number(form.field_hours_budget) || 1)) * 100 : 0;
  const totalBudget = (Number(form.shop_hours_budget) || 0) + (Number(form.field_hours_budget) || 0);
  const totalActual = (Number(form.shop_hours_actual) || 0) + (Number(form.field_hours_actual) || 0);
  const totalBurn = totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0;

  const grid = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 };

  return (
    <PhoenixModal
      open={open}
      onClose={onClose}
      title={wp ? `Edit WP ${wp.wp_number || ""}` : "New Work Package"}
      footer={<>
        <button style={btnSecondary} onClick={onClose}>Cancel</button>
        <button style={btnPrimary} onClick={handleSave}>
          {wp ? "Update" : "Create"}
        </button>
      </>}
    >
      <div style={grid}>

        {/* ── Section 1: Identity ── */}
        <SectionDivider label="Identity" />

        <FormField label="WP Number">
          <input style={inputDisabledStyle} value={form.wp_number || nextNumber || ""} disabled readOnly />
        </FormField>
        <FormField label="Project">
          <select
            style={selectStyle}
            value={form.project_id}
            onChange={e => {
              set("project_id", e.target.value);
              setLinkedDrawingIds([]);
            }}>
            <option value="">Select project (optional)</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </FormField>
        <FormField label="Name *" error={errors.name} span2>
          <input style={inputStyle} value={form.name} onChange={e => set("name", e.target.value)} placeholder="Work package name..." />
        </FormField>
        <div style={{ gridColumn: "span 2" }}>
          <AutoLinkSuggestions
            entity={form}
            sources={{ drawings: projectDrawings, workPackages: [], rfis: projectRfis }}
            onLink={(suggestion) => {
              if (suggestion.type === "drawing") {
                const drawingId = suggestion.entityId;
                if (!linkedDrawingIds.includes(drawingId)) {
                  setLinkedDrawingIds(prev => [...prev, drawingId]);
                }
              }
              if (suggestion.type === "rfi") {
                const currentIds = (form.linked_rfi_ids || "").split(",").map(s => s.trim()).filter(Boolean);
                if (!currentIds.includes(suggestion.entityId)) {
                  set("linked_rfi_ids", [...currentIds, suggestion.entityId].join(","));
                }
              }
            }}
          />
        </div>
        <FormField label="Phase" error={errors.phase}>
          <select style={selectStyle} value={form.phase} onChange={e => set("phase", e.target.value)}>
            {["Detailing", "Fabrication", "Delivery", "Erection"].map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </FormField>
        <FormField label="Status">
          <select
            style={pieceDrivenProgress ? inputDisabledStyle : selectStyle}
            value={form.status}
            disabled={pieceDrivenProgress}
            title={pieceDrivenProgress ? "Progress is driven by piece fabrication" : undefined}
            onChange={e => set("status", e.target.value)}
          >
            {["Not Started", "In Progress", "Complete", "On Hold"].map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </FormField>
        {pieceDrivenProgress && (
          <div style={{ gridColumn: "span 2", padding: "8px 12px", background: "var(--info-muted)", border: "1px solid var(--info-border)", borderLeft: "3px solid var(--status-info)", borderRadius: "0 4px 4px 0", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--status-info)", letterSpacing: "0.08em" }}>
            STATUS &amp; % COMPLETE ARE DRIVEN BY PIECE FABRICATION — assign pieces and advance stations in Piece Control.
          </div>
        )}

        {form.phase === "Fabrication" && linkedDrawingIds.length === 0 && (
          <div style={{ gridColumn: "span 2", padding: "8px 12px", background: "var(--danger-muted)", border: "1px solid var(--danger-border)", borderLeft: "3px solid var(--status-error)", borderRadius: "0 4px 4px 0", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--status-error)", letterSpacing: "0.08em" }}>
            ⊘ NO DRAWING SETS LINKED — Cannot advance to Fabrication without at least one linked drawing set. Link a set below first.
          </div>
        )}
        {form.phase === "Fabrication" && linkedDrawingIds.length > 0 && !hasApprovedLinkedDrawings && (
          <div style={{ gridColumn: "span 2", padding: "8px 12px", background: "var(--warning-muted)", border: "1px solid var(--warning-border)", borderLeft: "3px solid var(--status-warning)", borderRadius: "0 4px 4px 0", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--status-warning)", letterSpacing: "0.08em" }}>
            ⚠ LINKED DRAWINGS NOT YET APPROVED — Fabrication should not begin until all linked drawings are Released/IFC. Proceeding will create a workflow flag.
          </div>
        )}
        {["Erection", "Installation"].includes(form.phase) && (
          <div style={{ gridColumn: "span 2", padding: "8px 12px", background: "var(--info-muted)", border: "1px solid var(--info-border)", borderLeft: "3px solid var(--status-info)", borderRadius: "0 4px 4px 0", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--status-info)", letterSpacing: "0.08em" }}>
            ⓘ ERECTION PHASE — Ensure material delivery is confirmed before field crews mobilize. Resources can be scheduled in advance of delivery.
          </div>
        )}

        {/* ── Section 2: Scope ── */}
        <SectionDivider label="Scope" />

        <FormField label="Tonnage">
          <input type="number" style={inputStyle} value={form.tonnage} onChange={e => set("tonnage", e.target.value)} placeholder="0" />
        </FormField>
        <FormField label="% Complete (0–100)">
          <input
            type="number"
            min="0"
            max="100"
            style={pieceDrivenProgress ? inputDisabledStyle : inputStyle}
            value={form.percent_complete}
            disabled={pieceDrivenProgress}
            title={pieceDrivenProgress ? "Progress is driven by piece fabrication" : undefined}
            onChange={e => set("percent_complete", e.target.value)}
          />
        </FormField>
        <FormField label="Crew / Responsible" span2>
          <input style={inputStyle} value={form.crew} onChange={e => set("crew", e.target.value)} placeholder="Crew name or person..." />
        </FormField>
        <FormField label="Released Date">
          <input type="date" style={inputStyle} value={form.released_date} onChange={e => set("released_date", e.target.value)} />
        </FormField>

        {/* Scheduling window — drives placement on the Resource Scheduling
            board. Can also be set by drag-and-drop from the scheduling
            page; this form lets a user set them directly. */}
        <FormField label="Scheduled Start">
          <input type="date" style={inputStyle} value={form.scheduled_start_date || ""} onChange={e => set("scheduled_start_date", e.target.value)} />
        </FormField>
        <FormField label="Scheduled End">
          <input type="date" style={inputStyle} value={form.scheduled_end_date || ""} onChange={e => set("scheduled_end_date", e.target.value)} />
        </FormField>

        {/* ── Section 3: Production Structure ── */}
        <SectionDivider label="Production Structure" />

        <FormField label="Area">
          <input style={inputStyle} value={form.area} onChange={e => set("area", e.target.value)} placeholder="e.g. East Wing" />
        </FormField>
        <FormField label="Sequence">
          <input style={inputStyle} value={form.sequence_number} onChange={e => set("sequence_number", e.target.value)} placeholder="e.g. Sequence 2" />
        </FormField>
        <FormField label="Trade Phase">
          <input style={inputStyle} value={form.trade_phase} onChange={e => set("trade_phase", e.target.value)} placeholder="e.g. Columns" />
        </FormField>
        <FormField label="Shipping Phase">
          <input style={inputStyle} value={form.shipping_phase} onChange={e => set("shipping_phase", e.target.value)} placeholder="e.g. Truck 3" />
        </FormField>
        <FormField label="Install Phase">
          <input style={inputStyle} value={form.install_phase} onChange={e => set("install_phase", e.target.value)} placeholder="e.g. Level 4" />
        </FormField>

        {/* ── Section 4: Labor Budget ── */}
        <SectionDivider label="Labor Budget" />

        <FormField label="Shop Hours Budget">
          <input type="number" style={inputStyle} value={form.shop_hours_budget} onChange={e => set("shop_hours_budget", e.target.value)} />
        </FormField>
        <FormField label="Shop Hours Actual">
          <input type="number" style={inputStyle} value={form.shop_hours_actual} onChange={e => set("shop_hours_actual", e.target.value)} />
        </FormField>
        <FormField label="Shop Burn % (calc)">
          <input style={calcStyle(form.shop_hours_actual, form.shop_hours_budget)} value={formatBudgetPercent(shopBurn)} disabled readOnly />
        </FormField>
        <FormField label="Field Hours Budget">
          <input type="number" style={inputStyle} value={form.field_hours_budget} onChange={e => set("field_hours_budget", e.target.value)} />
        </FormField>
        <FormField label="Field Hours Actual">
          <input type="number" style={inputStyle} value={form.field_hours_actual} onChange={e => set("field_hours_actual", e.target.value)} />
        </FormField>
        <FormField label="Field Burn % (calc)">
          <input style={calcStyle(form.field_hours_actual, form.field_hours_budget)} value={formatBudgetPercent(fieldBurn)} disabled readOnly />
        </FormField>
        <FormField label="Total Budget (hrs)">
          <input style={inputDisabledStyle} value={totalBudget.toLocaleString()} disabled readOnly />
        </FormField>
        <FormField label="Total Actual (hrs)">
          <input style={inputDisabledStyle} value={totalActual.toLocaleString()} disabled readOnly />
        </FormField>
        <FormField label="Total Burn % (calc)" span2>
          <input style={calcStyle(totalActual, totalBudget)} value={formatBudgetPercent(totalBurn)} disabled readOnly />
        </FormField>

        {/* ── Section 5: Linked Drawing Sets ── */}
        <SectionDivider label="Linked Drawing Sets" />

        <FormField label="Search & Add Drawing Sets" span2>
          {/* No drawings warning */}
          {(!hasProjectSelected) && (
            <div style={{ marginBottom: 8, padding: "8px 10px", background: "var(--warning-muted)", border: "1px solid var(--warning-border)", borderLeft: "3px solid var(--status-warning)", borderRadius: "0 6px 6px 0" }}>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, color: "var(--status-warning)", letterSpacing: "0.10em" }}>Select a project to see available drawings.</div>
            </div>
          )}
          {hasProjectSelected && projectDrawingCount === 0 && (
            <div style={{ marginBottom: 8, padding: "8px 10px", background: "var(--warning-muted)", border: "1px solid var(--warning-border)", borderLeft: "3px solid var(--status-warning)", borderRadius: "0 6px 6px 0" }}>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, color: "var(--status-warning)", letterSpacing: "0.10em" }}>No drawing sets found for this project.</div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-secondary)", marginTop: 3 }}>
                Upload drawings in the Drawing Log first.
              </div>
            </div>
          )}
          {hasProjectSelected && projectDrawingCount > 0 && linkedDrawingIds.length === 0 && (
            <div style={{ marginBottom: 8, padding: "8px 10px", background: "var(--warning-muted)", border: "1px solid var(--warning-border)", borderLeft: "3px solid var(--status-warning)", borderRadius: "0 6px 6px 0" }}>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, color: "var(--status-warning)", letterSpacing: "0.10em" }}>⚠ NO DRAWING SETS LINKED</div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-secondary)", marginTop: 3 }}>
                This WP cannot advance to Fabrication until a drawing set is linked. You can save without one now.
              </div>
            </div>
          )}

          <div style={{ position: "relative" }}>
            <input
              type="text"
              placeholder="Search drawing sets by name..."
              value={setSearch}
              onChange={e => setSetSearch(e.target.value)}
              onFocus={() => setShowSetDropdown(true)}
              onBlur={() => setTimeout(() => setShowSetDropdown(false), 200)}
              style={inputStyle}
            />
            {showSetDropdown && filteredSetOptions.length > 0 && (
               <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--bg-surface-secondary)", border: "1px solid var(--border-default)", borderTop: "none", borderRadius: "0 0 8px 8px", maxHeight: 220, overflowY: "auto", zIndex: 10, boxShadow: "var(--shadow-lg)" }}>
                 {filteredSetOptions.map(opt => {
                   const num = formatDrawingSetNumber(opt);
                   const remaining = opt.total - opt.linkedCount;
                   return (
                     <div
                       key={opt.key}
                       onMouseDown={() => addSet(opt)}
                       style={{ padding: "8px 10px", borderBottom: "1px solid var(--divider)", cursor: "pointer", fontSize: 11, color: "var(--text-secondary)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}
                       onMouseEnter={e => e.currentTarget.style.background = "rgb(18,25,38)"}
                       onMouseLeave={e => e.currentTarget.style.background = "rgb(12,17,25)"}
                     >
                       <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                         {num !== "TBD" ? <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: "var(--text-muted)", marginRight: 6 }}>{num}</span> : null}
                         {opt.set_name}
                       </span>
                       <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                         {opt.linkedCount > 0 ? `+${remaining} of ${opt.total}` : `${opt.total} sheet${opt.total === 1 ? "" : "s"}`} · {opt.approvedCount}/{opt.total} appr
                       </span>
                     </div>
                   );
                 })}
               </div>
             )}
          </div>

          {/* Linked drawing-set chips — remove drops the whole set's sheets */}
          {linkedSetGroups.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {linkedSetGroups.map(g => {
                const partial = g.total > 0 && g.ids.length < g.total;
                return (
                  <div key={g.key} style={{ background: "var(--info-muted)", border: "1px solid var(--info-border)", borderRadius: 6, padding: "4px 8px", display: "flex", alignItems: "center", gap: 6, fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "var(--status-info)" }}>
                    <span>{g.set_name}</span>
                    <span style={{ fontSize: 8, color: partial ? "var(--status-warning)" : "var(--text-muted)", borderLeft: "1px solid var(--divider)", paddingLeft: 5 }}>
                      {partial ? `${g.ids.length} of ${g.total} sheets` : `${g.ids.length} sheet${g.ids.length === 1 ? "" : "s"}`}
                    </span>
                    <button onClick={() => removeSet(g)} style={{ background: "none", border: "none", color: "var(--status-info)", cursor: "pointer", fontSize: 13, padding: 0, lineHeight: 1 }}>×</button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Draft drawings warning */}
          {draftWarning && draftWarning.length > 0 && linkedDrawingIds.length > 0 && (
            <div style={{ marginTop: 8, background: "var(--warning-muted)", border: "1px solid var(--warning-border)", borderLeft: "3px solid var(--status-warning)", borderRadius: "0 6px 6px 0", padding: "6px 10px" }}>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "var(--status-warning)", letterSpacing: "0.10em" }}>⚠ DRAWINGS NOT YET IFC</span>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-secondary)", margin: "3px 0 0" }}>
                {draftWarning.length} linked drawing(s) are not yet Issued for Construction. Fabrication should not begin until drawings are approved.
              </p>
            </div>
          )}
        </FormField>

        {/* ── Section 6: Fabrication Confirmations ── */}
        <SectionDivider label="Fabrication Confirmations" />

        <FormField label="VIF Confirmed">
          <input type="checkbox" checked={form.vif_confirmed} onChange={e => set("vif_confirmed", e.target.checked)} style={{ cursor: "pointer", width: 16, height: 16 }} />
        </FormField>
        <FormField label="Confirmed By">
          <input style={inputStyle} value={form.vif_confirmed_by} onChange={e => set("vif_confirmed_by", e.target.value)} placeholder="Name or email..." disabled={!form.vif_confirmed} />
        </FormField>
        <FormField label="VIF Confirmed Date">
          <input type="date" style={inputStyle} value={form.vif_confirmed_date} onChange={e => set("vif_confirmed_date", e.target.value)} disabled={!form.vif_confirmed} />
        </FormField>
        <FormField label="Load List Complete">
          <input type="checkbox" checked={form.load_list_complete} onChange={e => set("load_list_complete", e.target.checked)} style={{ cursor: "pointer", width: 16, height: 16 }} />
        </FormField>
        <FormField label="Sequence Confirmed">
          <input type="checkbox" checked={form.sequence_confirmed} onChange={e => set("sequence_confirmed", e.target.checked)} style={{ cursor: "pointer", width: 16, height: 16 }} />
        </FormField>

        {/* ── Section 7: Notes ── */}
        <SectionDivider label="Notes" />

        <FormField label="Notes" span2>
          <textarea style={{ ...inputStyle, height: 72, resize: "vertical" }} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Additional notes..." />
        </FormField>

      </div>
    </PhoenixModal>
  );
}
