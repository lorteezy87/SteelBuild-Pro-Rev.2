import React, { useState } from "react";
import PhoenixModal, { btnPrimary, btnSecondary, inputStyle } from "@/components/shared/PhoenixModal";
import { STAGES, DISCIPLINES, mono } from "./drawingsConfig";

/**
 * BulkEditModal — Apply field updates to multiple selected drawings at once.
 *
 * Only checked fields are included in the update payload. Unchecked fields
 * are left untouched on each drawing.
 */

const labelStyle = {
  display: "block",
  ...mono,
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.12em",
  color: "var(--text-muted)",
  textTransform: "uppercase",
  marginBottom: 4,
};

const selectStyle = { ...inputStyle, cursor: "pointer" };

const INITIAL = {
  revision_number: "",
  submitted_date: "",
  due_date: "",
  return_date: "",
  reviewer: "",
  discipline: "",
  stage: "",
  spec_section: "",
  priority_flag: false,
  notes: "",
};

export default function BulkEditModal({ open, onClose, onApply, selectedCount }) {
  const [form, setForm] = useState({ ...INITIAL });
  const [enabled, setEnabled] = useState({});

  const toggle = (key) =>
    setEnabled((prev) => ({ ...prev, [key]: !prev[key] }));

  const set = (key, value) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const enabledCount = Object.values(enabled).filter(Boolean).length;

  const handleApply = () => {
    const payload = {};
    for (const key of Object.keys(INITIAL)) {
      if (enabled[key]) {
        payload[key] = form[key];
      }
    }
    // Normalize empty date strings to null for Supabase
    for (const dateKey of ["submitted_date", "due_date", "return_date"]) {
      if (dateKey in payload && !payload[dateKey]) {
        payload[dateKey] = null;
      }
    }
    onApply(payload);
  };

  const handleClose = () => {
    setForm({ ...INITIAL });
    setEnabled({});
    onClose();
  };

  const footer = (
    <>
      <button type="button" onClick={handleClose} style={btnSecondary}>
        Cancel
      </button>
      <button
        type="button"
        onClick={handleApply}
        disabled={enabledCount === 0}
        style={{
          ...btnPrimary,
          opacity: enabledCount === 0 ? 0.4 : 1,
          cursor: enabledCount === 0 ? "not-allowed" : "pointer",
        }}
      >
        Apply to {selectedCount} sheet{selectedCount === 1 ? "" : "s"}
      </button>
    </>
  );

  return (
    <PhoenixModal
      open={open}
      onClose={handleClose}
      title={`Bulk Edit — ${selectedCount} sheet${selectedCount === 1 ? "" : "s"}`}
      footer={footer}
      maxWidth={560}
    >
      <p
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 12,
          color: "var(--text-muted)",
          margin: "0 0 14px",
          lineHeight: 1.5,
        }}
      >
        Check the fields you want to update. Only checked fields will be
        changed — unchecked fields stay as-is on each sheet.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* ── Revision ── */}
        <FieldRow
          label="Revision #"
          fieldKey="revision_number"
          enabled={enabled}
          toggle={toggle}
        >
          <input
            style={inputStyle}
            value={form.revision_number}
            onChange={(e) => set("revision_number", e.target.value)}
            placeholder="e.g. 2, A, etc."
            disabled={!enabled.revision_number}
          />
        </FieldRow>

        {/* ── Dates ── */}
        <FieldRow
          label="Submitted Date"
          fieldKey="submitted_date"
          enabled={enabled}
          toggle={toggle}
        >
          <input
            type="date"
            style={inputStyle}
            value={form.submitted_date}
            onChange={(e) => set("submitted_date", e.target.value)}
            disabled={!enabled.submitted_date}
          />
        </FieldRow>

        <FieldRow
          label="Due Date"
          fieldKey="due_date"
          enabled={enabled}
          toggle={toggle}
        >
          <input
            type="date"
            style={inputStyle}
            value={form.due_date}
            onChange={(e) => set("due_date", e.target.value)}
            disabled={!enabled.due_date}
          />
        </FieldRow>

        <FieldRow
          label="Date Received"
          fieldKey="return_date"
          enabled={enabled}
          toggle={toggle}
        >
          <input
            type="date"
            style={inputStyle}
            value={form.return_date}
            onChange={(e) => set("return_date", e.target.value)}
            disabled={!enabled.return_date}
          />
        </FieldRow>

        {/* ── People ── */}
        <FieldRow
          label="Reviewer / Assigned To"
          fieldKey="reviewer"
          enabled={enabled}
          toggle={toggle}
        >
          <input
            style={inputStyle}
            value={form.reviewer}
            onChange={(e) => set("reviewer", e.target.value)}
            placeholder="Engineer name"
            disabled={!enabled.reviewer}
          />
        </FieldRow>

        {/* ── Dropdowns ── */}
        <FieldRow
          label="Discipline"
          fieldKey="discipline"
          enabled={enabled}
          toggle={toggle}
        >
          <select
            style={selectStyle}
            value={form.discipline}
            onChange={(e) => set("discipline", e.target.value)}
            disabled={!enabled.discipline}
          >
            <option value="">— select —</option>
            {DISCIPLINES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </FieldRow>

        <FieldRow
          label="Stage"
          fieldKey="stage"
          enabled={enabled}
          toggle={toggle}
        >
          <select
            style={selectStyle}
            value={form.stage}
            onChange={(e) => set("stage", e.target.value)}
            disabled={!enabled.stage}
          >
            <option value="">— select —</option>
            {STAGES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </FieldRow>

        {/* ── Other ── */}
        <FieldRow
          label="Spec Section"
          fieldKey="spec_section"
          enabled={enabled}
          toggle={toggle}
        >
          <input
            style={inputStyle}
            value={form.spec_section}
            onChange={(e) => set("spec_section", e.target.value)}
            placeholder="05 12 00"
            disabled={!enabled.spec_section}
          />
        </FieldRow>

        <FieldRow
          label="Critical Priority"
          fieldKey="priority_flag"
          enabled={enabled}
          toggle={toggle}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 4 }}>
            <input
              type="checkbox"
              checked={!!form.priority_flag}
              onChange={(e) => set("priority_flag", e.target.checked)}
              disabled={!enabled.priority_flag}
            />
            <span
              style={{
                ...mono,
                fontSize: 10,
                color: enabled.priority_flag
                  ? "var(--text-primary)"
                  : "var(--text-muted)",
              }}
            >
              Mark as critical
            </span>
          </div>
        </FieldRow>

        <FieldRow
          label="Notes"
          fieldKey="notes"
          enabled={enabled}
          toggle={toggle}
        >
          <textarea
            style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Applies same note to all selected sheets"
            disabled={!enabled.notes}
          />
        </FieldRow>
      </div>
    </PhoenixModal>
  );
}

/**
 * A single field row: checkbox toggle on the left, label + input on the right.
 */
function FieldRow({ label, fieldKey, enabled, toggle, children }) {
  const isOn = !!enabled[fieldKey];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "8px 10px",
        borderRadius: 6,
        background: isOn ? "rgba(200,155,32,0.05)" : "transparent",
        border: isOn
          ? "1px solid rgba(200,155,32,0.2)"
          : "1px solid transparent",
        transition: "all 0.12s",
      }}
    >
      <input
        type="checkbox"
        checked={isOn}
        onChange={() => toggle(fieldKey)}
        style={{ marginTop: 6, cursor: "pointer", flexShrink: 0 }}
      />
      <div style={{ flex: 1, opacity: isOn ? 1 : 0.45, transition: "opacity 0.12s" }}>
        <label style={labelStyle}>{label}</label>
        {children}
      </div>
    </div>
  );
}
