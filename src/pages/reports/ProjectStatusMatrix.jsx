/**
 * ProjectStatusMatrix — the sortable 11-column table of projects
 * (number, name, phase, health, budget, actual, variance, RFIs, COs,
 * WP progress, action button). Sticky header, clickable name and
 * clickable RFI/CO counts that route to the respective modules, and
 * a skeleton empty state when the filter produces no rows.
 *
 * Owns neither sort state nor filter state — the page shell passes
 * them in and the Clear-Filter button just calls `onClearFilter`.
 */

import React from "react";
import { createPageUrl } from "@/utils";
import { mono, body, CARD, CARD_TITLE, LABEL, HEALTH_COLORS, PHASE_COLORS } from "./constants";
import { formatCurrency } from "./utils";
import SortHeader from "./SortHeader";
import MiniProgressBar from "./MiniProgressBar";
import { SkeletonTableRow } from "./skeletons";

const GRID_COLS = "40px 2fr 90px 50px 100px 100px 80px 60px 50px 120px 60px";

export default function ProjectStatusMatrix({
  title,
  filteredRows,
  sortField,
  sortDir,
  onSort,
  kpiFilter,
  onClearFilter,
  search,
  navigate,
}) {
  return (
    <div style={{ ...CARD, padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--divider)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={CARD_TITLE}>{title}</div>
        {kpiFilter && (
          <button
            onClick={onClearFilter}
            style={{
              background: "var(--accent-muted)",
              color: "var(--accent)",
              border: "1px solid var(--accent-border)",
              borderRadius: "var(--radius-badge)",
              padding: "3px 10px",
              ...mono,
              fontSize: 8,
              fontWeight: 600,
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Clear filter
          </button>
        )}
      </div>

      <div style={{ overflowX: "auto" }}>
        {/* Sticky header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: GRID_COLS,
            padding: "9px 16px",
            gap: 8,
            background: "var(--bg-surface-low)",
            borderBottom: "1px solid var(--divider)",
            position: "sticky",
            top: 0,
            zIndex: 2,
            minWidth: 960,
          }}
        >
          <SortHeader label="#"            field="number"   sortField={sortField} sortDir={sortDir} onSort={onSort} />
          <SortHeader label="Project Name" field="name"     sortField={sortField} sortDir={sortDir} onSort={onSort} />
          <SortHeader label="Phase"        field="phase"    sortField={sortField} sortDir={sortDir} onSort={onSort} />
          <SortHeader label="Health"       field="health"   sortField={sortField} sortDir={sortDir} onSort={onSort} />
          <SortHeader label="Budget"       field="budget"   sortField={sortField} sortDir={sortDir} onSort={onSort} style={{ textAlign: "right", justifyContent: "flex-end" }} />
          <SortHeader label="Actual"       field="actual"   sortField={sortField} sortDir={sortDir} onSort={onSort} style={{ textAlign: "right", justifyContent: "flex-end" }} />
          <SortHeader label="VAR"          field="variance" sortField={sortField} sortDir={sortDir} onSort={onSort} style={{ textAlign: "right", justifyContent: "flex-end" }} />
          <SortHeader label="RFIs"         field="openRFIs" sortField={sortField} sortDir={sortDir} onSort={onSort} style={{ textAlign: "center", justifyContent: "center" }} />
          <SortHeader label="COs"          field="openCOs"  sortField={sortField} sortDir={sortDir} onSort={onSort} style={{ textAlign: "center", justifyContent: "center" }} />
          <SortHeader label="WP Progress"  field="wpPct"    sortField={sortField} sortDir={sortDir} onSort={onSort} />
          <div style={LABEL}>Action</div>
        </div>

        {filteredRows.length > 0 ? (
          filteredRows.map((row) => <Row key={row.id} row={row} navigate={navigate} />)
        ) : (
          <EmptyTable kpiFilter={kpiFilter} search={search} navigate={navigate} />
        )}
      </div>
    </div>
  );
}

function Row({ row, navigate }) {
  const rowBg = row.health === "risk" ? "rgba(239,68,68,0.03)" : "transparent";
  const hoverBg = row.health === "risk" ? "rgba(239,68,68,0.06)" : "var(--bg-row-hover)";
  const leftBorder =
    row.health === "risk"  ? "3px solid var(--status-error)"
    : row.health === "watch" ? "3px solid var(--status-warning)"
    : "3px solid transparent";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: GRID_COLS,
        padding: "10px 16px",
        gap: 8,
        borderBottom: "1px solid var(--divider)",
        borderLeft: leftBorder,
        alignItems: "center",
        minWidth: 960,
        transition: "background 0.1s",
        cursor: "default",
        background: rowBg,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = hoverBg)}
      onMouseLeave={(e) => (e.currentTarget.style.background = rowBg)}
    >
      <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>{row.number}</div>
      <div
        onClick={() => navigate(createPageUrl("Projects") + `?id=${row.id}`)}
        style={{ ...body, fontSize: 12, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
      >
        {row.name}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: PHASE_COLORS[row.phase] || "var(--text-muted)", flexShrink: 0 }} />
        <span style={{ ...mono, fontSize: 9, color: "var(--text-secondary)", textTransform: "uppercase" }}>{row.phase}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: HEALTH_COLORS[row.health],
            boxShadow: row.health === "risk" ? "0 0 6px var(--status-error)" : "none",
          }}
          title={row.health}
        />
      </div>
      <div style={{ ...mono, fontSize: 11, color: "var(--text-primary)", textAlign: "right" }}>{formatCurrency(row.budget)}</div>
      <div style={{ ...mono, fontSize: 11, color: "var(--text-primary)", textAlign: "right" }}>{formatCurrency(row.actual)}</div>
      <div
        style={{
          ...mono,
          fontSize: 11,
          fontWeight: 600,
          textAlign: "right",
          color: row.variance <= 0 ? "var(--status-success)" : "var(--status-error)",
        }}
      >
        {row.variance === 0 ? "\u2014" : (row.variance > 0 ? "+" : "") + formatCurrency(row.variance)}
      </div>
      <div
        onClick={row.openRFIs > 0 ? () => navigate(createPageUrl("RFIs")) : undefined}
        style={{
          ...mono, fontSize: 11, textAlign: "center", fontWeight: row.openRFIs > 0 ? 700 : 400,
          color: row.openRFIs > 0 ? "var(--status-warning)" : "var(--text-muted)",
          cursor: row.openRFIs > 0 ? "pointer" : "default",
          textDecoration: row.openRFIs > 0 ? "underline" : "none",
          textDecorationStyle: "dotted",
          textUnderlineOffset: 2,
        }}
      >
        {row.openRFIs}
      </div>
      <div
        onClick={row.openCOs > 0 ? () => navigate(createPageUrl("ChangeOrders")) : undefined}
        style={{
          ...mono, fontSize: 11, textAlign: "center", fontWeight: row.openCOs > 0 ? 700 : 400,
          color: row.openCOs > 0 ? "#F97316" : "var(--text-muted)",
          cursor: row.openCOs > 0 ? "pointer" : "default",
          textDecoration: row.openCOs > 0 ? "underline" : "none",
          textDecorationStyle: "dotted",
          textUnderlineOffset: 2,
        }}
      >
        {row.openCOs}
      </div>
      <MiniProgressBar
        pct={row.wpPct}
        color={row.wpPct >= 80 ? "var(--status-success)" : row.wpPct >= 40 ? "var(--accent)" : "var(--status-info)"}
      />
      <button
        onClick={() => navigate(createPageUrl("Projects") + `?id=${row.id}`)}
        style={{
          background: "var(--accent)",
          color: "#fff",
          border: "none",
          borderRadius: "var(--radius-btn)",
          padding: "4px 10px",
          ...mono,
          fontSize: 8,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          cursor: "pointer",
        }}
      >
        View
      </button>
    </div>
  );
}

function EmptyTable({ kpiFilter, search, navigate }) {
  return (
    <div style={{ padding: "48px 20px", textAlign: "center" }}>
      <div style={{ opacity: 0.4, marginBottom: 16 }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonTableRow key={i} />
        ))}
      </div>
      <div style={{ ...mono, fontSize: 12, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.1em" }}>
        No projects yet
      </div>
      <p style={{ ...body, fontSize: 12, color: "var(--text-secondary)", marginBottom: 14 }}>
        {kpiFilter || search ? "No projects match the current filters." : "Create your first project to see the status matrix."}
      </p>
      {!kpiFilter && !search && (
        <button
          onClick={() => navigate(createPageUrl("Projects"))}
          style={{
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius-btn)",
            padding: "8px 18px",
            ...mono,
            fontSize: 9,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            cursor: "pointer",
          }}
        >
          + Create First Project
        </button>
      )}
    </div>
  );
}
