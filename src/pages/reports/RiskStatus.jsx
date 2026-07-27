/**
 * Risk Status — classic 5x5 probability × impact matrix.
 *
 *   X axis (cols): Impact 1 → 5 (low to high, left to right)
 *   Y axis (rows): Probability 5 → 1 (high to low, top to bottom)
 *
 * Highest-risk cell sits top-right exactly the way every PMI / ISO
 * 31000 reference renders it. Each cell is colour-banded by the same
 * severity formula as the DB GENERATED column, shows a count, and
 * expands on click into a list of the risks that landed in that
 * cell — clicking a risk opens the shared edit modal.
 */

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import ReportShell from "./ReportShell";
import { FilterBar, SelectFilter } from "./ReportFilters";
import { CARD, CARD_TITLE, mono } from "./constants";
import {
  bucketByMatrix,
  computeSeverity,
  severityColor,
  SEVERITIES,
} from "./risks/severity";
import RiskFormModal from "@/components/risks/RiskFormModal";

export default function RiskStatus() {
  const [projectFilter, setProjectFilter] = useState("all");
  const [selectedCell, setSelectedCell] = useState(null); // { p, i }
  const [editingRow, setEditingRow] = useState(null);

  const { data: risks = [] } = useQuery({
    queryKey: ["risks"],
    queryFn: () => entities.Risk.list(),
  });
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
  });

  const scoped = useMemo(() => {
    if (projectFilter === "all") return risks;
    return risks.filter((r) => r.project_id === projectFilter);
  }, [risks, projectFilter]);

  const grid = useMemo(() => bucketByMatrix(scoped), [scoped]);

  // Selected cell's risk list — used by the side panel below the matrix.
  const cellRisks = useMemo(() => {
    if (!selectedCell) return [];
    const { p, i } = selectedCell;
    return grid[p]?.[i] || [];
  }, [selectedCell, grid]);

  const total = scoped.length;
  const placedCount = useMemo(
    () =>
      grid.flat().reduce((sum, cellArr) => sum + cellArr.length, 0),
    [grid]
  );

  return (
    <ReportShell
      title="Risk Status"
      count={total}
      unit=" · RISKS"
      subtitle="Probability × Impact heat map. Click a cell to drill into the risks it contains."
      filters={
        <FilterBar>
          <SelectFilter
            label="Project"
            value={projectFilter}
            onChange={setProjectFilter}
            options={[
              { key: "all", label: "All projects" },
              ...projects.map((p) => ({
                key: p.id,
                label: p.project_number
                  ? `${p.project_number} — ${p.name}`
                  : p.name || "Untitled",
              })),
            ]}
          />
        </FilterBar>
      }
    >
      <div style={CARD}>
        <div style={CARD_TITLE}>5 × 5 Risk Matrix</div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "auto repeat(5, minmax(72px, 1fr))",
            gap: 4,
            alignItems: "stretch",
          }}
        >
          {/* Top-left empty corner */}
          <span />
          {/* Column headers — Impact 1..5 */}
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={`col-${i}`}
              style={{
                ...mono,
                fontSize: 9,
                fontWeight: 700,
                color: "var(--text-muted)",
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                textAlign: "center",
                padding: "4px 0",
              }}
            >
              Impact {i}
            </div>
          ))}

          {/* Rows — Probability 5..1 (top to bottom) */}
          {[5, 4, 3, 2, 1].map((p) => (
            <React.Fragment key={`row-${p}`}>
              <div
                style={{
                  ...mono,
                  fontSize: 9,
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  paddingRight: 8,
                  minWidth: 78,
                }}
              >
                Prob {p}
              </div>
              {[1, 2, 3, 4, 5].map((i) => {
                const cellRisksHere = grid[p][i];
                const count = cellRisksHere.length;
                const sev = computeSeverity(p, i);
                const color = severityColor(sev);
                const active =
                  selectedCell && selectedCell.p === p && selectedCell.i === i;
                return (
                  <button
                    key={`cell-${p}-${i}`}
                    type="button"
                    onClick={() =>
                      setSelectedCell(active ? null : { p, i })
                    }
                    style={{
                      position: "relative",
                      minHeight: 64,
                      background: count > 0 ? color : "var(--bg-surface-low)",
                      opacity: count > 0 ? (active ? 1 : 0.85) : 0.32,
                      border: active
                        ? `2px solid var(--text-primary)`
                        : `1px solid ${color}`,
                      borderRadius: 6,
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 2,
                      padding: 6,
                      transition: "opacity 0.12s, transform 0.12s",
                    }}
                    title={`Probability ${p} × Impact ${i} = ${p * i} · ${sev}`}
                  >
                    <span
                      style={{
                        ...mono,
                        fontSize: 18,
                        fontWeight: 700,
                        color:
                          count > 0 ? "var(--bg-base)" : "var(--text-muted)",
                        lineHeight: 1,
                      }}
                    >
                      {count || "—"}
                    </span>
                    <span
                      style={{
                        ...mono,
                        fontSize: 8,
                        fontWeight: 700,
                        color:
                          count > 0
                            ? "color-mix(in srgb, var(--bg-base) 55%, transparent)"
                            : "var(--text-muted)",
                        letterSpacing: "0.10em",
                        textTransform: "uppercase",
                      }}
                    >
                      {p * i}
                    </span>
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </div>

        {/* Legend */}
        <div
          style={{
            marginTop: 14,
            display: "flex",
            flexWrap: "wrap",
            gap: 14,
            alignItems: "center",
            ...mono,
            fontSize: 9,
            color: "var(--text-muted)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          <span>Severity bands —</span>
          {SEVERITIES.map((sev) => (
            <div
              key={sev}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  background: severityColor(sev),
                  borderRadius: 2,
                }}
              />
              <span style={{ color: "var(--text-secondary)" }}>{sev}</span>
            </div>
          ))}
          <span style={{ marginLeft: "auto", color: "var(--text-muted)" }}>
            {placedCount} of {total} placed
          </span>
        </div>
      </div>

      {/* Selected cell drill-in */}
      {selectedCell && (
        <div style={CARD}>
          <div
            style={{
              ...CARD_TITLE,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>
              Probability {selectedCell.p} × Impact {selectedCell.i} — Score{" "}
              {selectedCell.p * selectedCell.i} ·{" "}
              <span
                style={{
                  color: severityColor(
                    computeSeverity(selectedCell.p, selectedCell.i)
                  ),
                }}
              >
                {computeSeverity(selectedCell.p, selectedCell.i)}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setSelectedCell(null)}
              style={{
                ...mono,
                fontSize: 9,
                fontWeight: 700,
                color: "var(--text-muted)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                letterSpacing: "0.10em",
                textTransform: "uppercase",
              }}
            >
              Clear
            </button>
          </div>
          {cellRisks.length === 0 ? (
            <div
              style={{
                padding: "24px 0",
                textAlign: "center",
                ...mono,
                fontSize: 10,
                color: "var(--text-muted)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              No risks in this cell
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {cellRisks.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setEditingRow(r)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 12px",
                    background: "var(--bg-surface-low)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-btn)",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.title}
                    </div>
                    <div
                      style={{
                        ...mono,
                        fontSize: 9,
                        color: "var(--text-muted)",
                        marginTop: 2,
                      }}
                    >
                      {r.category || "—"} · {r.status} · Owner {r.owner || "—"}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <RiskFormModal
        open={Boolean(editingRow)}
        onClose={() => setEditingRow(null)}
        initial={editingRow}
        projectId={editingRow?.project_id}
      />
    </ReportShell>
  );
}
