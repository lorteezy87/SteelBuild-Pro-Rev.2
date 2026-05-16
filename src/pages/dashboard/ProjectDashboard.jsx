/**
 * ProjectDashboard — single-project dashboard, sectioned layout.
 *
 * Rebuilt to match the design prototype the user shared: four
 * collapsible domain panels stacked vertically.
 *
 *   1. Schedule & Timeline       — progress bar, milestones, critical
 *                                  path, work-package pipeline chevron
 *   2. Financial Controls        — contract value tile-strip, cost
 *                                  analysis vs cash flow split, budget
 *                                  consumption bar
 *   3. Document Hub              — RFI status / Submittal pipeline /
 *                                  Ball-in-Court / Recent Activity
 *   4. Team & Workflow           — role cards, task distribution by
 *                                  party, in-progress tasks, quick
 *                                  actions
 *
 * Each section is a self-contained component under
 * `src/pages/dashboard/sections/` and consumes the metrics module
 * (`./projectMetrics.js`) which already encapsulates the heavy
 * derivations. The dashboard itself just plumbs props through.
 *
 * Active-project context (project name, project number, etc.) lives in
 * the Layout chrome (sidebar + project pill) — there's no in-page
 * hero anymore, matching the prototype.
 */

import React from "react";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import ScheduleTimelineSection from "./sections/ScheduleTimelineSection";
import FieldActivitySection from "./sections/FieldActivitySection";
import FinancialControlsSection from "./sections/FinancialControlsSection";
import DocumentHubSection from "./sections/DocumentHubSection";
import TeamWorkflowSection from "./sections/TeamWorkflowSection";

export default function ProjectDashboard({
  project,
  rfis = [],
  cos = [],
  codes = [],
  wps = [],
  deliveries = [],
  actionItems = [],
  expenses = [],
  submittals = [],
  drawings = [],
  sovItems = [],
  scheduleTasks = [],
  drawingActivity = [],
  budgetHourItems = [],
  // Field Activity rollup (added with the Field overhaul)
  dailyLogs = [],
  photos = [],
  punchlistItems = [],
  inspections = [],
  safetyIncidents = [],
  qualityRecords = [],
  onNavigate,
}) {
  // `codes` is accepted for forward compatibility but isn't read by any
  // current section. Reference it once so eslint's unused-args check
  // stays quiet without hiding the prop in the destructure.
  void codes;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 14 }}>
        <ErrorBoundary label="Schedule & Timeline">
          <ScheduleTimelineSection
            project={project}
            wps={wps}
            scheduleTasks={scheduleTasks}
            deliveries={deliveries}
            rfis={rfis}
            actionItems={actionItems}
            onNavigate={onNavigate}
          />
        </ErrorBoundary>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
          gap: 14,
          alignItems: "start",
        }}
      >
        <ErrorBoundary label="Financial Controls">
          <FinancialControlsSection
            project={project}
            cos={cos}
            expenses={expenses}
            wps={wps}
            sovItems={sovItems}
            budgetHourItems={budgetHourItems}
            onNavigate={onNavigate}
          />
        </ErrorBoundary>
        <ErrorBoundary label="Document Hub">
          <DocumentHubSection
            rfis={rfis}
            submittals={submittals}
            drawings={drawings}
            drawingActivity={drawingActivity}
            onNavigate={onNavigate}
          />
        </ErrorBoundary>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
          gap: 14,
          alignItems: "start",
        }}
      >
        <ErrorBoundary label="Field Activity">
          <FieldActivitySection
            dailyLogs={dailyLogs}
            photos={photos}
            punchlistItems={punchlistItems}
            inspections={inspections}
            safetyIncidents={safetyIncidents}
            qualityRecords={qualityRecords}
            onNavigate={onNavigate}
          />
        </ErrorBoundary>
        <ErrorBoundary label="Team & Workflow">
          <TeamWorkflowSection
            project={project}
            actionItems={actionItems}
            scheduleTasks={scheduleTasks}
            onNavigate={onNavigate}
          />
        </ErrorBoundary>
      </div>
    </div>
  );
}
