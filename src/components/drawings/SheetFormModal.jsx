import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { STAGES, DISCIPLINES, EMPTY_FORM, mono, surface } from "./drawingsConfig";

/**
 * Modal for creating or editing a single drawing sheet.
 * Handles file upload via base44 integration.
 *
 * @param {{ initial?: object, onSave: (form: object) => void, onClose: () => void, saving: boolean }} props
 */
export default function SheetFormModal({ initial, onSave, onClose, saving, existingSetNames = [] }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const labelStyle = {
    ...mono, fontSize: 10, fontWeight: 700, textTransform: "uppercase",
    letterSpacing: "0.15em", color: "var(--text-muted)", display: "block", marginBottom: 5,
  };
  const inputStyle = {
    width: "100%", padding: "8px 10px", background: "var(--bg-page)",
    border: "1px solid var(--border-default)", borderRadius: 2,
    color: "var(--text-primary)", fontFamily: "var(--font-body)",
    fontSize: 13, boxSizing: "border-box",
  };
  const selectStyle = { ...inputStyle };

  const handleSubmit = async () => {
    let fileUrl = form.file_url || "";
    if (uploadFile) {
      setUploading(true);
      try {
        const { file_url } = await base44.integrations.Core.UploadFile({ file: uploadFile });
        fileUrl = file_url;
      } catch (err) {
        toast.error("File upload failed: " + (err?.message || "Unknown error"));
        setUploading(false);
        return;
      }
      setUploading(false);
    }
    onSave({ ...form, file_url: fileUrl });
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
        zIndex: 1000, display: "flex", alignItems: "center",
        justifyContent: "center", padding: 24,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ ...surface, width: "100%", maxWidth: 640, maxHeight: "90vh", overflowY: "auto", padding: 28 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <span style={{ ...mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--accent)" }}>
            {initial?.id ? "EDIT SHEET" : "ADD SHEET"}
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>

        {/* Form grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Drawing Set</label>
            <input
              list="drawing-set-options"
              style={inputStyle}
              value={form.drawing_set_name || ""}
              onChange={e => set("drawing_set_name", e.target.value)}
              placeholder="e.g. 100% CD Set — Foundations"
            />
            <datalist id="drawing-set-options">
              {existingSetNames.map(name => <option key={name} value={name} />)}
            </datalist>
            <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 4, letterSpacing: "0.08em" }}>
              Groups this sheet under a parent set. Leave blank for ungrouped.
            </div>
          </div>
          <div>
            <label style={labelStyle}>Sheet Number *</label>
            <input style={inputStyle} value={form.sheet_number} onChange={e => set("sheet_number", e.target.value)} placeholder="S1-001" />
          </div>
          <div>
            <label style={labelStyle}>Revision</label>
            <input style={inputStyle} value={form.revision_number} onChange={e => set("revision_number", e.target.value)} placeholder="0" />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Title *</label>
            <input style={inputStyle} value={form.title} onChange={e => set("title", e.target.value)} placeholder="e.g. Foundation Plan" />
          </div>
          <div>
            <label style={labelStyle}>Discipline</label>
            <select style={selectStyle} value={form.discipline} onChange={e => set("discipline", e.target.value)}>
              {DISCIPLINES.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Stage</label>
            <select style={selectStyle} value={form.stage} onChange={e => set("stage", e.target.value)}>
              {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Submitted Date</label>
            <input type="date" style={inputStyle} value={form.submitted_date || ""} onChange={e => set("submitted_date", e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Due Date</label>
            <input type="date" style={inputStyle} value={form.due_date || ""} onChange={e => set("due_date", e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Return Date</label>
            <input type="date" style={inputStyle} value={form.return_date || ""} onChange={e => set("return_date", e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Reviewer</label>
            <input style={inputStyle} value={form.reviewer || ""} onChange={e => set("reviewer", e.target.value)} placeholder="Reviewer name" />
          </div>
          <div>
            <label style={labelStyle}>Spec Section</label>
            <input style={inputStyle} value={form.spec_section || ""} onChange={e => set("spec_section", e.target.value)} placeholder="05 12 00" />
          </div>
          <div>
            <label style={labelStyle}>Linked RFI Numbers</label>
            <input style={inputStyle} value={form.linked_rfi_ids || ""} onChange={e => set("linked_rfi_ids", e.target.value)} placeholder="RFI #001, RFI #002" />
          </div>

          {/* ── Fabrication & Delivery dates ─────────────────────────── */}
          <div style={{ gridColumn: "1 / -1", marginTop: 4 }}>
            <div style={{
              ...mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.15em",
              textTransform: "uppercase", color: "var(--text-muted)",
              paddingBottom: 6, borderBottom: "1px solid var(--divider)",
            }}>
              Fabrication &amp; Delivery
            </div>
          </div>
          <div>
            <label style={labelStyle}>Fabrication Start</label>
            <input type="date" style={inputStyle} value={form.fabrication_start_date || ""} onChange={e => set("fabrication_start_date", e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Fabrication Finish</label>
            <input type="date" style={inputStyle} value={form.fabrication_finish_date || ""} onChange={e => set("fabrication_finish_date", e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Ready for Install</label>
            <input type="date" style={inputStyle} value={form.ready_for_install_date || ""} onChange={e => set("ready_for_install_date", e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Final Delivery</label>
            <input type="date" style={inputStyle} value={form.final_delivery_date || ""} onChange={e => set("final_delivery_date", e.target.value)} />
          </div>

          {/* File attachment */}
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>PDF Attachment</label>
            {form.file_url && !uploadFile && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ ...mono, fontSize: 10, color: "var(--status-success)" }}>FILE ATTACHED</span>
                <button onClick={() => set("file_url", "")} style={{ background: "none", border: "none", color: "var(--status-error)", fontSize: 10, cursor: "pointer", ...mono }}>REMOVE</button>
              </div>
            )}
            <input
              type="file"
              accept=".pdf,.dwg,.dxf"
              onChange={e => { if (e.target.files?.[0]) setUploadFile(e.target.files[0]); }}
              style={{ ...inputStyle, padding: "6px 10px", fontSize: 11 }}
            />
            {uploadFile && (
              <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 4 }}>
                {uploadFile.name} ({(uploadFile.size / 1024).toFixed(0)} KB)
              </div>
            )}
          </div>

          {/* Notes */}
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Notes</label>
            <textarea style={{ ...inputStyle, height: 72, resize: "vertical" }} value={form.notes || ""} onChange={e => set("notes", e.target.value)} />
          </div>

          {/* Priority flag */}
          <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 10 }}>
            <input type="checkbox" id="pflag" checked={!!form.priority_flag} onChange={e => set("priority_flag", e.target.checked)} />
            <label htmlFor="pflag" style={{ ...mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "var(--text-muted)", textTransform: "uppercase", cursor: "pointer" }}>
              Priority Flag — mark as critical path
            </label>
          </div>
        </div>

        {/* Footer actions */}
        <div style={{ marginTop: 24, display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{
            padding: "8px 20px", background: "none", border: "1px solid var(--border-default)",
            borderRadius: 2, color: "var(--text-muted)", ...mono, fontSize: 11, fontWeight: 700,
            letterSpacing: "0.1em", cursor: "pointer",
          }}>
            CANCEL
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || uploading || !form.sheet_number || !form.title}
            style={{
              padding: "8px 24px", background: "var(--accent)", border: "none", borderRadius: 2,
              color: "#000", ...mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
              cursor: (saving || uploading) ? "not-allowed" : "pointer",
              opacity: (saving || uploading) ? 0.7 : 1,
            }}
          >
            {uploading ? "UPLOADING..." : saving ? "SAVING..." : "SAVE SHEET"}
          </button>
        </div>
      </div>
    </div>
  );
}
