// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import {
  advancePieceStation,
  fetchProductionSnapshot,
  splitPieceLot,
  type ProductionSnapshot,
} from "@/lib/pieceControl/productionRepository";
import { PieceProductionControl } from "../PieceProductionControl";

vi.mock("@/lib/pieceControl/productionRepository", () => ({
  advancePieceStation: vi.fn(),
  fetchProductionSnapshot: vi.fn(),
  splitPieceLot: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const piece: ProductionSnapshot["pieces"][number] = {
  id: "piece-1",
  project_id: "project-1",
  piece_mark: "B1",
  normalized_piece_mark: "B1",
  lot_code: "A",
  parent_piece_id: null,
  quantity: 2,
  profile: "W12x26",
  material_grade: "A992",
  weight_each_lbs: 500,
  weight_total_lbs: 1000,
  work_package_id: "wp-1",
  lifecycle_status: "in_fabrication",
  current_station: null,
  on_hold: false,
  is_container: false,
  is_deleted: false,
  source_system: "manual",
  external_ref: null,
  metadata: null,
  updated_at: "2026-07-23T12:00:00.000Z",
  deleted_at: null,
};

const stations: ProductionSnapshot["stations"] = [
  {
    id: "station-cut",
    project_id: "project-1",
    station_key: "cut",
    station_name: "Cut",
    sort_order: 1,
    earned_percent: 40,
    is_active: true,
  },
  {
    id: "station-fit",
    project_id: "project-1",
    station_key: "fit",
    station_name: "Fit",
    sort_order: 2,
    earned_percent: 60,
    is_active: true,
  },
];

const snapshot: ProductionSnapshot = {
  pieces: [piece],
  stations,
  completions: [],
  canonicalReleaseWorkPackageIds: ["wp-1"],
};

function renderControl(
  productionSnapshot: ProductionSnapshot | null = snapshot,
  pieceControlMode = "shadow",
) {
  if (productionSnapshot) {
    vi.mocked(fetchProductionSnapshot).mockResolvedValue(productionSnapshot);
  }
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={client}>
      <PieceProductionControl
        projectId="project-1"
        pieceControlMode={pieceControlMode}
      />
    </QueryClientProvider>,
  );
}

describe("PieceProductionControl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(advancePieceStation).mockResolvedValue(undefined);
    vi.mocked(splitPieceLot).mockResolvedValue(undefined);
  });

  it("explains controlled physical station transitions and immutable completions", async () => {
    renderControl();

    expect(
      await screen.findByText(/physical station transitions/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/completed events cannot be overridden or reversed/i),
    ).toBeInTheDocument();
  });

  it("keeps override confirmation disabled until its reason is provided", async () => {
    renderControl();

    fireEvent.click(await screen.findByRole("button", { name: /override/i }));

    expect(
      screen.getByRole("button", { name: /confirm override/i }),
    ).toBeDisabled();
  });

  it("gives override and repeated child-lot inputs persistent accessible names", async () => {
    renderControl();

    fireEvent.click(await screen.findByRole("button", { name: /override/i }));

    expect(
      screen.getByRole("textbox", { name: "Override reason" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Child lot 1 code" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("spinbutton", { name: "Child lot 1 quantity" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Child lot 2 code" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("spinbutton", { name: "Child lot 2 quantity" }),
    ).toBeInTheDocument();
  });

  it("exposes the off-state Production title as a heading", () => {
    renderControl(snapshot, "off");

    expect(
      screen.getByRole("heading", { name: "Production", level: 2 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Production stations and lot splitting are unavailable until the Piece Register is set up.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Piece Control is off/i)).not.toBeInTheDocument();
  });

  it("uses work-package language when release is still required", async () => {
    renderControl(
      {
        ...snapshot,
        canonicalReleaseWorkPackageIds: [],
      },
    );

    expect(await screen.findByText("Work-package release required")).toBeInTheDocument();
    expect(screen.queryByText(/Canonical work-package/i)).not.toBeInTheDocument();
  });

  it("uses plain lot terminology", async () => {
    renderControl();

    expect(
      await screen.findByText(
        /creates physical production lots/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/actionable child lots|roll-up containers/i),
    ).not.toBeInTheDocument();
  });

  it("sanitizes production read errors and retries in place", async () => {
    vi.mocked(fetchProductionSnapshot)
      .mockRejectedValueOnce(
        new Error("PGRST301: canonical production scope unavailable"),
      )
      .mockResolvedValueOnce(snapshot);

    renderControl(null);

    expect(
      await screen.findByText("Production data could not be loaded."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/PGRST301|canonical/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText(/physical station transitions/i))
      .toBeInTheDocument();
    expect(fetchProductionSnapshot).toHaveBeenCalledTimes(2);
  });

  it("sanitizes production mutation errors", async () => {
    vi.mocked(advancePieceStation).mockRejectedValue(
      new Error(
        "Work package must have an active canonical release before production can advance",
      ),
    );
    renderControl();

    fireEvent.click(await screen.findByRole("button", { name: "Complete" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Release this work package for fabrication before recording production.",
      ),
    );
    expect(toast.error).not.toHaveBeenCalledWith(
      expect.stringMatching(/canonical/i),
    );
  });
});
