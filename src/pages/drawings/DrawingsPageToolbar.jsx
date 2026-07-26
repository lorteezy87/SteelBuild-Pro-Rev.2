/**
 * Banner + CommandBar + KPI tiles for the Drawings page.
 * Extracted from Drawings.jsx — toolbar wiring only; no behavior change.
 */
import React from "react";
import { mono } from "@/components/drawings/drawingsConfig";
import { exportTransmittal } from "@/components/drawings/drawingsUtils";
import { CommandBar, KpiTile, Button } from "@/components/design-system";
import { toggleStageFilterValue } from "./drawingActionHelpers";

export default function DrawingsPageToolbar({
  embedded,
  projectName,
  stats,
  filtered,
  canCreateDrawing,
  drawingSetRecordsLength,
  existingSetNamesLength,
  stageFilter,
  onBackToHub,
  onExportPkg,
  onAddSheet,
  onOpenRevision,
  onOpenLogImport,
  onOpenUploadSet,
  onStageFilter,
}) {
  return (
    <>
      {/* ── Secondary-view banner: this is the full editor; the Hub is the command center ── */}
      {!embedded && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
            padding: "8px 14px", marginBottom: 14, borderRadius: 8,
            border: "1px solid var(--border-default)",
            background: "var(--bg-surface-low)",
          }}
        >
          <span style={{ ...mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", flexShrink: 0 }}>
            Full Editor
          </span>
          <span style={{ fontSize: 12.5, color: "var(--text-secondary, var(--text-muted))", lineHeight: 1.5 }}>
            The <strong style={{ color: "var(--text-primary)" }}>Detailing Control Center</strong> is your command center. This page is the detailed editor — filters, bulk actions, rename / delete, per-sheet.
          </span>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="sbd-btn sbd-btn-primary"
            style={{ whiteSpace: "nowrap" }}
            onClick={onBackToHub}
          >
            ← Back to the Hub
          </button>
        </div>
      )}

      {/* ── CommandBar ─────────────────────────────────────────────────────── */}
      <CommandBar
        eyebrow={`DESIGN & DOCUMENTS · ${(projectName || "").toUpperCase()}`}
        title="Drawings & Submittals"
        count={stats.total}
        unit={` · ${stats.sheetCount} SHEETS`}
        subtitle="Not Started → IFA → OFA → BFA → OFS → IFC → Released"
      >
        <Button variant="secondary" icon="download" onClick={() => exportTransmittal(filtered, projectName)}>
          TRANSMITTAL
        </Button>
        <Button variant="secondary" icon="download" onClick={() => onExportPkg("fab_release")}>
          EXPORT FAB RELEASE
        </Button>
        <Button variant="secondary" icon="download" onClick={() => onExportPkg("turnover")}>
          TURNOVER PACKAGE
        </Button>
        <Button variant="secondary" icon="download" onClick={() => onExportPkg("claims")}>
          CLAIMS PACKAGE
        </Button>
        {canCreateDrawing && (
          <Button variant="secondary" icon="plus" onClick={onAddSheet}>
            ADD SHEET
          </Button>
        )}
        <Button
          variant="outline"
          icon="arrow"
          onClick={onOpenRevision}
          disabled={drawingSetRecordsLength === 0 && existingSetNamesLength === 0}
          title="Upload a new revision of an existing set"
        >
          NEW REVISION
        </Button>
        {canCreateDrawing && (
          <Button variant="outline" icon="upload" onClick={onOpenLogImport} title="Import a detailer Drawing Complete / Submittal Log (.xls)">
            IMPORT LOG
          </Button>
        )}
        <Button variant="primary" icon="upload" onClick={onOpenUploadSet}>
          UPLOAD SET
        </Button>
      </CommandBar>

      {/* ── KPI Row (hidden when embedded — the hub shows its own KPIs) ─────── */}
      {!embedded && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 14 }}>
          <KpiTile compact label="PACKAGES"  value={stats.total}    color="var(--accent)"          active={stageFilter === "ALL"}        onClick={() => onStageFilter("ALL")} />
          <KpiTile compact label="RELEASED"  value={stats.released} color="var(--status-success)"  active={stageFilter === "Released"}   onClick={() => onStageFilter("Released")} />
          <KpiTile compact label="IN REVIEW" value={stats.inReview} color="var(--status-info)"     active={stageFilter === "_inReview"}  onClick={() => onStageFilter(toggleStageFilterValue(stageFilter, "_inReview"))} />
          <KpiTile compact label="OVERDUE"   value={stats.overdue}  color="var(--status-error)"    active={stageFilter === "_overdue"}   onClick={() => onStageFilter(toggleStageFilterValue(stageFilter, "_overdue"))} />
          <KpiTile compact label="PRIORITY"  value={stats.priority} color="var(--status-review)"   active={stageFilter === "_priority"}  onClick={() => onStageFilter(toggleStageFilterValue(stageFilter, "_priority"))} />
        </div>
      )}
    </>
  );
}
