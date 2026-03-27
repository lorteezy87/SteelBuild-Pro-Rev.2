import React, { useState, useEffect } from "react";
import { formatPercent } from "../shared/formatters";
import { getDraftDrawingsWarning } from "../shared/workflowValidation";
import PhoenixModal, { btnPrimary, btnSecondary, inputStyle, inputDisabledStyle, FormField } from "@/components/shared/PhoenixModal";

const empty = {
  name: "", project_id: "", project_name: "", phase: "Detailing",
  released_date: "", status: "Not Started", tonnage: 0,
  shop_hours_budget: 0, shop_hours_actual: 0,
  field_hours_budget: 0, field_hours_actual: 0,
  crew: "", linked_drawing_ids: "", linked_rfi_ids: "", notes: "", percent_complete: 0,
  vif_confirmed: false, vif_confirmed_by: "", vif_confirmed_date: "",
  load_list_complete: false, sequence_confirmed: false,
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

export default function WPFormModal({ open, onClose, onSave, wp, projects = [], nextNumber, allDrawings = [] }) {
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [linkedDrawingIds, setLinkedDrawingIds] = useState([]);
  const [drawingSearch, setDrawingSearch] = useState("");
  const [showDrawingDropdown, setShowDrawingDropdown] = useState(false);

  useEffect(() => {
    if (wp) {
      setForm({ ...empty, ...wp });
      const drawingIds = (wp.linked_drawing_ids || "").split(",").map(s => s.trim()).filter(Boolean);
      setLinkedDrawingIds(drawingIds);
    } else {
      setForm({ ...empty, wp_number: nextNumber || "" });
      setLinkedDrawingIds([]);
    }
    setErrors({});
    setDrawingSearch("");
  }, [wp, open, nextNumber]);

  const validate = () => {
    const e = {};
    if (!form.name?.trim()) e.name = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    const data = {
      ...form,
      linked_drawing_ids: linkedDrawingIds.join(","),
      tonnage: Number(form.tonnage) || 0,
      shop_hours_budget: Number(form.shop_hours_budget) || 0,
      shop_hours_actual: Number(form.shop_hours_actual) || 0,
      field_hours_budget: Number(form.field_hours_budget) || 0,
      field_hours_actual: Number(form.field_hours_actual) || 0,
      percent_complete: Math.min(100, Math.max(0, Number(form.percent_complete) || 0)),
    };
    const proj = projects.find(p => p.id === form.project_id);
    if (proj) data.project_name = proj.name;
    onSave(data);
  };

  const addDrawing = (drawingId) => {
    if (!linkedDrawingIds.includes(drawingId)) {
      setLinkedDrawingIds([...linkedDrawingIds, drawingId]);
    }
    setDrawingSearch("");
    setShowDrawingDropdown(false);
  };

  const removeDrawing = (drawingId) => {
    setLinkedDrawingIds(linkedDrawingIds.filter(id => id !== drawingId));
  };

  const filteredDrawings = allDrawings.filter(d =>
    d.id && !linkedDrawingIds.includes(d.id) && (
      d.sheet_number?.toLowerCase().includes(drawingSearch.toLowerCase()) ||
      d.title?.toLowerCase().includes(drawingSearch.toLowerCase())
    )
  );

  const draftWarning = getDraftDrawingsWarning(linkedDrawingIds.join(","), allDrawings);

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
          <select style={selectStyle} value={form.project_id} onChange={e => set("project_id", e.target.value)}>
            <option value="">Select project (optional)</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </FormField>
        <FormField label="Name *" error={errors.name} span2>
          <input style={inputStyle} value={form.name} onChange={e => set("name", e.target.value)} placeholder="Work package name..." />
        </FormField>
        <FormField label="Phase">
          <select style={selectStyle} value={form.phase} onChange={e => set("phase", e.target.value)}>
            {["Detailing", "Fabrication", "Delivery", "Erection"].map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </FormField>
        <FormField label="Status">
          <select style={selectStyle} value={form.status} onChange={e => set("status", e.target.value)}>
            {["Not Started", "In Progress", "Complete", "On Hold"].map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </FormField>

        {/* ── Section 2: Scope ── */}
        <SectionDivider label="Scope" />

        <FormField label="Tonnage">
          <input type="number" style={inputStyle} value={form.tonnage} onChange={e => set("tonnage", e.target.value)} placeholder="0" />
        </FormField>
        <FormField label="% Complete (0–100)">
          <input type="number" min="0" max="100" style={inputStyle} value={form.percent_complete} onChange={e => set("percent_complete", e.target.value)} />
        </FormField>
        <FormField label="Crew / Responsible" span2>
          <input style={inputStyle} value={form.crew} onChange={e => set("crew", e.target.value)} placeholder="Crew name or person..." />
        </FormField>
        <FormField label="Released Date">
          <input type="date" style={inputStyle} value={form.released_date} onChange={e => set("released_date", e.target.value)} />
        </FormField>

        {/* ── Section 3: Labor Budget ── */}
        <SectionDivider label="Labor Budget" />

        <FormField label="Shop Hours Budget">
          <input type="number" style={inputStyle} value={form.shop_hours_budget} onChange={e => set("shop_hours_budget", e.target.value)} />
        </FormField>
        <FormField label="Shop Hours Actual">
          <input type="number" style={inputStyle} value={form.shop_hours_actual} onChange={e => set("shop_hours_actual", e.target.value)} />
        </FormField>
        <FormField label="Shop Burn % (calc)">
          <input style={calcStyle(form.shop_hours_actual, form.shop_hours_budget)} value={formatPercent(shopBurn)} disabled readOnly />
        </FormField>
        <FormField label="Field Hours Budget">
          <input type="number" style={inputStyle} value={form.field_hours_budget} onChange={e => set("field_hours_budget", e.target.value)} />
        </FormField>
        <FormField label="Field Hours Actual">
          <input type="number" style={inputStyle} value={form.field_hours_actual} onChange={e => set("field_hours_actual", e.target.value)} />
        </FormField>
        <FormField label="Field Burn % (calc)">
          <input style={calcStyle(form.field_hours_actual, form.field_hours_budget)} value={formatPercent(fieldBurn)} disabled readOnly />
        </FormField>
        <FormField label="Total Budget (hrs)">
          <input style={inputDisabledStyle} value={totalBudget.toLocaleString()} disabled readOnly />
        </FormField>
        <FormField label="Total Actual (hrs)">
          <input style={inputDisabledStyle} value={totalActual.toLocaleString()} disabled readOnly />
        </FormField>
        <FormField label="Total Burn % (calc)" span2>
          <input style={calcStyle(totalActual, totalBudget)} value={formatPercent(totalBurn)} disabled readOnly />
        </FormField>

        {/* ── Section 4: Linked Drawings ── */}
        <SectionDivider label="Linked Drawings" />

        <FormField label="Search & Add Drawings" span2>
          {/* No drawings warning */}
          {linkedDrawingIds.length === 0 && (
            <div style={{ marginBottom: 8, padding: "8px 10px", background: "var(--warning-muted)", border: "1px solid var(--warning-border)", borderLeft: "3px solid var(--status-warning)", borderRadius: "0 6px 6px 0" }}>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, color: "var(--status-warning)", letterSpacing: "0.10em" }}>⚠ NO DRAWINGS LINKED</div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-secondary)", marginTop: 3 }}>
                This WP cannot advance to Fabrication until drawings are linked. You can save without drawings now.
              </div>
            </div>
          )}

          <div style={{ position: "relative" }}>
            <input
              type="text"
              placeholder="Search by sheet number or title..."
              value={drawingSearch}
              onChange={e => setDrawingSearch(e.target.value)}
              onFocus={() => setShowDrawingDropdown(true)}
              onBlur={() => setTimeout(() => setShowDrawingDropdown(false), 200)}
              style={inputStyle}
            />
            {showDrawingDropdown && filteredDrawings.length > 0 && (
               <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--bg-surface-secondary)", border: "1px solid var(--border-default)", borderTop: "none", borderRadius: "0 0 8px 8px", maxHeight: 200, overflowY: "auto", zIndex: 10 }}>
                 {filteredDrawings.map(d => (
                   <div
                     key={d.id}
                     onMouseDown={() => addDrawing(d.id)}
                     style={{ padding: "8px 10px", borderBottom: "1px solid var(--divider)", cursor: "pointer", fontSize: 11, color: "var(--text-secondary)", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                     onMouseEnter={e => e.currentTarget.style.background = "var(--hover-bg)"}
                     onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                   >
                     <span>[{d.sheet_number}] {d.title}</span>
                     <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, color: "var(--text-muted)" }}>{d.stage}</span>
                   </div>
                 ))}
               </div>
             )}
          </div>

          {/* Drawing chips */}
          {linkedDrawingIds.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {linkedDrawingIds.map(id => {
                const dwg = allDrawings.find(d => d.id === id);
                return (
                  <div key={id} style={{ background: "var(--info-muted)", border: "1px solid var(--info-border)", borderRadius: 6, padding: "4px 8px", display: "flex", alignItems: "center", gap: 6, fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "var(--status-info)" }}>
                    <span>[{dwg?.sheet_number || id}] {dwg?.title || ""}</span>
                    {dwg?.stage && <span style={{ fontSize: 8, color: "var(--text-muted)", borderLeft: "1px solid var(--divider)", paddingLeft: 5 }}>{dwg.stage}</span>}
                    <button onClick={() => removeDrawing(id)} style={{ background: "none", border: "none", color: "var(--status-info)", cursor: "pointer", fontSize: 13, padding: 0, lineHeight: 1 }}>×</button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Draft drawings warning */}
          {draftWarning && draftWarning.length > 0 && linkedDrawingIds.length > 0 && (
            <div style={{ marginTop: 8, background: "var(--warning-muted)", border: "1px solid var(--warning-border)", borderLeft: "3px solid var(--status-warning)", borderRadius: "0 6px 6px 0", padding: "6px 10px" }}>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 7, color: "var(--status-warning)", letterSpacing: "0.10em" }}>⚠ DRAWINGS NOT YET IFC</span>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-secondary)", margin: "3px 0 0" }}>
                {draftWarning.length} linked drawing(s) are not yet Issued for Construction. Fabrication should not begin until drawings are approved.
              </p>
            </div>
          )}
        </FormField>

        {/* ── Section 5: Fabrication Confirmations ── */}
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

        {/* ── Section 6: Notes ── */}
        <SectionDivider label="Notes" />

        <FormField label="Notes" span2>
          <textarea style={{ ...inputStyle, height: 72, resize: "vertical" }} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Additional notes..." />
        </FormField>

      </div>
    </PhoenixModal>
  );
}