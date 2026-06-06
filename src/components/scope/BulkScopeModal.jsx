import React, { useMemo, useRef, useState } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { integrations } from "@/api/supabaseClient";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, Upload, FileText } from "lucide-react";

const TYPES = ["Scope", "Exclusion", "Clarification"];
const CATEGORIES = ["Structural", "Misc Metals", "Connections", "Coatings", "Erection", "Engineering", "Other"];

/**
 * Bulk add / import for Scope & Exclusions.
 *
 * Two modes:
 *   - LINES: one description per line, with a shared type + category picker
 *            (fastest — paste a bid-scope narrative and split on newlines).
 *   - CSV:   paste CSV text — header row drives which columns populate which
 *            fields. Accepted headers: description, type, category, notes,
 *            reference, added_by.
 *
 * Optional PDF attachment applies to *every* imported item so the user can
 * pin the source document once instead of per row. If they need per-row
 * different sources, that's a second import run.
 *
 * No Radix Dialog — plain fixed overlay. No <form> tag.
 */
export default function BulkScopeModal({ projectId, onClose, onCreated }) {
  const qc = useQueryClient();
  const trapRef = useFocusTrap(true);
  const fileInput = useRef(null);

  const [mode, setMode] = useState("lines");
  const [defaultType, setDefaultType] = useState("Scope");
  const [defaultCategory, setDefaultCategory] = useState("Structural");
  const [addedBy, setAddedBy] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const parsed = useMemo(() => parseInput(text, mode, { defaultType, defaultCategory, addedBy }), [text, mode, defaultType, defaultCategory, addedBy]);

  const accept = (f) => {
    if (!f) return;
    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") {
      setErr("Attachment must be a PDF.");
      return;
    }
    if (f.size > 32 * 1024 * 1024) {
      setErr("PDF exceeds 32 MB limit.");
      return;
    }
    setErr(null);
    setFile(f);
  };

  const submit = async () => {
    if (!projectId) { setErr("Select a project first."); return; }
    if (parsed.rows.length === 0) { setErr("Nothing to import."); return; }
    if (parsed.errors.length > 0) { setErr(parsed.errors[0]); return; }

    setBusy(true); setErr(null);
    try {
      // Upload the shared PDF once if present
      let file_url = null, storage_path = null, file_name = null;
      if (file) {
        const up = await integrations.Core.UploadFile({ file });
        file_url     = up.file_url || null;
        storage_path = up.path || null;
        file_name    = file.name;
      }

      const rows = parsed.rows.map(r => ({
        project_id: projectId,
        item_type:  r.type,
        category:   r.category,
        description: r.description,
        notes:       r.notes || null,
        reference:   r.reference || null,
        added_by:    r.added_by || addedBy || null,
        file_url, storage_path, file_name,
      }));

      const { error } = await supabase.from("scope_items").insert(rows);
      if (error) throw new Error(error.message);

      qc.invalidateQueries({ queryKey: ["scope-items"] });
      toast.success(`${rows.length} scope item${rows.length === 1 ? "" : "s"} imported`);
      onCreated?.(rows.length);
      onClose();
    } catch (e) {
      setErr(e?.message || String(e));
      toast.error(`Import failed: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 1200 }} />
      <div
        ref={trapRef}
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
        style={{
          position: "fixed", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: 760, maxWidth: "96vw", maxHeight: "92vh",
          background: "var(--bg-surface-secondary)",
          border: "1px solid var(--border-default)",
          borderLeft: "3px solid var(--accent)",
          borderRadius: 4,
          zIndex: 1201, outline: "none",
          display: "flex", flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "14px 20px", borderBottom: "1px solid var(--divider)",
          display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
        }}>
          <div style={{ flex: 1, ...display, fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
            Bulk Import Scope Items
          </div>
          <button onClick={onClose} aria-label="Close" style={btnIcon}>
            <X size={18} />
          </button>
        </div>

        {/* Mode tabs */}
        <div style={{ display: "flex", gap: 2, padding: "10px 20px 0", flexShrink: 0 }}>
          {[
            { key: "lines", label: "ONE PER LINE" },
            { key: "csv",   label: "CSV" },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setMode(t.key)}
              style={{
                padding: "6px 14px",
                background: mode === t.key ? "var(--accent)" : "transparent",
                color: mode === t.key ? "#fff" : "var(--text-muted)",
                border: "1px solid var(--border-default)",
                borderBottom: mode === t.key ? "1px solid var(--accent)" : "1px solid var(--border-default)",
                borderRadius: "2px 2px 0 0",
                fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                letterSpacing: "0.14em", textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {mode === "lines" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
                <Field label="Default Type">
                  <select style={inputStyle} value={defaultType} onChange={(e) => setDefaultType(e.target.value)}>
                    {TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Default Category">
                  <select style={inputStyle} value={defaultCategory} onChange={(e) => setDefaultCategory(e.target.value)}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Added By">
                  <input style={inputStyle} value={addedBy} onChange={(e) => setAddedBy(e.target.value)} placeholder="Your name / initials" />
                </Field>
              </div>
              <Field label="One description per line">
                <textarea
                  style={{ ...inputStyle, height: 200, resize: "vertical", fontFamily: "var(--font-body)" }}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={`Furnish and install shear tab connections\nField-bolt column splices\nPaint AESS steel per spec 09 96 00`}
                />
              </Field>
              <HintLine text={`${parsed.rows.length} item${parsed.rows.length === 1 ? "" : "s"} will be created with type "${defaultType}" and category "${defaultCategory}".`} />
            </>
          )}

          {mode === "csv" && (
            <>
              <Field label="CSV — first row = headers. Accepted: description, type, category, notes, reference, added_by">
                <textarea
                  style={{ ...inputStyle, height: 220, resize: "vertical", fontFamily: "var(--font-mono)", fontSize: 11 }}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={`description,type,category,notes,reference\nField-bolt column splices,Scope,Connections,,Spec 05 12 00 §2.3\nScaffolding for coating touch-up,Exclusion,Coatings,Owner by others,`}
                />
              </Field>
              <HintLine text={`${parsed.rows.length} item${parsed.rows.length === 1 ? "" : "s"} parsed. ${parsed.errors.length} row${parsed.errors.length === 1 ? "" : "s"} invalid.`} />
              {parsed.errors.length > 0 && (
                <ul style={{ ...mono, fontSize: 10, color: "var(--status-error)", marginTop: 4, paddingLeft: 16 }}>
                  {parsed.errors.slice(0, 5).map((m, i) => <li key={i}>{m}</li>)}
                  {parsed.errors.length > 5 && <li>…and {parsed.errors.length - 5} more</li>}
                </ul>
              )}
            </>
          )}

          {/* Shared attachment */}
          <div style={{ marginTop: 14, borderTop: "1px solid var(--divider)", paddingTop: 14 }}>
            <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
              OPTIONAL — SHARED PDF (attached to every item imported)
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button onClick={() => fileInput.current?.click()} style={btnGhost} disabled={busy}>
                <Upload size={12} strokeWidth={2.5} style={{ marginRight: 6, verticalAlign: "middle" }} />
                {file ? "REPLACE PDF" : "ATTACH PDF"}
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="application/pdf,.pdf"
                style={{ display: "none" }}
                onChange={(e) => accept(e.target.files?.[0])}
              />
              {file && (
                <div style={{ ...mono, fontSize: 11, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6 }}>
                  <FileText size={12} style={{ color: "var(--accent)" }} />
                  {file.name} ({(file.size / 1e6).toFixed(1)} MB)
                  <button onClick={() => setFile(null)} style={{ ...btnIcon, color: "var(--status-error)" }} aria-label="Remove">
                    <X size={12} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {err && (
            <div style={{
              marginTop: 14, padding: "8px 12px",
              border: "1px solid var(--status-error)",
              background: "color-mix(in srgb, var(--status-error) 10%, transparent)",
              color: "var(--status-error)", ...mono, fontSize: 11,
            }}>
              {err}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 20px", borderTop: "1px solid var(--divider)",
          display: "flex", gap: 10, justifyContent: "flex-end", flexShrink: 0,
        }}>
          <button onClick={onClose} disabled={busy} style={btnGhost}>CANCEL</button>
          <button
            onClick={submit}
            disabled={busy || parsed.rows.length === 0 || !projectId}
            style={{ ...btnPrimary, opacity: (busy || parsed.rows.length === 0 || !projectId) ? 0.5 : 1 }}
          >
            {busy ? "IMPORTING…" : `IMPORT ${parsed.rows.length || ""}`.trim()}
          </button>
        </div>
      </div>
    </>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", display: "block", marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function HintLine({ text }) {
  return (
    <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", marginTop: 6, letterSpacing: "0.08em" }}>
      {text}
    </div>
  );
}

// ─── Parsing ─────────────────────────────────────────────────────────
function parseInput(text, mode, { defaultType, defaultCategory, addedBy }) {
  const rows = [];
  const errors = [];

  if (mode === "lines") {
    const lines = (text || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      rows.push({
        description: line,
        type: defaultType,
        category: defaultCategory,
        added_by: addedBy,
      });
    }
    return { rows, errors };
  }

  // CSV mode
  const lines = (text || "").split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { rows, errors };
  const headers = splitCsv(lines[0]).map(h => h.trim().toLowerCase());
  const descIdx = headers.indexOf("description");
  if (descIdx === -1) {
    errors.push('First row must include a "description" header.');
    return { rows, errors };
  }
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsv(lines[i]);
    const description = (cells[descIdx] || "").trim();
    if (!description) {
      errors.push(`Row ${i + 1}: empty description`);
      continue;
    }
    const type = cleanType(pickCell(cells, headers, "type")) || defaultType;
    const category = pickCell(cells, headers, "category") || defaultCategory;
    rows.push({
      description,
      type,
      category,
      notes:     pickCell(cells, headers, "notes"),
      reference: pickCell(cells, headers, "reference"),
      added_by:  pickCell(cells, headers, "added_by") || addedBy,
    });
  }
  return { rows, errors };
}

function pickCell(cells, headers, name) {
  const idx = headers.indexOf(name);
  if (idx === -1) return "";
  return (cells[idx] || "").trim();
}

function cleanType(raw) {
  if (!raw) return null;
  const norm = String(raw).trim().toLowerCase();
  for (const t of TYPES) if (t.toLowerCase() === norm) return t;
  return null;
}

// Minimal CSV splitter — handles quoted values with embedded commas. Does
// NOT try to be fully RFC-4180 compliant; good enough for pasted scope
// narratives.
function splitCsv(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; continue; }
      if (ch === '"') { inQ = false; continue; }
      cur += ch;
    } else {
      if (ch === '"') { inQ = true; continue; }
      if (ch === ",") { out.push(cur); cur = ""; continue; }
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

// ─── Style tokens ────────────────────────────────────────────────────
const mono    = { fontFamily: "var(--font-mono)" };
const display = { fontFamily: "'Space Grotesk', var(--font-display)" };
const inputStyle = {
  width: "100%", padding: "8px 10px",
  background: "var(--bg-page)", border: "1px solid var(--border-default)", borderRadius: 2,
  color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12,
  boxSizing: "border-box",
};
const btnPrimary = {
  padding: "8px 24px", background: "var(--accent)", color: "#fff",
  border: "none", borderRadius: 2,
  fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700,
  letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer",
};
const btnGhost = {
  padding: "8px 18px", background: "transparent",
  border: "1px solid var(--border-default)", borderRadius: 2,
  color: "var(--text-muted)",
  fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700,
  letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer",
};
const btnIcon = {
  background: "transparent", border: "none",
  color: "var(--text-muted)", cursor: "pointer", padding: 4,
  display: "flex", alignItems: "center",
};
