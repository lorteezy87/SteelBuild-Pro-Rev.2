// @vitest-environment jsdom
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CanonicalReleaseGate } from "@/lib/pieceControl/releaseRepository";
import { buildFabReleaseMetrics } from "../analytics";
import FabReleaseControlCenter, { type FabReleaseControlCenterProps } from "../FabReleaseControlCenter";
import { applyCanonicalGateReadout, workPackageReleaseGateUrl } from "../fabReleaseControlCenter.derive";
import type { EnrichedWorkPackage } from "../types";

vi.mock("@/components/command", () => ({
  useCommandSkin: (): void => undefined,
  PageHeader: ({ title, meta, actions }: { title: string; meta: string; actions: ReactNode }) => (
    <header><h1>{title}</h1><div>{meta}</div>{actions}</header>
  ),
  OperationalSummary: ({ metrics }: { metrics: Array<{ label: string; value: string | number }> }) => (
    <div>{metrics.map((metric) => <span key={metric.label}>{metric.label}: {metric.value}</span>)}</div>
  ),
  AttentionQueue: ({ items }: { items: Array<{ id: string; issue: string; risk: string; nextAction: string; onOpen: () => void }> }) => (
    <div>{items.map((item) => (
      <button key={item.id} type="button" onClick={item.onOpen}>
        {item.issue} {item.risk} {item.nextAction}
      </button>
    ))}</div>
  ),
  StatusBadge: ({ label }: { label: string }) => <span>{label}</span>,
}));

afterEach(cleanup);

describe("Fab Release Control Center server gate", () => {
  it("shows a high-scoring WP as Blocked for drawing and material holds, then opens its exact release tab", () => {
    const projectId = "project-1";
    const packageId = "package-1";
    const advisory = buildFabReleaseMetrics(
      [{
        id: packageId,
        project_id: projectId,
        wp_number: "WP-014",
        phase: "Fabrication",
        status: "Not Started",
        linked_drawing_ids: "drawing-1",
        vif_confirmed: true,
        load_list_complete: true,
        sequence_confirmed: true,
        shop_hours_budget: 100,
        crew: "Shop A",
      }],
      [{ id: "drawing-1", drawing_set_id: "set-1", stage: "IFC", sheet_number: "S-201" }],
      [{ id: "set-1", set_name: "Main steel" }],
    );
    expect(advisory.readyForRelease.map((wp) => wp.id)).toEqual([packageId]);
    expect(advisory.enriched[0]._signals.readinessScore).toBeGreaterThanOrEqual(80);

    const gate: CanonicalReleaseGate = {
      work_package_id: packageId,
      project_id: projectId,
      passes: false,
      already_released: false,
      checks: {
        scope: { passed: true, blockers: [] },
        drawings: { passed: false, blockers: ["S-201 has an active drawing hold"] },
        material: { passed: false, blockers: ["Material requirement is not received"] },
        holds: { passed: true, blockers: [] },
      },
      blockers: ["S-201 has an active drawing hold", "Material requirement is not received"],
      evaluated_at: "2026-10-08T17:00:00Z",
    };
    const metrics = applyCanonicalGateReadout(advisory, projectId, { [packageId]: gate }, true);
    let openedUrl = "";
    render(
      <FabReleaseControlCenter
        projectName="Test project"
        metrics={metrics}
        stageFilter="all"
        onStageFilter={() => undefined}
        riskFilter="all"
        onRiskFilter={() => undefined}
        onOpenWP={() => undefined}
        onOpenGate={(wp: EnrichedWorkPackage) => { openedUrl = workPackageReleaseGateUrl(wp, projectId); }}
        gateRefreshing={false}
        unavailableGateCount={0}
        refreshRequiredCount={0}
        deferredGateCount={0}
        verificationDisabled={false}
        onRefreshGates={() => undefined}
        toolbar={null}
      />,
    );

    expect(screen.getByText(/1 package · 0 released · 1 blocked · 0 unverified/)).toBeTruthy();
    expect(screen.getByText("Ready to Release: 0")).toBeTruthy();
    expect(screen.queryByText("Release verified")).toBeNull();
    const blockerAction = screen.getByRole("button", { name: /WP-014.*S-201 has an active drawing hold.*Material requirement is not received.*Review release checks/ });
    fireEvent.click(blockerAction);
    expect(openedUrl).toBe("/WorkPackages?project=project-1&id=package-1&tab=release-gate");
  });

  it("explains a failed check and a project with Piece Control off without showing Ready", () => {
    const metrics = applyCanonicalGateReadout(
      buildFabReleaseMetrics([{ id: "package-2", project_id: "project-1", wp_number: "WP-015", phase: "Fabrication" }], [], []),
      "project-1", { "package-2": null }, true,
    );
    const baseProps: Omit<FabReleaseControlCenterProps, "unavailableGateCount" | "verificationDisabled"> = {
      projectName: "Test project",
      metrics,
      stageFilter: "all",
      onStageFilter: () => undefined,
      riskFilter: "all",
      onRiskFilter: () => undefined,
      onOpenWP: () => undefined,
      onOpenGate: () => undefined,
      gateRefreshing: false,
      refreshRequiredCount: 0,
      deferredGateCount: 0,
      onRefreshGates: () => undefined,
      toolbar: null,
    };
    const result = render(<FabReleaseControlCenter {...baseProps} unavailableGateCount={1} verificationDisabled={false} />);
    expect(screen.getByRole("alert").textContent).toContain("1 release check is unavailable");
    expect(screen.getByText("Ready to Release: 0")).toBeTruthy();

    result.rerender(<FabReleaseControlCenter {...baseProps} unavailableGateCount={0} verificationDisabled />);
    expect(screen.getByText(/Piece Control is off/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh release checks" }).hasAttribute("disabled")).toBe(true);
  });
});
