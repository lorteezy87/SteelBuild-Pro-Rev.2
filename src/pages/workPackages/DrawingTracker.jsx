/**
 * DrawingTracker — the "Drawings" view inside Work Packages. Two
 * cards side-by-side:
 *
 *   1. DRAWING PIPELINE — stage-by-stage count + coverage bars,
 *      clickable to scope the log below.
 *   2. DRAWING LOG — sticky-header table of drawings sorted by due
 *      date (Released last), with a per-row WP linkage badge.
 *
 * Drawings with `linked_drawing_ids` (comma-separated on the WP) are
 * cross-referenced against `workPackages` to show the WP number.
 */

import React from "react";
import { DRAWING_STAGES, STAGE_STYLES } from "./constants";
import { formatDate } from "./utils";

export default function DrawingTracker({
  projectId,
  drawings,
  workPackages,
  stageFilter,
  onStageFilterChange,
}) {
  if (!projectId) {
    return (
      <div style={{ padding: 32, textAlign: "center", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
        Select a project to view drawing tracker
      </div>
    );
  }

  const drawingTotal = drawings.length;
  const hasDrawings = drawingTotal > 0;
  const drawingsByStage = DRAWING_STAGES.reduce((acc, s) => {
    acc[s.id] = drawings.filter((d) => d.stage === s.id).length;
    return acc;
  }, {});

  const filteredDrawings = stageFilter === "all"
    ? drawings
    : drawings.filter((d) => d.stage === stageFilter);

  const sortedDrawings = [...filteredDrawings].sort((a, b) => {
    if (a.stage === "Released" && b.stage !== "Released") return 1;
    if (b.stage === "Released" && a.stage !== "Released") return -1;
    const da = a.due_date ? new Date(`${a.due_date}T00:00:00Z`) : new Date("2100-01-01");
    const db = b.due_date ? new Date(`${b.due_date}T00:00:00Z`) : new Date("2100-01-01");
    return da - db;
  });

  const overdueDrawings = drawings.filter(
    (d) => d.due_date && new Date(`${d.due_date}T00:00:00Z`) < new Date() && d.stage !== "Released"
  );

  const stageBar = DRAWING_STAGES.map((s) => ({ ...s, count: drawingsByStage[s.id] || 0 }));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16, marginTop: 12 }}>
      <PipelineCard
        drawingsByStage={drawingsByStage}
        drawingTotal={drawingTotal}
        hasDrawings={hasDrawings}
        stageFilter={stageFilter}
        onStageFilterChange={onStageFilterChange}
      />
      <LogCard
        stageFilter={stageFilter}
        stageBar={stageBar}
        drawingTotal={drawingTotal}
        overdueDrawings={overdueDrawings}
        sortedDrawings={sortedDrawings}
        workPackages={workPackages}
      />
    </div>
  );
}

function PipelineCard({ drawingsByStage, drawingTotal, hasDrawings, stageFilter, onStageFilterChange }) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 14px",
          borderBottom: "1px solid var(--divider)",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--text-secondary)",
          letterSpacing: "0.08em",
        }}
      >
        DRAWING PIPELINE
      </div>
      <div style={{ padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <ColHeader>STAGE</ColHeader>
          <ColHeader>COUNT</ColHeader>
          <ColHeader>COVERAGE</ColHeader>
        </div>
        {DRAWING_STAGES.map((stage) => {
          const count = drawingsByStage[stage.id] || 0;
          const pct = hasDrawings ? ((count / drawingTotal) * 100).toFixed(1) : "0.0";
          return (
            <div
              key={stage.id}
              onClick={() => onStageFilterChange(stageFilter === stage.id ? "all" : stage.id)}
              style={{
                display: "grid",
                gridTemplateColumns: "110px 40px 1fr",
                alignItems: "center",
                gap: 8,
                padding: "6px 0",
                cursor: "pointer",
              }}
            >
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: stage.color, letterSpacing: "0.08em" }}>
                {stage.label}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-primary)" }}>{count}</span>
              <div style={{ height: 6, background: "var(--bg-surface-high)", borderRadius: 2 }}>
                <div style={{ width: `${pct}%`, height: "100%", background: stage.color, borderRadius: 2 }} />
              </div>
            </div>
          );
        })}
        <div style={{ marginTop: 10, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)" }}>
          {hasDrawings
            ? <>Total: {drawingTotal} · Released: {drawingsByStage["Released"] || 0} ({(((drawingsByStage["Released"] || 0) / drawingTotal) * 100).toFixed(1)}%)</>
            : "No drawings linked"}
        </div>
      </div>
    </div>
  );
}

function LogCard({ stageFilter, stageBar, drawingTotal, overdueDrawings, sortedDrawings, workPackages }) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 14px",
          borderBottom: "1px solid var(--divider)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)", letterSpacing: "0.08em" }}>
          DRAWING LOG
        </div>
        {stageFilter !== "all" && (
          <div
            style={{
              padding: "2px 8px",
              borderRadius: "var(--radius-badge)",
              border: "1px solid var(--border-default)",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--text-secondary)",
            }}
          >
            Filter: {stageFilter}
          </div>
        )}
      </div>

      <div style={{ padding: 12 }}>
        <div style={{ display: "flex", height: 8, overflow: "hidden", borderRadius: 4, marginBottom: 10 }}>
          {stageBar.map((s) => {
            const width = drawingTotal ? (s.count / drawingTotal) * 100 : 0;
            return <div key={s.id} style={{ width: `${width}%`, background: s.color }} />;
          })}
        </div>

        {overdueDrawings.length > 0 && (
          <div
            style={{
              background: "var(--danger-muted)",
              border: "1px solid var(--danger-border)",
              borderLeft: "4px solid var(--status-error)",
              borderRadius: "var(--radius-card)",
              padding: "8px 10px",
              marginBottom: 10,
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--status-error)",
              letterSpacing: "0.08em",
            }}
          >
            {overdueDrawings.length} DRAWINGS OVERDUE — SUBMITTAL DEADLINE PASSED
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "80px 1fr 80px 70px 90px 80px 80px",
            gap: 8,
            padding: "6px 0",
            borderBottom: "1px solid var(--divider)",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
            letterSpacing: "0.08em",
          }}
        >
          <span>SHEET</span>
          <span>TITLE</span>
          <span>DISC</span>
          <span>REV</span>
          <span>STAGE</span>
          <span>DUE</span>
          <span>WP</span>
        </div>

        {sortedDrawings.map((d) => {
          const style = STAGE_STYLES[d.stage] || STAGE_STYLES["Not Started"];
          const overdue = d.due_date && new Date(`${d.due_date}T00:00:00Z`) < new Date() && d.stage !== "Released";
          const linkedWP = workPackages.find((wp) =>
            (wp.linked_drawing_ids || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
              .includes(String(d.id))
          );

          return (
            <div
              key={d.id}
              style={{
                display: "grid",
                gridTemplateColumns: "80px 1fr 80px 70px 90px 80px 80px",
                gap: 8,
                padding: "10px 0",
                borderBottom: "1px solid var(--divider)",
                alignItems: "center",
                fontSize: 11,
              }}
            >
              <div style={{ fontFamily: "var(--font-mono)", color: "var(--accent)", fontWeight: 700, fontSize: 10 }}>
                {d.sheet_number || "\u2014"}
              </div>
              <div style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {d.title || "\u2014"}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                {(d.discipline || "\u2014").toUpperCase().slice(0, 6)}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)" }}>
                {d.revision_number || "0"}
              </div>
              <div
                style={{
                  background: style.bg,
                  color: style.color,
                  padding: "2px 7px",
                  borderRadius: "var(--radius-badge)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 8,
                  fontWeight: 700,
                  textTransform: "uppercase",
                }}
              >
                {d.stage || "Not Started"}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: overdue ? "var(--status-error)" : "var(--text-muted)",
                  fontWeight: overdue ? 700 : 500,
                }}
              >
                {d.due_date ? formatDate(d.due_date).replace(", 2026", "") : "\u2014"}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent)", fontWeight: 700 }}>
                {linkedWP ? linkedWP.wp_number : "\u2014"}
              </div>
            </div>
          );
        })}

        {sortedDrawings.length === 0 && (
          <div style={{ padding: 16, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
            No drawings match this filter.
          </div>
        )}
      </div>
    </div>
  );
}

function ColHeader({ children }) {
  return (
    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
      {children}
    </span>
  );
}
