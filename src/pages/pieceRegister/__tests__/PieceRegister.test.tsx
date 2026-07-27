// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCanonicalDashboardSnapshot } from "@/lib/pieceControl/canonicalDashboardRepository";
import {
  fetchPieceImportBatches,
  fetchPieceImportRows,
  fetchPieceRegister,
} from "@/lib/pieceControl/repository";
import PieceRegister from "../../PieceRegister";

const projectContext = vi.hoisted(() => ({
  mode: "shadow",
}));

vi.mock("@/components/shared/ProjectContext", () => ({
  useProjectContext: () => ({
    activeProject: {
      id: "project-1",
      name: "Mesa Distribution Center",
      piece_control_mode: projectContext.mode,
    },
    updateActiveProject: vi.fn(),
  }),
}));

vi.mock("@/hooks/useProjectRole", () => ({
  roleAtLeast: () => true,
  useProjectRole: () => ({ role: "admin", isLoading: false }),
}));

vi.mock("@/api/supabaseClient", () => ({
  entities: {
    WorkPackage: {
      filter: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock("@/lib/pieceControl/repository", () => ({
  applyPieceImportBatch: vi.fn(),
  archivePieceLots: vi.fn(),
  approvePieceImportBatch: vi.fn(),
  fetchPieceImportBatches: vi.fn().mockResolvedValue([]),
  fetchPieceImportRows: vi.fn().mockResolvedValue([]),
  fetchPieceRegister: vi.fn().mockResolvedValue([]),
  stagePieceImportBatch: vi.fn(),
}));

vi.mock("@/lib/pieceControl/canonicalDashboardRepository", () => ({
  fetchCanonicalDashboardSnapshot: vi.fn(),
}));

function renderPieceRegister() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <PieceRegister />
    </QueryClientProvider>,
  );
}

describe("Piece Register command shell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectContext.mode = "shadow";
    vi.mocked(fetchPieceRegister).mockResolvedValue([]);
    vi.mocked(fetchCanonicalDashboardSnapshot).mockResolvedValue({
      pieces: [],
      workPackages: [],
      stations: [],
      completions: [],
      legacyProduction: [],
    });
  });

  it("shows operational authority and primary navigation", () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <PieceRegister />
      </QueryClientProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "Piece Register" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/existing production records remain authoritative/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Piece Register sections" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Import pieces" }),
    ).toBeInTheDocument();
  });

  it("keeps imports staged behind an explicit review boundary", () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <PieceRegister />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Imports" }));

    expect(screen.getByText("Stage import")).toBeInTheDocument();
    expect(
      screen.getByText(/no direct changes to the active register/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Stage for review" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("option", { name: "Piece Register CSV" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Canonical CSV" }),
    ).not.toBeInTheDocument();
  });

  it("exposes the selected import batch to assistive technology", async () => {
    vi.mocked(fetchPieceImportBatches).mockResolvedValueOnce([
      {
        id: "batch-1",
        project_id: "project-1",
        source_type: "csv",
        source_name: "Site batch",
        status: "pending_review",
        row_count: 2,
        decision_counts: { new: 2 },
        created_at: "2026-07-23T12:00:00.000Z",
        approved_at: null,
        applied_at: null,
        apply_summary: null,
      },
    ]);
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <PieceRegister />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Imports" }));

    expect(
      await screen.findByRole("button", { name: /site batch/i }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("uses friendly Piece Control labels in the setup state", () => {
    projectContext.mode = "off";
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <PieceRegister />
      </QueryClientProvider>,
    );

    expect(screen.getByText("Not set up")).toBeInTheDocument();
    expect(screen.getAllByText(/start in shadow review/i)).toHaveLength(1);
    expect(screen.getByText("Start Shadow review")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Piece Register setup" })).toBeInTheDocument();
    expect(screen.getByText(/move this project from not set up to shadow review/i))
      .toBeInTheDocument();
    expect(screen.queryByText(/controlled mode/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Controlled setup")).not.toBeInTheDocument();
    expect(screen.queryByText(/\bshadow mode\b/i)).not.toBeInTheDocument();
  });

  it("shows honest loading and error states on Overview with retry", async () => {
    let rejectPieces!: (error: Error) => void;
    vi.mocked(fetchPieceRegister)
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectPieces = reject;
          }),
      )
      .mockResolvedValueOnce([]);

    renderPieceRegister();

    expect(screen.getByText("Loading the Piece Register…")).toBeInTheDocument();
    expect(screen.queryByText("Import the first pieces")).not.toBeInTheDocument();

    rejectPieces(new Error("Piece register unavailable"));

    expect(
      await screen.findByText("The Piece Register could not be loaded."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Import the first pieces")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Import the first pieces")).toBeInTheDocument();
    expect(fetchPieceRegister).toHaveBeenCalledTimes(2);
  });

  it("shows work-package readiness and upcoming shipments in a populated Overview", async () => {
    vi.mocked(fetchPieceRegister).mockResolvedValue([
      {
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
        lifecycle_status: "fabricated",
        current_station: null,
        on_hold: false,
        is_container: false,
        is_deleted: false,
        source_system: "manual",
        external_ref: null,
        metadata: null,
        updated_at: "2026-07-23T12:00:00.000Z",
        deleted_at: null,
      },
    ]);
    vi.mocked(fetchCanonicalDashboardSnapshot).mockResolvedValue({
      pieces: [
        {
          id: "piece-1",
          project_id: "project-1",
          parent_piece_id: null,
          work_package_id: "wp-1",
          quantity: 2,
          weight_each_lbs: 500,
          weight_total_lbs: 1000,
          lifecycle_status: "fabricated",
          current_station: null,
          on_hold: false,
          is_container: false,
          is_deleted: false,
          deleted_at: null,
        },
      ],
      workPackages: [
        {
          id: "wp-1",
          project_id: "project-1",
          wp_number: "WP-001",
          name: "North framing",
          planned_ship_date: "2026-08-01",
          metadata: {},
        },
      ],
      stations: [],
      completions: [],
      legacyProduction: [],
    });

    renderPieceRegister();

    expect(
      await screen.findByRole("heading", { name: "Work-package readiness" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Upcoming shipments" }),
    ).toBeInTheDocument();
    expect((await screen.findAllByText("WP-001")).length).toBeGreaterThan(0);
    expect(screen.getByText("Aug 1, 2026")).toBeInTheDocument();
  });

  it("opens Logistics from the no-upcoming-shipments state", async () => {
    vi.mocked(fetchPieceRegister).mockResolvedValue([
      {
        id: "piece-1",
        project_id: "project-1",
        piece_mark: "B1",
        normalized_piece_mark: "B1",
        lot_code: "A",
        parent_piece_id: null,
        quantity: 1,
        profile: "W12x26",
        material_grade: "A992",
        weight_each_lbs: 500,
        weight_total_lbs: 500,
        work_package_id: "wp-1",
        lifecycle_status: "fabricated",
        current_station: null,
        on_hold: false,
        is_container: false,
        is_deleted: false,
        source_system: "manual",
        external_ref: null,
        metadata: null,
        updated_at: "2026-07-23T12:00:00.000Z",
        deleted_at: null,
      },
    ]);
    vi.mocked(fetchCanonicalDashboardSnapshot).mockResolvedValue({
      pieces: [],
      workPackages: [],
      stations: [],
      completions: [],
      legacyProduction: [],
    });

    renderPieceRegister();

    fireEvent.click(
      await screen.findByRole("button", { name: "Open Logistics" }),
    );

    expect(
      screen.getByRole("button", { name: "Logistics" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("maps internal import reconciliation warnings to operational copy", async () => {
    vi.mocked(fetchPieceImportBatches).mockResolvedValueOnce([
      {
        id: "batch-1",
        project_id: "project-1",
        source_type: "csv",
        source_name: "Split lot review",
        status: "pending_review",
        row_count: 1,
        decision_counts: { conflict: 1 },
        created_at: "2026-07-23T12:00:00.000Z",
        approved_at: null,
        applied_at: null,
        apply_summary: null,
      },
    ]);
    vi.mocked(fetchPieceImportRows).mockResolvedValueOnce([
      {
        id: "row-1",
        source_row_number: 1,
        normalized_payload: {
          piece_mark: "B1",
          profile: "W12x26",
          material_grade: "A992",
        },
        decision: "conflict",
        warnings: ["mark has split lots but no active ALL root"],
        resolution: null,
        matched_piece_id: null,
      },
    ]);

    renderPieceRegister();
    fireEvent.click(screen.getByRole("button", { name: "Imports" }));

    expect(
      await screen.findByText(
        "This piece mark has split lots but no active parent record.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/active ALL root/i)).not.toBeInTheDocument();
  });

  it("sorts register filter options in natural construction order", async () => {
    vi.mocked(fetchPieceRegister).mockResolvedValue([
      {
        id: "piece-10",
        project_id: "project-1",
        piece_mark: "B10",
        normalized_piece_mark: "B10",
        lot_code: "ALL",
        parent_piece_id: null,
        quantity: 1,
        profile: "B-10",
        material_grade: "A992",
        weight_each_lbs: 100,
        weight_total_lbs: 100,
        work_package_id: null,
        lifecycle_status: "not_started",
        current_station: null,
        on_hold: false,
        is_container: false,
        is_deleted: false,
        source_system: "manual",
        external_ref: null,
        metadata: null,
        updated_at: "2026-07-23T12:00:00.000Z",
        deleted_at: null,
      },
      {
        id: "piece-2",
        project_id: "project-1",
        piece_mark: "B2",
        normalized_piece_mark: "B2",
        lot_code: "ALL",
        parent_piece_id: null,
        quantity: 1,
        profile: "B-2",
        material_grade: "A992",
        weight_each_lbs: 100,
        weight_total_lbs: 100,
        work_package_id: null,
        lifecycle_status: "not_started",
        current_station: null,
        on_hold: false,
        is_container: false,
        is_deleted: false,
        source_system: "manual",
        external_ref: null,
        metadata: null,
        updated_at: "2026-07-23T12:00:00.000Z",
        deleted_at: null,
      },
    ]);

    renderPieceRegister();
    fireEvent.click(screen.getByRole("button", { name: "Register" }));

    const profileFilter = await screen.findByLabelText("Profile");
    await screen.findByRole("option", { name: "B-10" });
    expect(
      Array.from((profileFilter as HTMLSelectElement).options).map(
        (option) => option.text,
      ),
    ).toEqual(["All", "B-2", "B-10"]);
  });
});
