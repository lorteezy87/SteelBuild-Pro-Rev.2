/**
 * GcIssuanceFormModal — log or edit one GC issuance.
 *
 * No <form> tag and no Radix Dialog (both are banned project-wide); the shared
 * design-system Modal owns the chrome and Escape handling.
 *
 * Deliberately NOT collecting a steel-impact disposition at log time. Logging
 * is "this arrived"; deciding whether it hits steel is a separate act by a
 * person who has read it, and defaulting that dropdown during intake is how
 * every issuance ends up silently marked "no impact".
 */

import { useEffect, useState } from "react";
import { Modal, Button } from "./dsPrimitives";
import {
  GC_DOC_TYPES,
  GC_DOC_TYPE_HINTS,
  GC_DOC_TYPE_LABELS,
  GC_SET_CATEGORIES,
  GC_SET_CATEGORY_LABELS,
  coerceGcDocType,
  coerceGcSetCategory,
  type GcDocType,
} from "@/lib/gcDocuments/gcDocTypes";
import type { GcDrawingSetRow } from "./gcDocumentsPageDerive";

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  marginBottom: 4,
};

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid var(--border-default)",
  background: "var(--bg-surface-low)",
  color: "var(--text-primary)",
  fontSize: 13,
  outline: "none",
};

export interface GcIssuanceFormValues {
  set_name: string;
  doc_type: GcDocType;
  doc_number: string;
  category: string;
  discipline: string;
  issued_by: string;
  issued_date: string;
  received_date: string;
  revision: string;
  description: string;
}

function toFormValues(initial: GcDrawingSetRow | null): GcIssuanceFormValues {
  return {
    set_name: String(initial?.set_name ?? ""),
    doc_type: coerceGcDocType(initial?.doc_type),
    doc_number: String(initial?.doc_number ?? ""),
    category: coerceGcSetCategory(initial?.category),
    discipline: String(initial?.discipline ?? ""),
    issued_by: String(initial?.issued_by ?? ""),
    issued_date: String(initial?.issued_date ?? ""),
    received_date: String(initial?.received_date ?? ""),
    revision: String(initial?.revision ?? ""),
    description: String(initial?.description ?? ""),
  };
}

export default function GcIssuanceFormModal({
  open,
  initial = null,
  saving = false,
  onSave,
  onClose,
}: {
  open: boolean;
  initial?: GcDrawingSetRow | null;
  saving?: boolean;
  onSave: (values: Record<string, unknown>) => void | Promise<void>;
  onClose: () => void;
}) {
  const [values, setValues] = useState<GcIssuanceFormValues>(() => toFormValues(initial));
  const [error, setError] = useState<string | null>(null);

  // Re-seed whenever the modal opens or the target changes, so editing a
  // second issuance never shows the first one's values.
  useEffect(() => {
    if (open) {
      setValues(toFormValues(initial));
      setError(null);
    }
  }, [open, initial]);

  const set = <K extends keyof GcIssuanceFormValues>(key: K, value: GcIssuanceFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    // gc_drawing_sets_set_name_not_blank rejects a blank name at the database,
    // so catch it here rather than surfacing a raw constraint name.
    if (!values.set_name.trim()) {
      setError("Give the issuance a name — the database rejects a blank one.");
      return;
    }
    if (
      values.issued_date &&
      values.received_date &&
      values.received_date < values.issued_date
    ) {
      setError("Received date is before the issued date. Check the dates.");
      return;
    }
    setError(null);
    // Empty strings become NULL: a blank date column must be unknown, not "".
    await onSave({
      set_name: values.set_name.trim(),
      doc_type: values.doc_type,
      doc_number: values.doc_number.trim() || null,
      category: values.category,
      discipline: values.discipline.trim() || null,
      issued_by: values.issued_by.trim() || null,
      issued_date: values.issued_date || null,
      received_date: values.received_date || null,
      revision: values.revision.trim() || null,
      description: values.description.trim() || null,
    });
  };

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="GC DOCUMENTS"
      title={initial ? "Edit issuance" : "Log issuance"}
      width={680}
      footer={
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
          {error && (
            <span role="alert" style={{ flex: 1, fontSize: 12, color: "var(--status-error)" }}>
              {error}
            </span>
          )}
          <Button variant="ghost" onClick={onClose} disabled={saving}>CANCEL</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? "SAVING…" : initial ? "SAVE" : "LOG IT"}
          </Button>
        </div>
      }
    >
      <div style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle} htmlFor="gc-doc-type">Document type</label>
            <select
              id="gc-doc-type"
              style={fieldStyle}
              value={values.doc_type}
              onChange={(e) => set("doc_type", coerceGcDocType(e.target.value))}
            >
              {GC_DOC_TYPES.map((t) => (
                <option key={t} value={t}>{GC_DOC_TYPE_LABELS[t]}</option>
              ))}
            </select>
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-muted)", lineHeight: 1.45 }}>
              {GC_DOC_TYPE_HINTS[values.doc_type]}
            </p>
          </div>
          <div>
            <label style={labelStyle} htmlFor="gc-doc-number">Their number</label>
            <input
              id="gc-doc-number"
              style={fieldStyle}
              value={values.doc_number}
              placeholder="ASI 012"
              onChange={(e) => set("doc_number", e.target.value)}
            />
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-muted)", lineHeight: 1.45 }}>
              The issuing party&rsquo;s own reference. We never mint this.
            </p>
          </div>
        </div>

        <div>
          <label style={labelStyle} htmlFor="gc-set-name">Name</label>
          <input
            id="gc-set-name"
            style={fieldStyle}
            value={values.set_name}
            placeholder="ASI 012 — Canopy framing revisions"
            onChange={(e) => set("set_name", e.target.value)}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle} htmlFor="gc-issued-date">Issued date</label>
            <input
              id="gc-issued-date"
              type="date"
              style={fieldStyle}
              value={values.issued_date}
              onChange={(e) => set("issued_date", e.target.value)}
            />
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-muted)" }}>
              The date printed on the document.
            </p>
          </div>
          <div>
            <label style={labelStyle} htmlFor="gc-received-date">Received date</label>
            <input
              id="gc-received-date"
              type="date"
              style={fieldStyle}
              value={values.received_date}
              onChange={(e) => set("received_date", e.target.value)}
            />
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-muted)" }}>
              The day it reached us. The gap is the notice we actually got.
            </p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle} htmlFor="gc-issued-by">Issued by</label>
            <input
              id="gc-issued-by"
              style={fieldStyle}
              value={values.issued_by}
              placeholder="Architect / GC / EOR"
              onChange={(e) => set("issued_by", e.target.value)}
            />
          </div>
          <div>
            <label style={labelStyle} htmlFor="gc-category">Discipline</label>
            <select
              id="gc-category"
              style={fieldStyle}
              value={values.category}
              onChange={(e) => set("category", e.target.value)}
            >
              {GC_SET_CATEGORIES.map((c) => (
                <option key={c} value={c}>{GC_SET_CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle} htmlFor="gc-revision">Their revision</label>
            <input
              id="gc-revision"
              style={fieldStyle}
              value={values.revision}
              placeholder="Rev 3"
              onChange={(e) => set("revision", e.target.value)}
            />
          </div>
        </div>

        <div>
          <label style={labelStyle} htmlFor="gc-description">Notes</label>
          <textarea
            id="gc-description"
            style={{ ...fieldStyle, minHeight: 72, resize: "vertical" }}
            value={values.description}
            placeholder="What changed, and where."
            onChange={(e) => set("description", e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}
