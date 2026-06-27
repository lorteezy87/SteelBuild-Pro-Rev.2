// @vitest-environment jsdom
/**
 * Render smoke test for RfiControlCenter.
 *
 * This is a runtime-crash proxy: it mounts the real component with realistic
 * mock props and asserts three landmark strings are present in the output.
 * It catches bad imports, undefined-access crashes, and hook/context failures
 * that build + typecheck cannot surface.
 *
 * No Supabase, React Router, or React Query context is required — the component
 * is a pure presentational shell that receives all data as props.
 */
import { it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import RfiControlCenter from "../RfiControlCenter";

const RFI_ONE = {
  id: "1",
  rfi_number: "RFI #001",
  title: "Base plate elevation",
  status: "Open",
  priority: "Critical",
  discipline: "Structural",
  ball_in_court: "Engineer",
  submitted_date: "2026-06-01",
  date_required: "2026-06-10",
  cost_impact: true,
  cost_impact_amount: 5000,
} as const;

const RFI_TWO = {
  id: "2",
  rfi_number: "RFI #002",
  title: "Stair stringer",
  status: "Answered",
  priority: "Low",
  discipline: "Misc Metals",
  ball_in_court: "GC",
  submitted_date: "2026-05-01",
  date_answered: "2026-05-10",
} as const;

const RFIS = [RFI_ONE, RFI_TWO];

it("renders without crashing and shows key landmark text", () => {
  render(
    <RfiControlCenter
      projectName="Test Project"
      rfis={RFIS}
      filtered={RFIS}
      search=""
      onSearch={() => {}}
      disciplineFilter="All"
      onDisciplineChange={() => {}}
      onFilterChange={() => {}}
      onOpenRfi={() => {}}
      onExport={() => {}}
      onCreate={null}
      projectHealth="On Track"
      percentComplete={42}
    />,
  );

  // Page title
  expect(screen.getByText("RFI Control Center")).toBeTruthy();
  // KPI cell rendered by KpiStrip
  expect(screen.getByText("Need Action")).toBeTruthy();
  // DecisionPanel title for the work queue
  expect(screen.getByText("RFI Work Queue")).toBeTruthy();
  // New hero stat card + table column from wave 1
  expect(screen.getByText("Project Health")).toBeTruthy();
  expect(screen.getByText("Impact")).toBeTruthy();
});
