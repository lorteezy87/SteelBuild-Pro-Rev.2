import React, { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { formatCurrency, formatCurrencyShort, formatDate } from "@/components/shared/formatters";
import { mono, body, HEALTH_COLOR, safeNumber } from "../utils";
import { DrawerTile, drawerTd, drawerTdRight, FinancialDrawer } from "../DrawerAtoms";

export function LaborDrawer({ open, onClose, kpi, selectedProject }) {
  const qc = useQueryClient();
  const [sortCol, setSortCol] = useState("revised_budget");
  const [sortDir, setSortDir] = useState("desc");

  // Scope override inline edit state
  const [editing, setEditing] = useState(false);
  const [draftValue, setDraftValue] = useState("");
  const [inputError, setInputError] = useState(null);

  // Reset edit state when switching projects or closing
  useEffect(() => {
    setEditing(false);
    setDraftValue("");
    setInputError(null);
  }, [selectedProject?.id, open]);

  // Atomic mutation: sets BOTH scope_complete_pct_override + scope_complete_pct_override_date
  // in a single update call. Cache invalidation triggers useFinancials refetch — no page reload.
  const updateMut = useMutation({
    mutationFn: async ({ id, data }) => base44.entities.Project.update(id, data),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["projects"] });
      await qc.invalidateQueries({ queryKey: ["project"] });
      setEditing(false);
      setDraftValue("");
      setInputError(null);
      toast.success("Scope % override updated");
    },
    onError: (err) => {
      setInputError(err.message);
      toast.error(`Failed to save override: ${err.message}`);
    },
  });

  if (!open) return null;

  const barColor = HEALTH_COLOR[kpi.health] || HEALTH_COLOR.amber;
  const rows = kpi.laborRows || [];

  const sortFn = (a, b) => {
    const aVal = a[sortCol] ?? "";
    const bVal = b[sortCol] ?? "";
    const numA = Number(aVal);
    const numB = Number(bVal);
    if (Number.isFinite(numA) && Number.isFinite(numB)) {
      return sortDir === "asc" ? numA - numB : numB - numA;
    }
    const sA = String(aVal).toLowerCase();
    const sB = String(bVal).toLowerCase();
    if (sA < sB) return sortDir === "asc" ? -1 : 1;
    if (sA > sB) return sortDir === "asc" ? 1 : -1;
    return 0;
  };

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  const sortedRows = [...rows].sort(sortFn);

  const renderTh = (col, label, right = false) => (
    <th
      key={col}
      onClick={() => toggleSort(col)}
      style={{
        ...mono,
        fontSize: 8,
        fontWeight: 700,
        color: sortCol === col ? "var(--accent)" : "var(--text-muted)",
        letterSpacing: "0.10em",
        textTransform: "uppercase",
        padding: "8px 6px",
        textAlign: right ? "right" : "left",
        cursor: "pointer",
        userSelect: "none",
        borderBottom: "1px solid var(--divider)",
        whiteSpace: "nowrap",
      }}
    >
      {label}{sortCol === col ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
    </th>
  );

  const onEdit = () => {
    const pre = kpi.overridePct != null ? kpi.overridePct : kpi.evmDerivedPct;
    setDraftValue(Number.isFinite(pre) ? pre.toFixed(1) : "");
    setEditing(true);
    setInputError(null);
  };

  const onSave = () => {
    const value = parseFloat(draftValue);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      setInputError("Must be a number between 0 and 100");
      return;
    }
    if (!selectedProject?.id) {
      setInputError("No project selected");
      return;
    }
    updateMut.mutate({
      id: selectedProject.id,
      data: {
        scope_complete_pct_override: value,
        scope_complete_pct_override_date: new Date().toISOString().split("T")[0],
      },
    });
  };

  const onCancel = () => {
    setEditing(false);
    setDraftValue("");
    setInputError(null);
  };

  const onClear = () => {
    if (!selectedProject?.id) return;
    updateMut.mutate({
      id: selectedProject.id,
      data: {
        scope_complete_pct_override: null,
        scope_complete_pct_override_date: null,
      },
    });
  };

  const isOverrideActive = kpi.percentScopeCompleteSource === "override";
  const overrideDate = selectedProject?.scope_complete_pct_override_date;

  const subtitle = `${kpi.health.toUpperCase()} — ${kpi.utilizationRatio != null ? `${kpi.utilizationRatio.toFixed(2)} RATIO` : "INSUFFICIENT DATA"}`;

  return (
    <FinancialDrawer
      open={open}
      onClose={onClose}
      barColor={barColor}
      title="Labor Utilization"
      subtitle={subtitle}
    >

          {/* Summary tiles — 2×2 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 16 }}>
            <DrawerTile label="Labor Budget" value={formatCurrency(kpi.laborBudget)} sub={`${rows.length} code${rows.length === 1 ? "" : "s"}`} accent="var(--accent)" />
            <DrawerTile label="Labor Actual" value={formatCurrency(kpi.laborActual)} sub={`${kpi.percentLaborConsumed.toFixed(1)}% consumed`} accent="var(--status-warning)" />
            <DrawerTile label="% Consumed" value={`${kpi.percentLaborConsumed.toFixed(1)}%`} sub={`of ${formatCurrencyShort(kpi.laborBudget)} budget`} accent="var(--status-info)" />
            <DrawerTile
              label="Utilization Ratio"
              value={kpi.utilizationRatio != null ? kpi.utilizationRatio.toFixed(2) : "—"}
              sub={
                kpi.utilizationRatio != null
                  ? (kpi.utilizationRatio > 1.1 ? "Overburn" : kpi.utilizationRatio > 1.0 ? "Slight overburn" : "On track")
                  : "No scope data"
              }
              accent={barColor}
            />
          </div>

          {/* ── Scope % Override Inline Control ── */}
          <div style={{
            background: "var(--bg-surface)", border: "1px solid var(--border-default)",
            borderLeft: `3px solid ${isOverrideActive ? "var(--accent)" : "var(--border-default)"}`,
            borderRadius: "var(--radius-card)", padding: "14px", marginBottom: 16,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase" }}>
                SCOPE % COMPLETE
              </div>
              {isOverrideActive && !editing && (
                <span style={{
                  padding: "2px 6px",
                  borderRadius: 3,
                  background: "var(--accent-muted)",
                  border: "1px solid var(--accent-border)",
                  fontFamily: "'Space Grotesk', var(--font-display)",
                  fontSize: 8,
                  fontWeight: 700,
                  color: "var(--accent)",
                  letterSpacing: "0.08em",
                }}>OVERRIDE</span>
              )}
            </div>

            {/* Effective value (big) */}
            <div style={{
              ...mono, fontSize: 22, fontWeight: 700,
              color: isOverrideActive ? "var(--accent)" : "var(--text-primary)",
              marginBottom: 10, lineHeight: 1.1,
            }}>
              {kpi.percentScopeComplete.toFixed(1)}%
            </div>

            {/* Both sources always visible for transparency */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", ...body, fontSize: 11 }}>
                <span style={{ color: "var(--text-muted)" }}>EVM derived (from work packages)</span>
                <span style={{ ...mono, color: "var(--text-secondary)" }}>{kpi.evmDerivedPct.toFixed(1)}%</span>
              </div>
              {kpi.overridePct != null && (
                <div style={{ display: "flex", justifyContent: "space-between", ...body, fontSize: 11 }}>
                  <span style={{ color: "var(--text-muted)" }}>
                    PM override{overrideDate ? ` (set ${formatDate(overrideDate)})` : ""}
                  </span>
                  <span style={{ ...mono, color: "var(--accent)", fontWeight: 700 }}>{kpi.overridePct.toFixed(1)}%</span>
                </div>
              )}
            </div>

            {/* Edit / Save / Cancel / Clear controls */}
            {!editing ? (
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={onEdit}
                  disabled={updateMut.isPending || !selectedProject?.id}
                  style={{
                    flex: 1,
                    padding: "7px 12px",
                    background: "var(--accent-muted)",
                    border: "1px solid var(--accent-border)",
                    borderRadius: "var(--radius-btn)",
                    color: "var(--accent)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 9, fontWeight: 700,
                    letterSpacing: "0.08em", textTransform: "uppercase",
                    cursor: updateMut.isPending ? "default" : "pointer",
                    opacity: updateMut.isPending ? 0.6 : 1,
                  }}
                >
                  {isOverrideActive ? "Edit Override" : "Set Override"}
                </button>
                {isOverrideActive && (
                  <button
                    onClick={onClear}
                    disabled={updateMut.isPending}
                    style={{
                      padding: "7px 12px",
                      background: "var(--bg-surface-low)",
                      border: "1px solid var(--border-default)",
                      borderRadius: "var(--radius-btn)",
                      color: "var(--text-secondary)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 9, fontWeight: 700,
                      letterSpacing: "0.08em", textTransform: "uppercase",
                      cursor: updateMut.isPending ? "default" : "pointer",
                      opacity: updateMut.isPending ? 0.6 : 1,
                    }}
                  >
                    {updateMut.isPending ? "..." : "Clear"}
                  </button>
                )}
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={draftValue}
                    onChange={(e) => { setDraftValue(e.target.value); setInputError(null); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); onSave(); }
                      // stopPropagation so Escape cancels edit without bubbling
                      // to the drawer's Escape-closes-drawer handler.
                      if (e.key === "Escape") { e.stopPropagation(); onCancel(); }
                    }}
                    autoFocus
                    disabled={updateMut.isPending}
                    style={{
                      flex: 1,
                      background: "var(--bg-input)",
                      border: `1px solid ${inputError ? "var(--status-error)" : "var(--border-default)"}`,
                      borderRadius: "var(--radius-input)",
                      padding: "8px 10px",
                      color: "var(--text-primary)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                    }}
                  />
                  <span style={{ ...mono, fontSize: 12, color: "var(--text-muted)" }}>%</span>
                </div>
                {inputError && (
                  <div style={{ ...mono, fontSize: 9, color: "var(--status-error)", marginBottom: 6 }}>
                    {inputError}
                  </div>
                )}
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={onSave}
                    disabled={updateMut.isPending}
                    style={{
                      flex: 1,
                      padding: "7px 12px",
                      background: "var(--accent)",
                      border: "none",
                      borderRadius: "var(--radius-btn)",
                      color: "#fff",
                      fontFamily: "var(--font-mono)",
                      fontSize: 9, fontWeight: 700,
                      letterSpacing: "0.08em", textTransform: "uppercase",
                      cursor: updateMut.isPending ? "default" : "pointer",
                      opacity: updateMut.isPending ? 0.6 : 1,
                    }}
                  >
                    {updateMut.isPending ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={onCancel}
                    disabled={updateMut.isPending}
                    style={{
                      padding: "7px 12px",
                      background: "var(--bg-surface-low)",
                      border: "1px solid var(--border-default)",
                      borderRadius: "var(--radius-btn)",
                      color: "var(--text-secondary)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 9, fontWeight: 700,
                      letterSpacing: "0.08em", textTransform: "uppercase",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Projection panel */}
          {kpi.projectedFinalLaborCost != null && (
            <div style={{
              background: "var(--bg-surface)", border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-card)", padding: "12px 14px", marginBottom: 16,
            }}>
              <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 8 }}>
                PROJECTION AT COMPLETION
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ ...body, fontSize: 12, color: "var(--text-secondary)" }}>Projected final labor cost</span>
                <span style={{ ...mono, fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                  {formatCurrency(kpi.projectedFinalLaborCost)}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ ...body, fontSize: 12, color: "var(--text-secondary)" }}>Projected overrun vs. budget</span>
                <span style={{
                  ...mono, fontSize: 12, fontWeight: 700,
                  color: kpi.projectedOverrun > 0 ? "var(--status-error)" : "var(--status-success)",
                }}>
                  {kpi.projectedOverrun >= 0 ? "+" : ""}{formatCurrency(kpi.projectedOverrun)}
                </span>
              </div>
            </div>
          )}

          {/* Per-code labor breakdown table */}
          {sortedRows.length > 0 ? (
            <div style={{ marginBottom: 16 }}>
              <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 6 }}>
                LABOR COST BREAKDOWN ({sortedRows.length})
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {renderTh("cost_code_number", "Code")}
                      {renderTh("description", "Description")}
                      {renderTh("revised_budget", "Budget", true)}
                      {renderTh("actual_cost", "Actual", true)}
                      {renderTh("used_pct", "Used %", true)}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map(r => (
                      <tr key={r.id}>
                        <td style={drawerTd}>
                          <span style={{ ...mono, fontSize: 10, color: "var(--accent)" }}>{r.cost_code_number || "—"}</span>
                        </td>
                        <td style={{ ...drawerTd, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>
                          {r.description || "—"}
                        </td>
                        <td style={drawerTdRight}>{formatCurrency(safeNumber(r.revised_budget))}</td>
                        <td style={drawerTdRight}>{formatCurrency(safeNumber(r.actual_cost))}</td>
                        <td style={{
                          ...drawerTdRight,
                          color: r.used_pct > 100 ? "var(--status-error)" : r.used_pct > 85 ? "var(--status-warning)" : "var(--text-primary)",
                        }}>
                          {safeNumber(r.used_pct).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "32px 16px" }}>
              <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                No labor cost codes configured
              </div>
              <div style={{ ...body, fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                Labor codes are identified by the cost code catalog (codes 06, 07, 08, 10).
              </div>
            </div>
          )}
    </FinancialDrawer>
  );
}
