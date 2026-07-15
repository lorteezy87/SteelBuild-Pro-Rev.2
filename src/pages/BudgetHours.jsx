/**
 * Budget Hours — per-project budget vs actual labor-hours tracker.
 *
 * Mirrors the Estimating Kickoff sheet: each scope-item row carries
 * Shop / Field budget hours (set once at kickoff) and Shop / Field
 * actual hours (rolled up live). Variance % surfaces in red / amber /
 * green so PMs can spot scopes that are bleeding hours without
 * leaving the dashboard.
 *
 * Two preset starters ship out of the box:
 *  - "Estimating Kickoff (Standard 12)" — the 12 canonical scope items
 *    from the workbook (Embeds, Columns, Beams, Joists, Bridging,
 *    Ledger, Deck-Support, Roof Frames, Lintels, Moment Frame Bracing,
 *    Stairs & Rail, Site Steel).
 *  - "Empty" — a single blank row.
 *
 * Optional: when a row carries `metadata.linked_work_package_ids[]`,
 * the actuals roll up from those WPs' shop_hours_actual /
 * field_hours_actual instead of being entered manually. The default
 * is manual entry — link-up is opt-in per row from the row's edit
 * popover.
 */

import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2, X } from "lucide-react";
import { entities } from "@/api/supabaseClient";
import { useProjectId } from "@/hooks/useProjectId";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { PRESET_LIST } from "@/lib/budgetHourPresets";
import { usePermissions } from "@/services/permissions";
import { logActivity } from "@/services/auditLogger";
import { invalidateEntity } from "@/services/cacheRegistry";
import { toastCrudError } from "@/components/shared/crudFeedback";
import DeleteDialog from "@/components/shared/DeleteDialog";
import BudgetHoursControlCenter from "./budgetHours/BudgetHoursControlCenter";
import ScopeItemFormModal from "./budgetHours/ScopeItemFormModal";

/* ─────────────────────────────────────────────
   Variance helpers
───────────────────────────────────────────── */
function variancePct(budget, actual) {
  const b = Number(budget) || 0;
  const a = Number(actual) || 0;
  if (b <= 0) return a > 0 ? 100 : 0;
  return ((a - b) / b) * 100;
}

function varianceColor(pct) {
  if (pct >= 10) return "var(--status-error)";
  if (pct > 0) return "var(--status-warning)";
  return "var(--status-success)";
}

function fmtPct(pct) {
  if (!Number.isFinite(pct)) return "—";
  const rounded = Math.round(pct * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}%`;
}

function fmtHours(n) {
  const v = Number(n) || 0;
  return v.toFixed(1);
}

/**
 * Display helper for cells where 0 should read as "blank" so the user
 * doesn't have to delete the placeholder zero before typing. Used by
 * HourCell's read-mode rendering only — the underlying DB value stays
 * 0 (column default) so sums and rollups work normally.
 */
function fmtHoursOrBlank(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v === 0) return "—";
  return v.toFixed(1);
}

/* ─────────────────────────────────────────────
   Roll up actual hours from linked work packages.
   Pure helper — null/missing arrays return the manual value.
───────────────────────────────────────────── */
function effectiveActuals(row, wpsById) {
  const linked = row?.metadata?.linked_work_package_ids;
  if (!Array.isArray(linked) || linked.length === 0) {
    return {
      shop: Number(row.shop_hours_actual) || 0,
      field: Number(row.field_hours_actual) || 0,
      linked: false,
    };
  }
  let shop = 0, field = 0;
  for (const id of linked) {
    const wp = wpsById.get(id);
    if (!wp) continue;
    shop += Number(wp.shop_hours_actual) || 0;
    field += Number(wp.field_hours_actual) || 0;
  }
  return { shop, field, linked: true };
}

/* ─────────────────────────────────────────────
   Inline number cell — click to edit, Enter saves
───────────────────────────────────────────── */
function HourCell({ value, locked, onSave }) {
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
function TextCell({ value, placeholder, onSave, mono = false }) {
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
function PresetDialog({ open, onClose, onPick }) {
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
function MissesPanel({ projectId, missesRow, onCreateRow, onUpdateRow }) {
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
export default function BudgetHours() {
  const projectId = useProjectId();
  const { activeProject } = useProjectContext();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const [presetOpen, setPresetOpen] = useState(false);
  // Control-center filters remain page-owned so query and mutation state stays stable.
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [overBudgetOnly, setOverBudgetOnly] = useState(false);
  // Scope-item create/edit modal + delete confirm (canonical presentation CRUD).
  const [scopeModalOpen, setScopeModalOpen] = useState(false);
  const [scopeEditTarget, setScopeEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const canCreateScope = can("create", "budget_hour_item");
  const canEditScope = can("edit", "budget_hour_item");
  const canDeleteScope = can("delete", "budget_hour_item");

  /* ── Data ── */
  // The entity wrapper doesn't auto-filter soft-deletes, so the query
  // returns rows even after `is_deleted=true`. We strip them here so
  // every downstream consumer (the Standard / Specialty buckets, the
  // Misses sub-table, totals) sees an "active rows only" view and the
  // user actually sees the row disappear after they click Remove.
  const { data: rawRows = [], isLoading } = useQuery({
    queryKey: ["budget-hour-items", projectId],
    queryFn: () => (projectId ? entities.BudgetHourItem.filter({ project_id: projectId }, "sort_order") : []),
    enabled: !!projectId,
  });
  const rows = useMemo(() => rawRows.filter((r) => !r?.is_deleted), [rawRows]);
  const { data: wps = [] } = useQuery({
    queryKey: ["work-packages", projectId],
    queryFn: () => (projectId ? entities.WorkPackage.filter({ project_id: projectId }) : []),
    enabled: !!projectId,
  });
  const wpsById = useMemo(() => {
    const m = new Map();
    wps.forEach((w) => m.set(w.id, w));
    return m;
  }, [wps]);

  /* ── Mutations ──
     Audit + cache invalidation mirror the canonical Deliveries pattern:
     logActivity (fire-and-forget) + invalidateEntity (fans out every
     budget-hour-items key) + toastCrudError on failure. deleteMut stays a
     SOFT delete (is_deleted flag) — recoverable, never a hard delete. */
  const createMut = useMutation({
    mutationFn: (data) => entities.BudgetHourItem.create(data),
    onSuccess: async (created) => {
      logActivity("budget_hour_item", "created", created, { projectId });
      await invalidateEntity(qc, "budget_hour_item", projectId);
    },
    onError: (e) => toastCrudError(e, "Create failed"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, patch }) => entities.BudgetHourItem.update(id, patch),
    onSuccess: async (updated) => {
      logActivity("budget_hour_item", "updated", updated, { projectId });
      await invalidateEntity(qc, "budget_hour_item", projectId);
    },
    onError: (e) => toastCrudError(e, "Save failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => entities.BudgetHourItem.update(id, { is_deleted: true, deleted_at: new Date().toISOString() }),
    onSuccess: async (updated, deletedId) => {
      logActivity(
        "budget_hour_item",
        "deleted",
        updated || { id: deletedId, project_id: projectId, scope_item: deleteTarget?.scope_item },
        { projectId },
      );
      await invalidateEntity(qc, "budget_hour_item", projectId);
      toast.success("Row removed");
    },
    onError: (e) => toastCrudError(e, "Delete failed"),
  });

  /* ── Buckets ── */
  const standardRows = useMemo(
    () => rows.filter((r) => r.category === "Standard" && !r.is_specialty),
    [rows]
  );
  const specialtyRows = useMemo(
    () => rows.filter((r) => r.category === "Specialty" || r.is_specialty),
    [rows]
  );
  const missesRow = useMemo(() => rows.find((r) => r.category === "Misses") || null, [rows]);

  /* ── Totals ── */
  const totals = useMemo(() => {
    const real = rows.filter((r) => r.category !== "Misses");
    let sb = 0, sa = 0, fb = 0, fa = 0;
    for (const r of real) {
      sb += Number(r.shop_hours_budget) || 0;
      fb += Number(r.field_hours_budget) || 0;
      const eff = effectiveActuals(r, wpsById);
      sa += eff.shop;
      fa += eff.field;
    }
    return { sb, sa, fb, fa };
  }, [rows, wpsById]);

  const shopVarPct = variancePct(totals.sb, totals.sa);
  const fieldVarPct = variancePct(totals.fb, totals.fa);
  const totalBudget = totals.sb + totals.fb;
  const totalActual = totals.sa + totals.fa;
  const totalVarPct = variancePct(totalBudget, totalActual);

  /* ── Handlers ── */
  const addBlankRow = () => {
    if (!projectId) return;
    const maxSort = Math.max(0, ...rows.map((r) => Number(r.sort_order) || 0));
    createMut.mutate({
      project_id: projectId,
      category: "Standard",
      scope_item: "New Scope Item",
      sort_order: maxSort + 10,
      is_specialty: false,
      shop_hours_budget: 0,
      shop_hours_actual: 0,
      field_hours_budget: 0,
      field_hours_actual: 0,
      metadata: {},
    });
  };

  const applyPreset = async (preset) => {
    if (!projectId) return;
    setPresetOpen(false);
    const built = preset.build();
    // Sequentially create so sort_order stays stable; small list (≤12).
    for (const row of built) {
      try {
        await entities.BudgetHourItem.create({ ...row, project_id: projectId });
      } catch (e) {
        toast.error(`Preset row "${row.scope_item}" failed: ${e.message || "unknown"}`);
      }
    }
    qc.invalidateQueries({ queryKey: ["budget-hour-items", projectId] });
    toast.success(`Loaded "${preset.label}"`);
  };

  const saveCell = (id, patch) => updateMut.mutate({ id, patch });

  /* ── Scope-item modal CRUD ── */
  const openCreateScope = () => {
    setScopeEditTarget(null);
    setScopeModalOpen(true);
  };

  const openEditScope = (row) => {
    setScopeEditTarget(row);
    setScopeModalOpen(true);
  };

  // Save from the modal — create (new row, next sort_order) or update ({id,patch}).
  const handleScopeSave = (patch) => {
    if (!projectId) return;
    if (scopeEditTarget) {
      updateMut.mutate(
        { id: scopeEditTarget.id, patch },
        { onSuccess: () => { setScopeModalOpen(false); setScopeEditTarget(null); } }
      );
    } else {
      const maxSort = Math.max(0, ...rows.map((r) => Number(r.sort_order) || 0));
      createMut.mutate(
        { ...patch, project_id: projectId, sort_order: maxSort + 10, metadata: {} },
        { onSuccess: () => setScopeModalOpen(false) }
      );
    }
  };

  const requestDeleteRow = (row) => setDeleteTarget(row);
  const confirmDeleteRow = () => {
    if (!deleteTarget?.id) return;
    deleteMut.mutate(deleteTarget.id, { onSettled: () => setDeleteTarget(null) });
  };

  /* ── Canonical Budget Hours control center ── */
    // Apply search + category + over-budget filter for the DataTable.
    // Misses rows are always excluded from the table (they have their own panel).
    const commandFiltered = rows
      .filter((r) => r.category !== "Misses")
      .filter((r) => {
        if (categoryFilter === "Standard") return r.category === "Standard" && !r.is_specialty;
        if (categoryFilter === "Specialty") return r.category === "Specialty" || r.is_specialty;
        return true;
      })
      .filter((r) => {
        if (!overBudgetOnly) return true;
        // Quick over-budget check: total actual > total budget (ignoring WP rollup for filter — full math in derive)
        const tb = (Number(r.shop_hours_budget) || 0) + (Number(r.field_hours_budget) || 0);
        const ta = (Number(r.shop_hours_actual) || 0) + (Number(r.field_hours_actual) || 0);
        return ta > tb && tb > 0;
      })
      .filter((r) => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return (
          (r.scope_item || "").toLowerCase().includes(q) ||
          (r.notes || "").toLowerCase().includes(q)
        );
      });

    const handleExportCsv = () => {
      const headers = ["Scope Item", "Category", "Shop Budget", "Shop Actual", "Field Budget", "Field Actual", "Notes"];
      const exportRows = commandFiltered.map((r) => [
        r.scope_item, r.category,
        Number(r.shop_hours_budget) || 0,
        Number(r.shop_hours_actual) || 0,
        Number(r.field_hours_budget) || 0,
        Number(r.field_hours_actual) || 0,
        r.notes || "",
      ]);
      const csv = [headers, ...exportRows].map((row) => row.map((c) => `"${c ?? ""}"`).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "budget_hours.csv";
      a.click();
      URL.revokeObjectURL(url);
    };

    return (
      <>
        <BudgetHoursControlCenter
          projectName={activeProject?.name || "Project"}
          rows={rows}
          wpsById={wpsById}
          search={search}
          onSearch={setSearch}
          categoryFilter={categoryFilter}
          onCategoryChange={setCategoryFilter}
          overBudgetOnly={overBudgetOnly}
          onOverBudgetToggle={() => setOverBudgetOnly((v) => !v)}
          filteredRows={commandFiltered}
          onAddItem={openCreateScope}
          onSetUpTemplate={() => setPresetOpen(true)}
          onExport={handleExportCsv}
          onEditRow={openEditScope}
          onDeleteRow={requestDeleteRow}
          canCreate={canCreateScope}
          canEdit={canEditScope}
          canDelete={canDeleteScope}
        />
        <PresetDialog open={presetOpen} onClose={() => setPresetOpen(false)} onPick={applyPreset} />
        <ScopeItemFormModal
          open={scopeModalOpen}
          editTarget={scopeEditTarget}
          saving={createMut.isPending || updateMut.isPending}
          onClose={() => { setScopeModalOpen(false); setScopeEditTarget(null); }}
          onSave={handleScopeSave}
        />
        <DeleteDialog
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={confirmDeleteRow}
          title="Delete scope item?"
          description={
            deleteTarget?.scope_item
              ? `"${deleteTarget.scope_item}" will be removed from Budget Hours.`
              : "This scope item will be removed from Budget Hours."
          }
        />
      </>
    );
}
