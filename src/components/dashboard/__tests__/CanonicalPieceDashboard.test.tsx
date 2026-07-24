// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { fetchSnapshot } = vi.hoisted(() => ({
  fetchSnapshot: vi.fn(),
}));

vi.mock("@/lib/pieceControl/canonicalDashboardRepository", () => ({
  fetchCanonicalDashboardSnapshot: (...args: unknown[]) => fetchSnapshot(...args),
}));

vi.mock("@/hooks/useCanonicalReportingRealtime", () => ({
  useCanonicalReportingRealtime: vi.fn(),
}));

import CanonicalPieceDashboard from "../CanonicalPieceDashboard";

const snapshot = {
  pieces: [
    {
      id: "piece-1",
      project_id: "project-1",
      parent_piece_id: null as string | null,
      work_package_id: "wp-1",
      quantity: 2,
      weight_each_lbs: 1000,
      weight_total_lbs: 2000,
      lifecycle_status: "erected",
      current_station: null as string | null,
      on_hold: false,
      is_container: false,
      is_deleted: false,
      deleted_at: null as string | null,
    },
    {
      id: "piece-2",
      project_id: "project-1",
      parent_piece_id: null as string | null,
      work_package_id: "wp-1",
      quantity: 3,
      weight_each_lbs: 500,
      weight_total_lbs: 1500,
      lifecycle_status: "in_fabrication",
      current_station: "weld",
      on_hold: false,
      is_container: false,
      is_deleted: false,
      deleted_at: null as string | null,
    },
    {
      id: "piece-3",
      project_id: "project-1",
      parent_piece_id: null as string | null,
      work_package_id: "wp-2",
      quantity: 1,
      weight_each_lbs: null as number | null,
      weight_total_lbs: null as number | null,
      lifecycle_status: "not_started",
      current_station: null as string | null,
      on_hold: false,
      is_container: false,
      is_deleted: false,
      deleted_at: null as string | null,
    },
  ],
  workPackages: [
    {
      id: "wp-1",
      project_id: "project-1",
      wp_number: "WP-001",
      name: "Main framing",
      planned_ship_date: "2026-08-05",
      is_deleted: false,
      deleted_at: null as string | null,
    },
    {
      id: "wp-2",
      project_id: "project-1",
      wp_number: "WP-002",
      name: "Stairs",
      is_deleted: false,
      deleted_at: null as string | null,
    },
  ],
  stations: [
    {
      id: "station-1",
      project_id: "project-1",
      station_key: "weld",
      station_name: "Weld",
      earned_percent: 50,
      sort_order: 1,
      is_active: true,
    },
  ],
  completions: [
    {
      id: "completion-1",
      project_id: "project-1",
      piece_id: "piece-2",
      station_configuration_id: "station-1",
      station_key: "weld",
      station_name: "Weld",
      sort_order: 1,
      earned_percent: 50,
      completed_at: "2026-07-23T18:00:00Z",
      completed_by: "user-1",
      is_override: false,
      override_reason: null as string | null,
      inherited_from_completion_id: null as string | null,
    },
  ],
  legacyProduction: [
    {
      id: "legacy-1",
      quantity: 5,
      weight: 700,
      status: "In Fabrication",
      ship_date: null as string | null,
    },
  ],
};

function renderDashboard(onOpenRegister = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });

  const result = render(
    <QueryClientProvider client={queryClient}>
      <div data-skin="command">
        <CanonicalPieceDashboard
          project={{ id: "project-1", piece_control_mode: "live" }}
          onOpenRegister={onOpenRegister}
        />
      </div>
    </QueryClientProvider>,
  );

  return { ...result, onOpenRegister };
}

describe("CanonicalPieceDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchSnapshot.mockResolvedValue(snapshot);
  });

  afterEach(cleanup);

  it("renders canonical reporting in the dashboard Command UI and opens the register", async () => {
    const user = userEvent.setup();
    const { container, onOpenRegister } = renderDashboard();

    expect(await screen.findByRole("heading", { name: "Piece Register" })).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("WP-001")).toBeInTheDocument();
    expect(container.querySelector(".cmd-panel")).not.toBeNull();
    expect(container.querySelector(".cmd-kpi-strip")).not.toBeNull();
    expect(container.querySelector(".cmd-table")).not.toBeNull();
    expect(container.querySelector(".rounded-2xl")).toBeNull();
    expect(screen.queryByText("Canonical Piece Control")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "View all" }));
    expect(onOpenRegister).toHaveBeenCalledOnce();
  });

  it("stays hidden while Piece Control is off", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <CanonicalPieceDashboard
          project={{ id: "project-1", piece_control_mode: "off" }}
          onOpenRegister={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(container).toBeEmptyDOMElement();
    expect(fetchSnapshot).not.toHaveBeenCalled();
  });
});
