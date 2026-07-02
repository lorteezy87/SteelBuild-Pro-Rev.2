/**
 * ScopeItemFormModal.tsx
 *
 * Create / edit form for a Budget Hours scope item (budget_hour_items row).
 * Used by the command_ui Budget Hours Control Center for full row-level CRUD —
 * the classic inline-edit path is untouched.
 *
 * Fields: scope_item (name, required), category / is_specialty, shop hours
 * budget+actual, field hours budget+actual, notes. Save routes to the parent's
 * createMut (create) or updateMut ({ id, patch }) (edit) — the modal never
 * touches Supabase or the query cache itself, so audit + invalidation stay
 * owned by BudgetHours.jsx (mirrors how the classic page's mutations work).
 *
 * Styled with the shared design-system primitives (.sbd-input / .sbd-select /
 * .sbd-textarea, design tokens) so it reads correctly under the light command
 * skin AND the classic dark theme — no command.css edits (worktree constraint).
 */

import React, { useState } from "react";
import { X } from "lucide-react";

// ─── Form shape ────────────────────────────────────────────────────────────────

export interface ScopeItemFormValues {
  scope_item: string;
  /** "Standard" | "Specialty" (drives is_specialty). */
  category: string;
  is_specialty: boolean;
  shop_hours_budget: number;
  shop_hours_actual: number;
  field_hours_budget: number;
  field_hours_actual: number;
  notes: string;
}

/** Minimal shape of an existing row we can edit (subset of BudgetHourRow). */
export interface ScopeItemEditTarget {
  id: string;
  scope_item?: string | null;
  category?: string | null;
  is_specialty?: boolean | null;
  shop_hours_budget?: number | null;
  shop_hours_actual?: number | null;
  field_hours_budget?: number | null;
  field_hours_actual?: number | null;
  notes?: string | null;
  /** Present when actuals roll up from linked work packages — actual fields are
   *  then read-only (edited via the classic row popover, not here). */
  metadata?: { linked_work_package_ids?: string[]; [key: string]: unknown } | null;
}

// ─── Pure helpers (exported for tests) ───────────────────────────────────────────

/** Coerce a form-input string to a non-negative number (blank → 0). */
export function toHours(raw: string): number {
  const trimmed = String(raw ?? "").trim();
  if (trimmed === "") return 0;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/** Validate form values. Returns an error string, or null when valid. */
export function validateScopeItem(values: Pick<ScopeItemFormValues, "scope_item">): string | null {
  if (!values.scope_item || !values.scope_item.trim()) {
    return "Scope item name is required.";
  }
  return null;
}

/** Build the Supabase write payload from form values (shared create/edit shape). */
export function buildScopeItemPatch(values: ScopeItemFormValues): Record<string, unknown> {
  const isSpecialty = values.category === "Specialty" || values.is_specialty;
  return {
    scope_item: values.scope_item.trim(),
    category: isSpecialty ? "Specialty" : "Standard",
    is_specialty: isSpecialty,
    shop_hours_budget: values.shop_hours_budget,
    shop_hours_actual: values.shop_hours_actual,
    field_hours_budget: values.field_hours_budget,
    field_hours_actual: values.field_hours_actual,
    notes: values.notes.trim() || null,
  };
}

// ─── Field styling (design tokens, skin-agnostic) ────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: "block",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  marginBottom: 4,
};

// ─── Props ───────────────────────────────────────────────────────────────────

export interface ScopeItemFormModalProps {
  open: boolean;
  /** null → create mode; a row → edit mode. */
  editTarget: ScopeItemEditTarget | null;
  /** Disable the save button while a mutation is in flight. */
  saving?: boolean;
  onClose: () => void;
  /** Called with the validated write payload. Parent runs the mutation. */
  onSave: (patch: Record<string, unknown>) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ScopeItemFormModal({
  open,
  editTarget,
  saving = false,
  onClose,
  onSave,
}: ScopeItemFormModalProps) {
  const isEdit = !!editTarget;
  const linked = Array.isArray(editTarget?.metadata?.linked_work_package_ids)
    && (editTarget?.metadata?.linked_work_package_ids?.length ?? 0) > 0;

  const [values, setValues] = useState<ScopeItemFormValues>(() => ({
    scope_item: editTarget?.scope_item ?? "",
    category:
      editTarget?.category === "Specialty" || editTarget?.is_specialty ? "Specialty" : "Standard",
    is_specialty: !!editTarget?.is_specialty,
    shop_hours_budget: Number(editTarget?.shop_hours_budget) || 0,
    shop_hours_actual: Number(editTarget?.shop_hours_actual) || 0,
    field_hours_budget: Number(editTarget?.field_hours_budget) || 0,
    field_hours_actual: Number(editTarget?.field_hours_actual) || 0,
    notes: editTarget?.notes ?? "",
  }));
  const [error, setError] = useState<string | null>(null);

  // Re-seed the form whenever the modal (re)opens for a different target.
  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setValues({
      scope_item: editTarget?.scope_item ?? "",
      category:
        editTarget?.category === "Specialty" || editTarget?.is_specialty ? "Specialty" : "Standard",
      is_specialty: !!editTarget?.is_specialty,
      shop_hours_budget: Number(editTarget?.shop_hours_budget) || 0,
      shop_hours_actual: Number(editTarget?.shop_hours_actual) || 0,
      field_hours_budget: Number(editTarget?.field_hours_budget) || 0,
      field_hours_actual: Number(editTarget?.field_hours_actual) || 0,
      notes: editTarget?.notes ?? "",
    });
    // editTarget identity + open drive the reset; id is the stable handle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editTarget?.id]);

  if (!open) return null;

  const set = <K extends keyof ScopeItemFormValues>(key: K, value: ScopeItemFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const submit = () => {
    const validationError = validateScopeItem(values);
    if (validationError) {
      setError(validationError);
      return;
    }
    onSave(buildScopeItemPatch(values));
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 120,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? "Edit scope item" : "Add scope item"}
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: 12,
          padding: 22,
          width: "100%",
          maxWidth: 520,
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--text-primary)",
            }}
          >
            {isEdit ? "Edit Scope Item" : "Add Scope Item"}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 0 }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Name */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle} htmlFor="scope-item-name">Scope Item Name *</label>
          <input
            id="scope-item-name"
            className="sbd-input"
            autoFocus
            value={values.scope_item}
            placeholder="e.g. Main Steel — Columns"
            onChange={(e) => { set("scope_item", e.target.value); if (error) setError(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            style={{ width: "100%" }}
          />
        </div>

        {/* Category */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle} htmlFor="scope-item-category">Category</label>
          <select
            id="scope-item-category"
            className="sbd-select"
            value={values.category}
            onChange={(e) => {
              const category = e.target.value;
              set("category", category);
              set("is_specialty", category === "Specialty");
            }}
            style={{ width: "100%" }}
          >
            <option value="Standard">Standard</option>
            <option value="Specialty">Specialty</option>
          </select>
        </div>

        {/* Hours grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 4 }}>
          <div>
            <label style={labelStyle} htmlFor="shop-budget">Shop Hours — Budget</label>
            <input
              id="shop-budget"
              className="sbd-input"
              type="number"
              min="0"
              step="0.25"
              value={values.shop_hours_budget}
              onChange={(e) => set("shop_hours_budget", toHours(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>
          <div>
            <label style={labelStyle} htmlFor="shop-actual">
              Shop Hours — Actual{linked ? " (WP)" : ""}
            </label>
            <input
              id="shop-actual"
              className="sbd-input"
              type="number"
              min="0"
              step="0.25"
              disabled={linked}
              title={linked ? "Auto-rolled from linked work packages" : undefined}
              value={values.shop_hours_actual}
              onChange={(e) => set("shop_hours_actual", toHours(e.target.value))}
              style={{ width: "100%", opacity: linked ? 0.6 : 1 }}
            />
          </div>
          <div>
            <label style={labelStyle} htmlFor="field-budget">Field Hours — Budget</label>
            <input
              id="field-budget"
              className="sbd-input"
              type="number"
              min="0"
              step="0.25"
              value={values.field_hours_budget}
              onChange={(e) => set("field_hours_budget", toHours(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>
          <div>
            <label style={labelStyle} htmlFor="field-actual">
              Field Hours — Actual{linked ? " (WP)" : ""}
            </label>
            <input
              id="field-actual"
              className="sbd-input"
              type="number"
              min="0"
              step="0.25"
              disabled={linked}
              title={linked ? "Auto-rolled from linked work packages" : undefined}
              value={values.field_hours_actual}
              onChange={(e) => set("field_hours_actual", toHours(e.target.value))}
              style={{ width: "100%", opacity: linked ? 0.6 : 1 }}
            />
          </div>
        </div>

        {linked && (
          <div
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 11,
              color: "var(--text-muted)",
              margin: "6px 0 10px",
            }}
          >
            Actual hours roll up from linked work packages — edit the link from the row popover on the Full Editor.
          </div>
        )}

        {/* Notes */}
        <div style={{ marginTop: 10, marginBottom: 4 }}>
          <label style={labelStyle} htmlFor="scope-item-notes">Notes</label>
          <textarea
            id="scope-item-notes"
            className="sbd-textarea"
            rows={2}
            value={values.notes}
            placeholder="Optional context for this scope item"
            onChange={(e) => set("notes", e.target.value)}
            style={{ width: "100%", resize: "vertical" }}
          />
        </div>

        {/* Error */}
        {error && (
          <div
            role="alert"
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 12,
              color: "var(--status-error)",
              marginTop: 10,
            }}
          >
            {error}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button
            type="button"
            className="sbd-btn sbd-btn-ghost"
            onClick={onClose}
            style={{ fontFamily: "var(--font-body)", fontSize: 13 }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="sbd-btn sbd-btn-primary"
            onClick={submit}
            disabled={saving}
            style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, opacity: saving ? 0.7 : 1 }}
          >
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Scope Item"}
          </button>
        </div>
      </div>
    </div>
  );
}
