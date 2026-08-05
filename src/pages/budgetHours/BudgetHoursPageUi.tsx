/**
 * Presentational inline editors for classic Budget Hours page.
 */
// @ts-nocheck
import React, { useState } from "react";
import { Trash2, X } from "lucide-react";
import { PRESET_LIST } from "@/lib/budgetHourPresets";
import { fmtHoursOrBlank } from "./budgetHoursControlCenter.derive";

export function HourCell({ value, locked, onSave }) {
  const [editing, setEditing] = useState(false);
  // Treat null AND 0 as "blank" in the input so the user can land on
  // a freshly-templated row and start typing immediately, no need to
  // delete a placeholder zero each time. The cell's read-mode display
  // also renders an em-dash for zero (see fmtHoursOrBlank). The DB
  // value stays 0 on commit when the input is left empty so the
  // rollup math doesn't break.
  const toDraft = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n === 0) return "";
    return String(n);
  };
  const [draft, setDraft] = useState(() => toDraft(value));
  React.useEffect(() => { setDraft(toDraft(value)); }, [value]);

  const commit = () => {
    setEditing(false);
    const trimmed = String(draft || "").trim();
    const next = trimmed === "" ? 0 : (Number(trimmed) || 0);
    if (next !== Number(value)) onSave(next);
  };

  if (locked) {
    return (
      <span
        title="Auto-rolled from linked work packages"
        style={{
          fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700,
          color: "var(--accent)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {fmtHours(value)}
        <span style={{ marginLeft: 4, fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em" }}>WP</span>
      </span>
    );
  }

  if (!editing) {
    const isZero = !Number.isFinite(Number(value)) || Number(value) === 0;
    return (
      <button
        onClick={() => setEditing(true)}
        title={isZero ? "Click to enter hours" : undefined}
        style={{
          background: "transparent",
          border: "1px dashed transparent",
          borderRadius: 3,
          padding: "2px 6px",
          fontFamily: "var(--font-mono)", fontSize: 11,
          color: isZero ? "var(--text-muted)" : "var(--text-primary)",
          fontVariantNumeric: "tabular-nums",
          cursor: "pointer",
          width: "100%",
          textAlign: "right",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent-border)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "transparent"; }}
      >
        {fmtHoursOrBlank(value)}
      </button>
    );
  }

  return (
    <input
      autoFocus
      type="number"
      step="0.25"
      placeholder="—"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => { try { e.target.select(); } catch {} }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        else if (e.key === "Escape") { setEditing(false); setDraft(toDraft(value)); }
      }}
      style={{
        width: "100%",
        background: "var(--bg-input)",
        border: "1px solid var(--accent-border)",
        borderRadius: 3,
        padding: "2px 6px",
        fontFamily: "var(--font-mono)", fontSize: 11,
        color: "var(--text-primary)",
        outline: "none",
        textAlign: "right",
      }}
    />
  );
}

/* ─────────────────────────────────────────────
   Inline text cell for scope_item / notes
───────────────────────────────────────────── */
export function TextCell({ value, placeholder, onSave, mono = false }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  React.useEffect(() => { setDraft(value ?? ""); }, [value]);

  const commit = () => {
    setEditing(false);
    if ((draft || "") !== (value || "")) onSave(draft || null);
  };

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        style={{
          background: "transparent",
          border: "1px dashed transparent",
          borderRadius: 3,
          padding: "2px 6px",
          fontFamily: mono ? "var(--font-mono)" : "var(--font-body)",
          fontSize: mono ? 10 : 12,
          color: value ? "var(--text-primary)" : "var(--text-muted)",
          fontStyle: value ? "normal" : "italic",
          cursor: "pointer",
          width: "100%",
          textAlign: "left",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent-border)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "transparent"; }}
      >
        {value || placeholder}
      </button>
    );
  }

  return (
    <input
      autoFocus
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        else if (e.key === "Escape") { setEditing(false); setDraft(value ?? ""); }
      }}
      style={{
        width: "100%",
        background: "var(--bg-input)",
        border: "1px solid var(--accent-border)",
        borderRadius: 3,
        padding: "2px 6px",
        fontFamily: mono ? "var(--font-mono)" : "var(--font-body)",
        fontSize: mono ? 10 : 12,
        color: "var(--text-primary)",
        outline: "none",
      }}
    />
  );
}

/* ─────────────────────────────────────────────
   Tile (KPI strip)
───────────────────────────────────────────── */
/* ─────────────────────────────────────────────
   Preset picker dialog
───────────────────────────────────────────── */
export function PresetDialog({ open, onClose, onPick }) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: 12,
          padding: 22,
          minWidth: 460,
          maxWidth: 560,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700,
            letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-primary)",
          }}>
            Set Up From Template
          </div>
          <button onClick={onClose} style={{
            background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 0,
          }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {PRESET_LIST.map((p) => (
            <button
              key={p.id}
              onClick={() => onPick(p)}
              style={{
                textAlign: "left",
                background: "var(--bg-surface-low)",
                border: "1px solid var(--border-default)",
                borderRadius: 8,
                padding: "12px 14px",
                cursor: "pointer",
                transition: "border-color 0.12s, background 0.12s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--accent-border)";
                e.currentTarget.style.background = "var(--hover-bg)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border-default)";
                e.currentTarget.style.background = "var(--bg-surface-low)";
              }}
            >
              <div style={{
                fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 700,
                color: "var(--text-primary)", marginBottom: 4,
              }}>
                {p.label}
              </div>
              <div style={{
                fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.4,
              }}>
                {p.description}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Misses sub-table — rows live in metadata.misses[]
   on a single special row with category='Misses'.
───────────────────────────────────────────── */
export function MissesPanel({ projectId, missesRow, onCreateRow, onUpdateRow }) {
  const misses = (missesRow?.metadata?.misses || []).filter(Boolean);

  const ensure = async () => {
    if (missesRow) return missesRow;
    return await onCreateRow({
      project_id: projectId,
      category: "Misses",
      scope_item: "Misses / Gap in Scope",
      sort_order: 9999,
      is_specialty: false,
      shop_hours_budget: 0,
      shop_hours_actual: 0,
      field_hours_budget: 0,
      field_hours_actual: 0,
      metadata: { misses: [] },
    });
  };

  const addRow = async () => {
    const row = await ensure();
    const next = [
      ...(row?.metadata?.misses || []),
      { id: crypto.randomUUID(), location: "", rough_cost: 0, explanation: "" },
    ];
    onUpdateRow(row.id, { metadata: { ...(row.metadata || {}), misses: next } });
  };

  const editRow = async (id, patch) => {
    const row = missesRow;
    if (!row) return;
    const next = (row.metadata?.misses || []).map((m) => (m.id === id ? { ...m, ...patch } : m));
    onUpdateRow(row.id, { metadata: { ...(row.metadata || {}), misses: next } });
  };

  const removeRow = async (id) => {
    const row = missesRow;
    if (!row) return;
    const next = (row.metadata?.misses || []).filter((m) => m.id !== id);
    onUpdateRow(row.id, { metadata: { ...(row.metadata || {}), misses: next } });
  };

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
          letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)",
        }}>
          Misses / Gap in Scope
        </div>
        <button
          onClick={addRow}
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: 4,
            padding: "4px 10px",
            color: "var(--text-secondary)",
            fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
            cursor: "pointer",
          }}
        >
          + ADD MISS
        </button>
      </div>
      <div style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: 8,
        overflow: "hidden",
      }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 120px 2fr 32px",
          gap: 8,
          padding: "8px 12px",
          background: "var(--bg-surface-secondary)",
          borderBottom: "1px solid var(--divider)",
        }}>
          {["Location / Description", "Rough Cost", "Explanation", ""].map((h) => (
            <div key={h} style={{
              fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
              letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--text-muted)",
            }}>
              {h}
            </div>
          ))}
        </div>
        {misses.length === 0 ? (
          <div style={{
            padding: "16px 12px", textAlign: "center",
            fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)",
          }}>
            NO MISSES LOGGED — every scope is covered above.
          </div>
        ) : (
          misses.map((m) => (
            <div key={m.id} style={{
              display: "grid",
              gridTemplateColumns: "1fr 120px 2fr 32px",
              gap: 8,
              padding: "6px 12px",
              alignItems: "center",
              borderBottom: "1px solid var(--divider)",
            }}>
              <TextCell
                value={m.location}
                placeholder="Where / what was missed"
                onSave={(v) => editRow(m.id, { location: v })}
              />
              <HourCell value={m.rough_cost} onSave={(v) => editRow(m.id, { rough_cost: v })} />
              <TextCell
                value={m.explanation}
                placeholder="Why it landed outside the budget"
                onSave={(v) => editRow(m.id, { explanation: v })}
              />
              <button
                onClick={() => removeRow(m.id)}
                style={{
                  background: "transparent", border: "none", cursor: "pointer",
                  color: "var(--status-error)", padding: 4, borderRadius: 3,
                }}
                title="Remove"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main page
───────────────────────────────────────────── */
