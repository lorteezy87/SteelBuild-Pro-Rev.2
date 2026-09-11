// @vitest-environment jsdom

import { File as NodeFile } from "node:buffer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { entities } from "@/api/supabaseClient";
import type { DrawingImpactRow } from "@/hooks/useDrawingImpacts";
import { supabase } from "@/lib/supabase";
import { fetchCanonicalDashboardSnapshot } from "@/lib/pieceControl/canonicalDashboardRepository";
import { fetchPieceIntelligenceSnapshot } from "@/lib/pieceControl/pieceIntelligenceRepository";
import type { PieceIntelligenceSnapshot } from "@/lib/pieceControl/pieceIntelligenceTypes";
import { setPieceHold } from "@/lib/pieceControl/productionRepository";
import {
  archivePieceLots,
  fetchPieceImportBatches,
  fetchPieceImportRows,
  fetchPieceRegister,
  stagePieceImportBatch,
  type PieceRegisterRow,
} from "@/lib/pieceControl/repository";
import PieceRegister from "../../PieceRegister";

const projectContext = vi.hoisted(() => ({
  mode: "shadow",
  projectId: "project-1" as string | null | undefined,
}));

const projectRole = vi.hoisted(() => ({ current: "admin" }));

const canonicalReleasePanelProps = vi.hoisted(() => ({
  current: null as null | {
    projectId: string;
    workPackageId: string;
    pieceControlMode: string;
  },
}));

const MEMBER_ONE_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_TWO_ID = "22222222-2222-4222-8222-222222222222";

vi.mock("@/components/shared/ProjectContext", () => ({
  useProjectContext: () => ({
    activeProject:
      projectContext.projectId == null
        ? projectContext.projectId
        : {
            id: projectContext.projectId,
            name: "Mesa Distribution Center",
            piece_control_mode: projectContext.mode,
          },
    updateActiveProject: vi.fn(),
  }),
}));

vi.mock("@/hooks/useProjectRole", () => ({
  roleAtLeast: (role: string | null | undefined, minimum: string) => {
    const ranks: Record<string, number> = {
      viewer: 0,
      field: 1,
      pm: 2,
      admin: 3,
      owner: 3,
    };
    return (ranks[role ?? ""] ?? -1) >= (ranks[minimum] ?? Number.POSITIVE_INFINITY);
  },
  useProjectRole: () => ({ role: projectRole.current, isLoading: false }),
}));

vi.mock("@/api/supabaseClient", () => ({
  entities: {
    WorkPackage: {
      filter: vi.fn().mockResolvedValue([
        {
          id: "wp-1",
          wp_number: "WP-001",
          name: "Embeds & Lintels",
          is_deleted: false,
        },
      ]),
    },
    DrawingImpact: {
      create: vi.fn(),
      update: vi.fn(),
    },
    UserProject: {
      filter: vi.fn(),
    },
    User: {
      filter: vi.fn(),
    },
  },
}));

vi.mock("@/lib/supabase", () => {
  // Realtime subscription (useCanonicalReportingRealtime) needs a channel stub.
  const channel = { on: vi.fn(), subscribe: vi.fn() };
  channel.on.mockReturnValue(channel);
  return {
    supabase: {
      rpc: vi.fn(),
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    },
  };
});

vi.mock("@/lib/pieceControl/productionRepository", () => ({
  setPieceHold: vi.fn(),
}));

vi.mock("@/components/pieceControl/CanonicalFabReleasePanel", () => ({
  default: (props: {
    projectId: string;
    workPackageId: string;
    pieceControlMode: string;
  }) => {
    canonicalReleasePanelProps.current = props;
    return <div data-testid="canonical-release-panel">Canonical release owner</div>;
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
  },
}));

vi.mock("@/lib/pieceControl/relationshipsRepository", () => ({
  assignPiecesToWorkPackage: vi.fn(),
  fetchPieceRelationshipSnapshot: vi.fn().mockResolvedValue({
    pieces: [],
    pieceDrawings: [],
    drawings: [],
    workPackages: [],
    drawingSets: [],
    submittals: [],
    sheetResponses: [],
    drawingRevisions: [],
    drawingReviews: [],
    drawingSignoffs: [],
    commentDispositions: [],
  }),
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

vi.mock("@/lib/pieceControl/pieceIntelligenceRepository", () => ({
  fetchPieceIntelligenceSnapshot: vi.fn(),
}));

function pieceRegisterRow(id: string, projectId = "project-1"): PieceRegisterRow {
  return {
    id,
    project_id: projectId,
    piece_mark: id.toUpperCase(),
    normalized_piece_mark: id.toUpperCase(),
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
    updated_at: "2026-08-09T12:00:00.000Z",
    deleted_at: null,
  };
}

function intelligenceSnapshot(
  pieceId = "p1",
  projectId = "project-1",
): PieceIntelligenceSnapshot {
  const piece = pieceRegisterRow(pieceId, projectId);
  return {
    pieces: [piece],
    pieceDrawings: [],
    pieceDrawingSets: [
      { project_id: projectId, piece_id: pieceId, drawing_set_id: "set-1" },
    ],
    drawings: [
      {
        id: "drawing-1",
        project_id: projectId,
        drawing_set_id: "set-1",
        sheet_number: "E502",
        title: "Framing",
      },
    ],
    workPackages: [
      {
        id: "wp-1",
        project_id: projectId,
        wp_number: "WP-001",
        sequence_number: "1",
        scheduled_start_date: "2026-08-20",
      },
    ],
    drawingSets: [{ id: "set-1", set_name: "Building 2" }],
    submittals: [],
    sheetResponses: [],
    drawingRevisions: [
      {
        id: "r4",
        drawing_id: "drawing-1",
        is_current: true,
        archived_at: null,
        revision_code: "4",
      },
    ],
    drawingReviews: [],
    drawingSignoffs: [],
    commentDispositions: [],
    sourceAvailability: {
      pieceDrawings: "available",
      pieceDrawingSets: "available",
      drawings: "available",
      drawingSets: "available",
      revisions: "available",
      approvals: "available",
    },
    drawingImpacts: [],
    rfis: [],
    pieceEvents: [],
    availability: {
      relationships: "available",
      approvals: "available",
      impacts: "available",
      rfis: "available",
      events: "available",
    },
  };
}

function drawingImpactRow(
  patch: Partial<DrawingImpactRow> = {},
): DrawingImpactRow {
  return {
    id: "impact-1",
    project_id: "project-1",
    drawing_revision_id: "r4",
    impact_type: "fabrication",
    status: "in_review",
    priority: "medium",
    title: "Review revised connection",
    notes: "Coordinate with the shop",
    assigned_to: MEMBER_ONE_ID,
    due_date: "2026-08-18",
    resolved_at: null,
    created_at: "2026-08-09T12:00:00.000Z",
    sheet_number: "E502",
    sheet_title: "Framing",
    revision_code: "4",
    ...patch,
  };
}

function seedRevisionWithPiece(options: {
  onHold?: boolean;
  impacts?: ReturnType<typeof drawingImpactRow>[];
} = {}) {
  const piece = {
    ...pieceRegisterRow("p1"),
    on_hold: options.onHold ?? false,
    on_hold_reason: options.onHold ? "Existing coordination hold" : null,
  };
  const snapshot = intelligenceSnapshot();
  snapshot.pieces = [piece];
  snapshot.drawingImpacts = options.impacts ?? [];
  vi.mocked(fetchPieceRegister).mockResolvedValue([piece]);
  vi.mocked(fetchPieceIntelligenceSnapshot).mockResolvedValue(
    snapshot as Awaited<ReturnType<typeof fetchPieceIntelligenceSnapshot>>,
  );
}

function intelligenceSnapshotWithRelationshipRepair() {
  const snapshot = intelligenceSnapshot();
  snapshot.drawings.push({
    id: "drawing-2",
    project_id: "project-1",
    drawing_set_id: "set-2",
    sheet_number: "E503",
    title: "Canopy framing",
  });
  snapshot.drawingSets.push({ id: "set-2", set_name: "Canopy" });
  snapshot.drawingRevisions.push({
    id: "r5",
    drawing_id: "drawing-2",
    is_current: true,
    archived_at: null as string | null,
    revision_code: "5",
  });
  return snapshot;
}

function lifecycleRiskIntelligenceSnapshot() {
  const lifecycleRows = [
    ["low", "not_started", "A100"],
    ["fabricated", "fabricated", "A200"],
    ["shipped", "shipped", "Z300"],
    ["delivered", "delivered", "Z400"],
    ["erected", "erected", "Z500"],
  ] as const;
  const snapshot = intelligenceSnapshot();
  snapshot.pieces = lifecycleRows.map(([id, lifecycle]) => ({
    ...pieceRegisterRow(id),
    lifecycle_status: lifecycle,
  }));
  snapshot.pieceDrawingSets = lifecycleRows.map(([id]) => ({
    project_id: "project-1",
    piece_id: id,
    drawing_set_id: `set-${id}`,
  }));
  snapshot.drawings = lifecycleRows.map(([id, , sheetNumber]) => ({
    id: `drawing-${id}`,
    project_id: "project-1",
    drawing_set_id: `set-${id}`,
    sheet_number: sheetNumber,
    title: id,
  }));
  snapshot.drawingSets = lifecycleRows.map(([id]) => ({
    id: `set-${id}`,
    set_name: id,
  }));
  snapshot.drawingRevisions = lifecycleRows.map(([id]) => ({
    id: `revision-${id}`,
    drawing_id: `drawing-${id}`,
    is_current: true,
    archived_at: null as string | null,
    revision_code: "1",
  }));
  return snapshot;
}

function SearchStateProbe() {
  return <output data-testid="piece-register-search">{useLocation().search}</output>;
}

function renderPieceRegister(initialEntry = "/PieceRegister") {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const createTree = () => (
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={queryClient}>
        <PieceRegister />
        <SearchStateProbe />
      </QueryClientProvider>
    </MemoryRouter>
  );
  const rendered = render(createTree());

  return {
    ...rendered,
    queryClient,
    rerenderPieceRegister: () => rendered.rerender(createTree()),
  };
}

describe("Piece Register command shell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectContext.mode = "shadow";
    projectContext.projectId = "project-1";
    projectRole.current = "admin";
    canonicalReleasePanelProps.current = null;
    vi.mocked(setPieceHold).mockResolvedValue(undefined);
    vi.mocked(entities.DrawingImpact.create).mockResolvedValue({} as never);
    vi.mocked(entities.DrawingImpact.update).mockResolvedValue({} as never);
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [
        {
          user_id: MEMBER_ONE_ID,
          display_name: "Alex Rivera",
          project_role: "pm",
        },
        {
          user_id: MEMBER_TWO_ID,
          display_name: "sam@example.com",
          project_role: "field",
        },
      ],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    } as never);
    vi.mocked(entities.UserProject.filter).mockResolvedValue([
      {
        id: "membership-1",
        project_id: "project-1",
        user_id: MEMBER_ONE_ID,
        role: "pm",
        created_at: "2026-08-01T12:00:00.000Z",
      },
      {
        id: "membership-2",
        project_id: "project-1",
        user_id: MEMBER_TWO_ID,
        role: "field",
        created_at: "2026-08-02T12:00:00.000Z",
      },
    ] as never);
    vi.mocked(entities.User.filter).mockResolvedValue([
      {
        id: MEMBER_ONE_ID,
        full_name: "Alex Rivera",
        email: "alex@example.com",
      },
      {
        id: MEMBER_TWO_ID,
        full_name: null,
        email: "sam@example.com",
      },
    ] as never);
    vi.mocked(fetchPieceRegister).mockResolvedValue([]);
    vi.mocked(fetchCanonicalDashboardSnapshot).mockResolvedValue({
      pieces: [],
      workPackages: [],
      stations: [],
      completions: [],
      legacyProduction: [],
    });
    vi.mocked(fetchPieceIntelligenceSnapshot).mockResolvedValue(
      intelligenceSnapshot() as Awaited<ReturnType<typeof fetchPieceIntelligenceSnapshot>>,
    );
  });

  it("shows operational authority and primary navigation", () => {
    renderPieceRegister();

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
    renderPieceRegister();

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
    renderPieceRegister();

    fireEvent.click(screen.getByRole("button", { name: "Imports" }));

    expect(
      await screen.findByRole("button", { name: /site batch/i }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("uses friendly Piece Control labels in the setup state", () => {
    projectContext.mode = "off";
    renderPieceRegister();

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

  it("opens the Revision Impact workspace from a direct URL", () => {
    renderPieceRegister("/PieceRegister?view=impact&revision=r4");

    expect(
      screen.getByRole("button", { name: "Revision Impact" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("region", { name: "Revision Impact workspace" }),
    ).toBeInTheDocument();
  });

  it("preserves direct piece selection intent in the Impact workspace", async () => {
    vi.mocked(fetchPieceRegister).mockResolvedValue([
      pieceRegisterRow("p1"),
    ]);

    renderPieceRegister("/PieceRegister?view=impact&piece=p1");

    expect(await screen.findByLabelText("Piece digital thread")).toBeInTheDocument();
  });

  it("places a selected affected piece on hold through the canonical RPC wrapper", async () => {
    const user = userEvent.setup();
    seedRevisionWithPiece();
    const { queryClient } = renderPieceRegister(
      "/PieceRegister?view=impact&revision=r4&piece=p1&embed=1",
    );
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    await user.click(await screen.findByRole("button", { name: "Place hold" }));
    await user.type(
      screen.getByLabelText("Hold reason"),
      "Revision 4 connection change",
    );
    await user.click(screen.getByRole("button", { name: "Confirm hold" }));

    await waitFor(() =>
      expect(setPieceHold).toHaveBeenCalledWith(
        "project-1",
        ["p1"],
        true,
        "Revision 4 connection change",
      ),
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["piece-intelligence", "project-1"],
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["drawing-impacts", "project-1"],
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["canonical-release-gate"],
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["canonical-reporting", "project-1"],
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["canonical-pieces-3d", "project-1"],
    });
    expect(toast.success).toHaveBeenCalledWith("Piece hold applied");
  });

  it("requires a nonblank reason and Cancel never writes a piece hold", async () => {
    const user = userEvent.setup();
    seedRevisionWithPiece();
    renderPieceRegister("/PieceRegister?view=impact&revision=r4&piece=p1");

    await user.click(await screen.findByRole("button", { name: "Place hold" }));
    const confirm = screen.getByRole("button", { name: "Confirm hold" });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText("Hold reason"), "   ");
    expect(confirm).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Cancel hold" }));

    expect(setPieceHold).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Hold reason")).not.toBeInTheDocument();
  });

  it("clears a selected piece hold with a nonblank reason", async () => {
    const user = userEvent.setup();
    seedRevisionWithPiece({ onHold: true });
    renderPieceRegister("/PieceRegister?view=impact&revision=r4&piece=p1");

    await user.click(await screen.findByRole("button", { name: "Clear hold" }));
    await user.type(screen.getByLabelText("Hold reason"), "Revision reviewed");
    await user.click(screen.getByRole("button", { name: "Confirm clear hold" }));

    await waitFor(() =>
      expect(setPieceHold).toHaveBeenCalledWith(
        "project-1",
        ["p1"],
        false,
        "Revision reviewed",
      ),
    );
    expect(toast.success).toHaveBeenCalledWith("Piece hold cleared");
  });

  it.each([
    { role: "viewer", holdVisible: false, impactVisible: false, releaseVisible: false },
    { role: "field", holdVisible: true, impactVisible: false, releaseVisible: false },
    { role: "pm", holdVisible: true, impactVisible: true, releaseVisible: true },
  ])(
    "enforces the viewer, field, and PM protected-action boundary for $role",
    async ({ role, holdVisible, impactVisible, releaseVisible }) => {
      projectRole.current = role;
      seedRevisionWithPiece();
      renderPieceRegister("/PieceRegister?view=impact&revision=r4&piece=p1");

      expect(await screen.findByLabelText("Piece digital thread")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Place hold" }) !== null)
        .toBe(holdVisible);
      expect(screen.queryByRole("button", { name: "Add drawing impact" }) !== null)
        .toBe(impactVisible);
      expect(screen.queryByRole("button", { name: "Open fabrication release" }) !== null)
        .toBe(releaseVisible);
      if (impactVisible) {
        await waitFor(() =>
          expect(supabase.rpc).toHaveBeenCalledWith(
            "list_drawing_impact_assignees",
            { p_project_id: "project-1" },
          ),
        );
      } else {
        expect(supabase.rpc).not.toHaveBeenCalled();
        expect(entities.UserProject.filter).not.toHaveBeenCalled();
        expect(entities.User.filter).not.toHaveBeenCalled();
      }
    },
  );

  it.each(["viewer", "field"])(
    "does not expose or mount fabrication release for a %s direct Board URL",
    async (role) => {
      projectRole.current = role;
      seedRevisionWithPiece();

      renderPieceRegister("/PieceRegister?view=board&focus=release&piece=p1");

      expect(await screen.findByTestId("package-board")).toBeInTheDocument();
      await waitFor(() => expect(fetchPieceRegister).toHaveBeenCalledWith("project-1"));
      expect(screen.queryByRole("button", { name: "Open fabrication release" }))
        .not.toBeInTheDocument();
      expect(screen.queryByTestId("canonical-release-panel")).not.toBeInTheDocument();
    },
  );

  it("mounts the canonical release authority for a PM direct Board URL", async () => {
    projectRole.current = "pm";
    seedRevisionWithPiece();

    renderPieceRegister("/PieceRegister?view=board&focus=release&piece=p1");

    expect(await screen.findByTestId("canonical-release-panel")).toBeInTheDocument();
    expect(canonicalReleasePanelProps.current).toEqual({
      projectId: "project-1",
      workPackageId: "wp-1",
      pieceControlMode: "shadow",
    });
  });

  it("resets an unfinished hold editor when the selected thread piece changes", async () => {
    const user = userEvent.setup();
    const firstPiece = pieceRegisterRow("p1");
    const secondPiece = pieceRegisterRow("p2");
    const snapshot = intelligenceSnapshot();
    snapshot.pieces = [firstPiece, secondPiece];
    snapshot.pieceDrawingSets = [
      { project_id: "project-1", piece_id: "p1", drawing_set_id: "set-1" },
      { project_id: "project-1", piece_id: "p2", drawing_set_id: "set-1" },
    ];
    vi.mocked(fetchPieceRegister).mockResolvedValue([firstPiece, secondPiece]);
    vi.mocked(fetchPieceIntelligenceSnapshot).mockResolvedValue(snapshot);
    renderPieceRegister("/PieceRegister?view=impact&revision=r4&piece=p1");

    await user.click(await screen.findByRole("button", { name: "Place hold" }));
    await user.type(screen.getByLabelText("Hold reason"), "Only applies to P1");
    await user.click(screen.getByRole("button", { name: /open P2 · A digital thread/i }));

    await waitFor(() =>
      expect(screen.queryByLabelText("Hold reason")).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Place hold" }));
    expect(screen.getByLabelText("Hold reason")).toHaveValue("");
    expect(setPieceHold).not.toHaveBeenCalled();
  });

  it("creates a scoped drawing impact for the selected current revision", async () => {
    const user = userEvent.setup();
    projectRole.current = "pm";
    seedRevisionWithPiece();
    renderPieceRegister("/PieceRegister?view=impact&revision=r4&piece=p1");

    await user.click(await screen.findByRole("button", { name: "Add drawing impact" }));
    expect(screen.queryByLabelText("Impact status")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Impact type"), "connections");
    await user.selectOptions(screen.getByLabelText("Priority"), "high");
    await user.selectOptions(screen.getByLabelText("Assigned to"), MEMBER_TWO_ID);
    await user.type(screen.getByLabelText("Due date"), "2026-08-22");
    await user.type(screen.getByLabelText("Impact title"), "Verify revised shear tab");
    await user.type(screen.getByLabelText("Impact notes"), "Hold shop welding pending review");
    await user.click(screen.getByRole("button", { name: "Save impact" }));

    await waitFor(() =>
      expect(entities.DrawingImpact.create).toHaveBeenCalledWith({
        project_id: "project-1",
        drawing_revision_id: "r4",
        impact_type: "connections",
        status: "open",
        priority: "high",
        assigned_to: MEMBER_TWO_ID,
        due_date: "2026-08-22",
        title: "Verify revised shear tab",
        notes: "Hold shop welding pending review",
      }),
    );
    expect(supabase.rpc).toHaveBeenCalledWith(
      "list_drawing_impact_assignees",
      { p_project_id: "project-1" },
    );
    expect(entities.UserProject.filter).not.toHaveBeenCalled();
    expect(entities.User.filter).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Drawing impact created");
  });

  it("shows project-member loading and empty states without accepting free text", async () => {
    const user = userEvent.setup();
    let releaseAssignees!: (value: {
      data: [];
      error: null;
      count: null;
      status: 200;
      statusText: "OK";
    }) => void;
    vi.mocked(supabase.rpc).mockImplementationOnce(
      () => new Promise((resolve) => { releaseAssignees = resolve; }) as never,
    );
    seedRevisionWithPiece();
    renderPieceRegister("/PieceRegister?view=impact&revision=r4&piece=p1");

    await user.click(await screen.findByRole("button", { name: "Add drawing impact" }));
    const assignee = screen.getByLabelText("Assigned to");
    expect(assignee).toBeInstanceOf(HTMLSelectElement);
    expect(assignee).toBeDisabled();
    expect(within(assignee).getByRole("option", { name: "Loading project members…" }))
      .toBeInTheDocument();

    releaseAssignees({
      data: [],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    });
    await waitFor(() => expect(assignee).toBeEnabled());
    expect(within(assignee).getByRole("option", { name: "Unassigned" }))
      .toBeInTheDocument();
    expect(within(assignee).getByRole("option", { name: "No project members available" }))
      .toBeDisabled();
    await user.type(screen.getByLabelText("Impact title"), "Unassigned review");
    await user.click(screen.getByRole("button", { name: "Save impact" }));
    await waitFor(() =>
      expect(entities.DrawingImpact.create).toHaveBeenCalledWith(
        expect.objectContaining({ assigned_to: null }),
      ),
    );
  });

  it("fails closed when the PM-authorized assignee roster cannot be loaded", async () => {
    const user = userEvent.setup();
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: "permission denied" },
      count: null,
      status: 403,
      statusText: "Forbidden",
    } as never);
    seedRevisionWithPiece();
    renderPieceRegister("/PieceRegister?view=impact&revision=r4&piece=p1");

    await user.click(await screen.findByRole("button", { name: "Add drawing impact" }));
    const assignee = screen.getByLabelText("Assigned to");
    await waitFor(() => expect(assignee).toBeDisabled());
    expect(within(assignee).getByRole("option", { name: "Project members unavailable" }))
      .toBeDisabled();
    await user.type(screen.getByLabelText("Impact title"), "Blocked roster write");
    expect(screen.getByRole("button", { name: "Save impact" })).toBeDisabled();
    expect(entities.DrawingImpact.create).not.toHaveBeenCalled();
  });

  it("sets resolved_at only when an edited impact crosses into a terminal status", async () => {
    const user = userEvent.setup();
    seedRevisionWithPiece({ impacts: [drawingImpactRow()] });
    renderPieceRegister("/PieceRegister?view=impact&revision=r4&piece=p1");

    await user.click(await screen.findByRole("button", { name: "Edit drawing impact" }));
    await user.selectOptions(screen.getByLabelText("Impact status"), "resolved");
    await user.click(screen.getByRole("button", { name: "Save impact" }));

    await waitFor(() => expect(entities.DrawingImpact.update).toHaveBeenCalled());
    expect(entities.DrawingImpact.update).toHaveBeenLastCalledWith(
      "impact-1",
      expect.objectContaining({
        status: "resolved",
        resolved_at: expect.any(String),
      }),
    );
  });

  it("preserves resolved_at when an edited impact remains terminal", async () => {
    const user = userEvent.setup();
    const originalResolvedAt = "2026-08-01T14:30:00.000Z";
    seedRevisionWithPiece({
      impacts: [drawingImpactRow({ status: "resolved", resolved_at: originalResolvedAt })],
    });
    renderPieceRegister("/PieceRegister?view=impact&revision=r4&piece=p1");

    await user.click(await screen.findByRole("button", { name: "Edit drawing impact" }));
    await user.selectOptions(screen.getByLabelText("Impact status"), "closed");
    await user.click(screen.getByRole("button", { name: "Save impact" }));

    await waitFor(() => expect(entities.DrawingImpact.update).toHaveBeenCalled());
    expect(entities.DrawingImpact.update).toHaveBeenLastCalledWith(
      "impact-1",
      expect.objectContaining({
        status: "closed",
        resolved_at: originalResolvedAt,
      }),
    );
  });

  it("clears resolved_at when an edited impact is reopened", async () => {
    const user = userEvent.setup();
    seedRevisionWithPiece({
      impacts: [
        drawingImpactRow({
          status: "closed",
          resolved_at: "2026-08-01T14:30:00.000Z",
        }),
      ],
    });
    renderPieceRegister("/PieceRegister?view=impact&revision=r4&piece=p1");

    await user.click(await screen.findByRole("button", { name: "Edit drawing impact" }));
    await user.selectOptions(screen.getByLabelText("Impact status"), "in_review");
    await user.click(screen.getByRole("button", { name: "Save impact" }));

    await waitFor(() => expect(entities.DrawingImpact.update).toHaveBeenCalled());
    expect(entities.DrawingImpact.update).toHaveBeenLastCalledWith(
      "impact-1",
      expect.objectContaining({
        status: "in_review",
        resolved_at: null,
      }),
    );
  });

  it("updates and resolves an existing drawing impact without inventing commercial data", async () => {
    const user = userEvent.setup();
    seedRevisionWithPiece({ impacts: [drawingImpactRow()] });
    renderPieceRegister("/PieceRegister?view=impact&revision=r4&piece=p1");

    await user.click(await screen.findByRole("button", { name: "Edit drawing impact" }));
    const title = screen.getByLabelText("Impact title");
    await user.clear(title);
    await user.type(title, "Coordinate revised connection");
    await user.selectOptions(screen.getByLabelText("Impact status"), "blocked");
    await user.click(screen.getByRole("button", { name: "Save impact" }));

    await waitFor(() =>
      expect(entities.DrawingImpact.update).toHaveBeenCalledWith(
        "impact-1",
        expect.objectContaining({
          project_id: "project-1",
          drawing_revision_id: "r4",
          status: "blocked",
          title: "Coordinate revised connection",
        }),
      ),
    );
    const updatePayload = vi.mocked(entities.DrawingImpact.update).mock.calls[0]?.[1] as Record<string, unknown>;
    expect(updatePayload).not.toHaveProperty("change_order_id");
    expect(updatePayload).not.toHaveProperty("cost");

    await user.click(screen.getByRole("button", { name: "Resolve drawing impact" }));
    await waitFor(() => expect(entities.DrawingImpact.update).toHaveBeenCalledTimes(2));
    expect(entities.DrawingImpact.update).toHaveBeenLastCalledWith(
      "impact-1",
      expect.objectContaining({
        project_id: "project-1",
        status: "resolved",
        resolved_at: expect.any(String),
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Drawing impact resolved");
  });

  it("cancels the impact editor without writing", async () => {
    const user = userEvent.setup();
    seedRevisionWithPiece();
    renderPieceRegister("/PieceRegister?view=impact&revision=r4&piece=p1");

    await user.click(await screen.findByRole("button", { name: "Add drawing impact" }));
    await user.type(screen.getByLabelText("Impact title"), "Do not save");
    await user.click(screen.getByRole("button", { name: "Cancel impact" }));

    expect(entities.DrawingImpact.create).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Impact title")).not.toBeInTheDocument();
  });

  it("surfaces protected-mutation errors without success language", async () => {
    const user = userEvent.setup();
    vi.mocked(setPieceHold).mockRejectedValueOnce(new Error("permission denied"));
    seedRevisionWithPiece();
    renderPieceRegister("/PieceRegister?view=impact&revision=r4&piece=p1");

    await user.click(await screen.findByRole("button", { name: "Place hold" }));
    await user.type(screen.getByLabelText("Hold reason"), "Revision conflict");
    await user.click(screen.getByRole("button", { name: "Confirm hold" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "You do not have permission to complete this Piece Register action.",
      ),
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("keeps a failed resolve action fail-closed and available for retry", async () => {
    const user = userEvent.setup();
    vi.mocked(entities.DrawingImpact.update).mockRejectedValueOnce(
      new Error("permission denied"),
    );
    seedRevisionWithPiece({ impacts: [drawingImpactRow()] });
    renderPieceRegister("/PieceRegister?view=impact&revision=r4&piece=p1");

    await user.click(
      await screen.findByRole("button", { name: "Resolve drawing impact" }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "You do not have permission to complete this Piece Register action.",
      ),
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Resolve drawing impact" }),
    ).toBeEnabled();
  });

  it("opens owning relationship and canonical release surfaces with selected work-package intent", async () => {
    const user = userEvent.setup();
    seedRevisionWithPiece();
    const first = renderPieceRegister(
      "/PieceRegister?view=impact&revision=r4&piece=p1&embed=1",
    );

    await user.click(await screen.findByRole("button", { name: "Open Lots & links" }));
    expect(screen.getByTestId("piece-register-search")).toHaveTextContent("view=relationships");
    expect(screen.getByTestId("piece-register-search")).toHaveTextContent("focus=revision");
    expect(screen.getByTestId("piece-register-search")).toHaveTextContent("piece=p1");
    expect(screen.getByTestId("piece-register-search")).toHaveTextContent("revision=r4");
    first.unmount();

    renderPieceRegister(
      "/PieceRegister?view=impact&revision=r4&piece=p1&embed=1",
    );
    await user.click(await screen.findByRole("button", { name: "Open fabrication release" }));

    expect(await screen.findByTestId("canonical-release-panel")).toBeInTheDocument();
    expect(canonicalReleasePanelProps.current).toEqual({
      projectId: "project-1",
      workPackageId: "wp-1",
      pieceControlMode: "shadow",
    });
    expect(screen.getByTestId("piece-register-search")).toHaveTextContent("view=board");
    expect(screen.getByTestId("piece-register-search")).toHaveTextContent("focus=release");
    expect(screen.getByTestId("piece-register-search")).toHaveTextContent("piece=p1");
    expect(setPieceHold).not.toHaveBeenCalled();
    expect(entities.DrawingImpact.create).not.toHaveBeenCalled();
    expect(entities.DrawingImpact.update).not.toHaveBeenCalled();
  });

  it("loads the canonical intelligence snapshot and writes revision and piece intent", async () => {
    vi.mocked(fetchPieceRegister).mockResolvedValue([pieceRegisterRow("p1")]);

    renderPieceRegister("/PieceRegister?view=impact&embed=1");

    const revision = await screen.findByRole("button", {
      name: /E502 revision 4/i,
    });
    expect(fetchPieceIntelligenceSnapshot).toHaveBeenCalledWith("project-1");

    fireEvent.click(revision);
    await waitFor(() =>
      expect(screen.getByTestId("piece-register-search")).toHaveTextContent(
        "?view=impact&embed=1&revision=r4",
      ),
    );

    fireEvent.click(await screen.findByRole("button", { name: /open P1 · A/i }));
    expect(await screen.findByLabelText("Piece digital thread")).toBeInTheDocument();
    expect(screen.getByTestId("piece-register-search")).toHaveTextContent(
      "?view=impact&embed=1&revision=r4&piece=p1",
    );
  });

  it("replaces the Register impact panel with the five-section digital thread", async () => {
    vi.mocked(fetchPieceRegister).mockResolvedValue([pieceRegisterRow("p1")]);

    renderPieceRegister("/PieceRegister?view=register&piece=p1");

    expect(await screen.findByLabelText("Piece digital thread")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Piece impact" }))
      .not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Model & drawing" }))
      .toBeInTheDocument();
  });

  it("fails closed when revision evidence cannot be loaded", async () => {
    vi.mocked(fetchPieceRegister).mockResolvedValue([pieceRegisterRow("p1")]);
    vi.mocked(fetchPieceIntelligenceSnapshot).mockRejectedValueOnce(
      new Error("relationship query denied"),
    );

    renderPieceRegister("/PieceRegister?view=impact&revision=r4");

    expect(
      await screen.findByText("Revision evidence could not be loaded."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Piece links required")).not.toBeInTheDocument();
  });

  it("clears an inaccessible revision only after intelligence resolves", async () => {
    vi.mocked(fetchPieceRegister).mockResolvedValue([pieceRegisterRow("p1")]);

    renderPieceRegister(
      "/PieceRegister?view=impact&revision=other-project&piece=p1&embed=1",
    );

    expect(await screen.findByLabelText("Piece digital thread")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("piece-register-search")).toHaveTextContent(
        "?view=impact&piece=p1&embed=1",
      ),
    );
  });

  it("preserves revision intent when a successful snapshot reports evidence unavailable", async () => {
    vi.mocked(fetchPieceRegister).mockResolvedValue([pieceRegisterRow("p1")]);
    const unavailable = intelligenceSnapshot();
    unavailable.drawingRevisions = [];
    unavailable.availability.relationships = "unavailable";
    unavailable.sourceAvailability.revisions = "unavailable";
    vi.mocked(fetchPieceIntelligenceSnapshot).mockResolvedValueOnce(
      unavailable as Awaited<ReturnType<typeof fetchPieceIntelligenceSnapshot>>,
    );

    renderPieceRegister(
      "/PieceRegister?view=impact&revision=retain-r4&embed=1",
    );

    expect(await screen.findByText("Revision evidence unavailable"))
      .toBeInTheDocument();
    expect(screen.getByTestId("piece-register-search")).toHaveTextContent(
      "?view=impact&revision=retain-r4&embed=1",
    );
  });

  it.each([
    {
      label: "container-only",
      rows: [{ ...pieceRegisterRow("container"), is_container: true }],
    },
    {
      label: "split-parent-only",
      rows: [
        pieceRegisterRow("split-parent"),
        {
          ...pieceRegisterRow("container-child"),
          parent_piece_id: "split-parent",
          is_container: true,
        },
      ],
    },
  ])("shows controlled empty Impact state for a $label register", async ({ rows }) => {
    vi.mocked(fetchPieceRegister).mockResolvedValue(rows);

    renderPieceRegister("/PieceRegister?view=impact&revision=r4");

    expect(await screen.findByText(
      "No active pieces are available for revision review.",
    )).toBeInTheDocument();
    expect(screen.queryByText("Revision evidence is unavailable."))
      .not.toBeInTheDocument();
    expect(fetchPieceIntelligenceSnapshot).not.toHaveBeenCalled();
  });

  it.each([
    { label: "null", initialProjectId: null },
    { label: "undefined", initialProjectId: undefined },
  ])(
    "preserves a valid direct piece through $label project hydration",
    async ({ initialProjectId }) => {
      projectContext.projectId = initialProjectId;
      vi.mocked(fetchPieceRegister).mockResolvedValue([
        pieceRegisterRow("p1"),
      ]);
      const { rerenderPieceRegister } = renderPieceRegister(
        "/PieceRegister?view=impact&piece=p1&revision=r4&embed=1",
      );

      expect(
        screen.getByRole("heading", { name: "Select a project" }),
      ).toBeInTheDocument();

      projectContext.projectId = "project-1";
      rerenderPieceRegister();

      expect(await screen.findByLabelText("Piece digital thread"))
        .toBeInTheDocument();
      expect(screen.getByTestId("piece-register-search")).toHaveTextContent(
        "?view=impact&piece=p1&revision=r4&embed=1",
      );
    },
  );

  it("clears an invalid piece only after the active project rows resolve", async () => {
    let resolvePieces!: (rows: ReturnType<typeof pieceRegisterRow>[]) => void;
    vi.mocked(fetchPieceRegister).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePieces = resolve;
        }),
    );

    renderPieceRegister(
      "/PieceRegister?view=register&piece=other-project&revision=r4&project=mesa",
    );

    expect(screen.queryByRole("heading", { name: "Piece impact" }))
      .not.toBeInTheDocument();
    expect(screen.getByTestId("piece-register-search")).toHaveTextContent(
      "?view=register&piece=other-project&revision=r4&project=mesa",
    );

    resolvePieces([pieceRegisterRow("p1")]);

    await waitFor(() =>
      expect(screen.getByTestId("piece-register-search")).toHaveTextContent(
        "?view=register&revision=r4&project=mesa",
      ),
    );
    expect(screen.queryByRole("heading", { name: "Piece impact" }))
      .not.toBeInTheDocument();
  });

  it("clears project-scoped piece and revision intent on a real project switch", async () => {
    projectContext.projectId = "project-a";
    vi.mocked(fetchPieceRegister).mockImplementation(async (projectId) => [
      pieceRegisterRow(projectId === "project-a" ? "piece-a" : "piece-b", projectId),
    ]);
    vi.mocked(fetchPieceIntelligenceSnapshot).mockImplementation(async (projectId) =>
      intelligenceSnapshot(
        projectId === "project-a" ? "piece-a" : "piece-b",
        projectId,
      ) as Awaited<ReturnType<typeof fetchPieceIntelligenceSnapshot>>,
    );
    const { rerenderPieceRegister } = renderPieceRegister(
      "/PieceRegister?view=impact&focus=revision&piece=piece-a&revision=r4&embed=1",
    );

    expect(await screen.findByLabelText("Piece digital thread"))
      .toBeInTheDocument();

    projectContext.projectId = "project-b";
    rerenderPieceRegister();

    expect(screen.queryByRole("heading", { name: "PIECE-A · A" }))
      .not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("piece-register-search")).toHaveTextContent(
        "?view=impact&focus=revision&embed=1",
      ),
    );
    expect(
      screen.getByRole("button", { name: "Revision Impact" }),
    ).toHaveAttribute("aria-current", "page");
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

  it("leads a populated Overview with Changes & Risks and preserved operations summaries", async () => {
    vi.mocked(fetchPieceRegister).mockResolvedValue([pieceRegisterRow("p1")]);

    renderPieceRegister();

    expect(
      await screen.findByRole("heading", { name: "Changes & Risks" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", {
        name: /Review revision impact.*1 affected piece/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Revision impact requiring action" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Pieces needing attention" }),
    ).toBeInTheDocument();
    const metrics = screen.getByRole("group", {
      name: "Piece intelligence metrics",
    });
    expect(within(metrics).getByText("Revision affected").parentElement)
      .toHaveTextContent("1Revision affected");
    expect(within(metrics).getByText("Blocked or held")).toBeInTheDocument();
    expect(within(metrics).getByText("Next release")).toBeInTheDocument();
    expect(within(metrics).getByText("Field risk")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Work-package readiness" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Upcoming shipments" }),
    ).toBeInTheDocument();
  });

  it("preserves the controlled empty-register onboarding without loading intelligence", async () => {
    renderPieceRegister();

    expect(await screen.findByText("Import the first pieces")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Changes & Risks" }),
    ).not.toBeInTheDocument();
    expect(fetchPieceIntelligenceSnapshot).not.toHaveBeenCalled();
  });

  it("keeps core Overview operations visible while intelligence is loading", async () => {
    vi.mocked(fetchPieceRegister).mockResolvedValue([pieceRegisterRow("p1")]);
    vi.mocked(fetchPieceIntelligenceSnapshot).mockImplementationOnce(
      () => new Promise(() => undefined),
    );

    renderPieceRegister();

    expect(
      await screen.findByRole("heading", { name: "Changes & Risks" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Loading change and risk evidence…")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Work-package readiness" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Revision affected")).not.toBeInTheDocument();
    expect(screen.queryByText(/affected pieces?$/i)).not.toBeInTheDocument();
  });

  it("shows one intelligence retry on Overview error without affected totals", async () => {
    vi.mocked(fetchPieceRegister).mockResolvedValue([pieceRegisterRow("p1")]);
    vi.mocked(fetchPieceIntelligenceSnapshot)
      .mockRejectedValueOnce(new Error("relationship query denied"))
      .mockResolvedValueOnce(
        intelligenceSnapshot() as Awaited<
          ReturnType<typeof fetchPieceIntelligenceSnapshot>
        >,
      );

    renderPieceRegister();

    expect(
      await screen.findByText("Changes and risks could not be loaded."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Revision affected")).not.toBeInTheDocument();
    expect(screen.queryByText(/affected pieces?$/i)).not.toBeInTheDocument();
    const retry = screen.getAllByRole("button", {
      name: "Retry changes and risks",
    });
    expect(retry).toHaveLength(1);

    fireEvent.click(retry[0]);

    expect(
      await screen.findByRole("group", { name: "Piece intelligence metrics" }),
    ).toBeInTheDocument();
    expect(fetchPieceIntelligenceSnapshot).toHaveBeenCalledTimes(2);
  });

  it("fails closed when Overview relationship evidence is unavailable", async () => {
    vi.mocked(fetchPieceRegister).mockResolvedValue([pieceRegisterRow("p1")]);
    const unavailable = intelligenceSnapshot();
    unavailable.availability.relationships = "unavailable";
    unavailable.sourceAvailability.pieceDrawings = "unavailable";
    unavailable.sourceAvailability.pieceDrawingSets = "unavailable";
    unavailable.sourceAvailability.drawings = "unavailable";
    unavailable.sourceAvailability.drawingSets = "unavailable";
    unavailable.sourceAvailability.revisions = "unavailable";
    vi.mocked(fetchPieceIntelligenceSnapshot).mockResolvedValueOnce(
      unavailable as Awaited<ReturnType<typeof fetchPieceIntelligenceSnapshot>>,
    );

    renderPieceRegister();

    expect(
      await screen.findByText("Relationship evidence is unavailable."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Revision affected")).not.toBeInTheDocument();
    expect(screen.queryByText(/affected pieces?$/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /affected pieces?/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Work-package readiness" }),
    ).toBeInTheDocument();
    const retry = screen.getAllByRole("button", {
      name: "Retry changes and risks",
    });
    expect(retry).toHaveLength(1);

    fireEvent.click(retry[0]);

    expect(
      await screen.findByRole("group", { name: "Piece intelligence metrics" }),
    ).toBeInTheDocument();
    expect(fetchPieceIntelligenceSnapshot).toHaveBeenCalledTimes(2);
  });

  it.each([
    { source: "impacts" as const, label: "Drawing-impact evidence is unavailable." },
    { source: "rfis" as const, label: "RFI evidence is unavailable." },
  ])("marks blocked totals and attention completeness unknown when $source are unavailable", async ({ source, label }) => {
    vi.mocked(fetchPieceRegister).mockResolvedValue([pieceRegisterRow("p1")]);
    const partial = intelligenceSnapshot();
    partial.availability[source] = "unavailable";
    vi.mocked(fetchPieceIntelligenceSnapshot).mockResolvedValueOnce(
      partial as Awaited<ReturnType<typeof fetchPieceIntelligenceSnapshot>>,
    );

    renderPieceRegister();

    expect(await screen.findByText(label)).toBeInTheDocument();
    expect(screen.getByText("Blocked or held").parentElement)
      .toHaveTextContent("UnavailableBlocked or held");
    expect(screen.getByText(/Pieces needing attention is incomplete/i))
      .toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Review E502 revision 4/i }),
    ).toBeInTheDocument();
  });

  it("marks next-release readiness unknown when approval evidence is unavailable", async () => {
    vi.mocked(fetchPieceRegister).mockResolvedValue([pieceRegisterRow("p1")]);
    const partial = intelligenceSnapshot();
    partial.availability.approvals = "unavailable";
    partial.sourceAvailability.approvals = "unavailable";
    vi.mocked(fetchPieceIntelligenceSnapshot).mockResolvedValueOnce(
      partial as Awaited<ReturnType<typeof fetchPieceIntelligenceSnapshot>>,
    );

    renderPieceRegister();

    expect(await screen.findByText("Approval evidence is unavailable."))
      .toBeInTheDocument();
    expect(screen.getByText("Next release").parentElement)
      .toHaveTextContent("UnavailableNext release");
    expect(screen.getByText("Revision affected").parentElement)
      .toHaveTextContent("1Revision affected");
  });

  it.each([
    {
      label: "container-only",
      rows: [{ ...pieceRegisterRow("container"), is_container: true }],
    },
    {
      label: "split-parent-only",
      rows: [
        pieceRegisterRow("split-parent"),
        {
          ...pieceRegisterRow("split-child"),
          parent_piece_id: "split-parent",
          is_container: true,
        },
      ],
    },
  ])("preserves controlled empty Overview onboarding for a $label register", async ({ rows }) => {
    vi.mocked(fetchPieceRegister).mockResolvedValue(rows);

    renderPieceRegister();

    expect(await screen.findByText("Import the first pieces")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Changes & Risks" }))
      .not.toBeInTheDocument();
    expect(fetchPieceIntelligenceSnapshot).not.toHaveBeenCalled();
    expect(fetchCanonicalDashboardSnapshot).not.toHaveBeenCalled();
  });

  it("shows only the three highest downstream-risk revision decisions", async () => {
    const snapshot = lifecycleRiskIntelligenceSnapshot();
    vi.mocked(fetchPieceRegister).mockResolvedValue(snapshot.pieces);
    vi.mocked(fetchPieceIntelligenceSnapshot).mockResolvedValueOnce(
      snapshot as Awaited<ReturnType<typeof fetchPieceIntelligenceSnapshot>>,
    );

    renderPieceRegister();

    expect(await screen.findByRole("button", { name: /Review Z500 revision 1/i }))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Review Z400 revision 1/i }))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Review Z300 revision 1/i }))
      .toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Review A200 revision 1/i }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Review A100 revision 1/i }))
      .not.toBeInTheDocument();
  });

  it("preserves revision and piece intent from decision-rich Overview actions", async () => {
    vi.mocked(fetchPieceRegister).mockResolvedValue([pieceRegisterRow("p1")]);

    const firstRender = renderPieceRegister("/PieceRegister?embed=1");
    fireEvent.click(
      await screen.findByRole("button", {
        name: /Review revision impact.*1 affected piece/i,
      }),
    );
    expect(screen.getByTestId("piece-register-search")).toHaveTextContent(
      "?embed=1&view=impact&focus=revision",
    );
    firstRender.unmount();

    const secondRender = renderPieceRegister("/PieceRegister?embed=1");
    fireEvent.click(
      await screen.findByRole("button", {
        name: /Review E502 revision 4.*1 affected piece.*fabrication/i,
      }),
    );
    expect(screen.getByTestId("piece-register-search")).toHaveTextContent(
      "?embed=1&view=impact&revision=r4",
    );
    secondRender.unmount();

    renderPieceRegister("/PieceRegister?embed=1");
    fireEvent.click(
      await screen.findByRole("button", {
        name: /Open P1 · A digital thread.*revision exposure during fabrication/i,
      }),
    );
    expect(screen.getByTestId("piece-register-search")).toHaveTextContent(
      "?embed=1&view=register&piece=p1",
    );
  });

  it("routes relationship-repair attention to the revision relationships workflow", async () => {
    vi.mocked(fetchPieceRegister).mockResolvedValue([pieceRegisterRow("p1")]);
    vi.mocked(fetchPieceIntelligenceSnapshot).mockResolvedValueOnce(
      intelligenceSnapshotWithRelationshipRepair() as Awaited<
        ReturnType<typeof fetchPieceIntelligenceSnapshot>
      >,
    );

    renderPieceRegister("/PieceRegister?embed=1");

    expect(await screen.findByText("Links required")).toBeInTheDocument();
    expect(screen.queryByText("0 pieces")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: /Repair relationships for E503 revision 5.*explicit drawing relationship required/i,
      }),
    );

    expect(screen.getByTestId("piece-register-search")).toHaveTextContent(
      "?embed=1&view=relationships&focus=revision&revision=r5",
    );
    expect(screen.getByTestId("piece-register-search")).not.toHaveTextContent(
      "piece=r5",
    );
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

  it("offers a work package assignment box on approved import batches", async () => {
    vi.mocked(fetchPieceImportBatches).mockResolvedValue([
      {
        id: "batch-1",
        project_id: "project-1",
        source_type: "csv",
        source_name: "Embeds import",
        status: "approved",
        row_count: 2,
        decision_counts: { new: 2 },
        created_at: "2026-07-23T12:00:00.000Z",
        approved_at: "2026-07-23T13:00:00.000Z",
        applied_at: null,
        apply_summary: null,
      },
    ]);

    renderPieceRegister();
    fireEvent.click(screen.getByRole("button", { name: "Imports" }));

    expect(
      await screen.findByLabelText(/Work package override \(optional — or use CSV wp_number\)/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "WP-001 - Embeds & Lintels" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Apply batch (CSV WP / sheet hints)" }),
    ).toBeDisabled();

    fireEvent.change(
      screen.getByLabelText(/Work package override \(optional — or use CSV wp_number\)/i),
      { target: { value: "wp-1" } },
    );
    expect(
      screen.getByRole("button", { name: "Apply, assign WP, and link drawings" }),
    ).toBeDisabled();

    fireEvent.click(screen.getByLabelText(/Confirm eligible creates and updates/i));
    expect(
      screen.getByRole("button", { name: "Apply, assign WP, and link drawings" }),
    ).toBeEnabled();
  });

  // Sentry JAVASCRIPT-REACT-2C: a UTF-16 export decoded as UTF-8 staged
  // p_i_e_c_e_m_a_r_k keys and U+0000 into jsonb p_rows (Postgres 22P05).
  it("stages a UTF-16LE CSV without a BOM as its real rows", async () => {
    vi.mocked(stagePieceImportBatch).mockResolvedValue({ batch_id: "batch-9" });
    const csv = "piece_mark,quantity,profile\r\nB1,2,W12X26\r\nC2,1,W10X33\r\n";
    const jsonNulEscape = `${String.fromCharCode(92)}u0000`;
    renderPieceRegister();
    fireEvent.click(screen.getByRole("button", { name: "Imports" }));

    fireEvent.change(screen.getByLabelText("File"), {
      target: { files: [importFileFromBytes(utf16le(csv), "tekla-export.csv")] },
    });

    expect(await screen.findByText("2 rows ready to stage")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stage for review" }));

    await waitFor(() => expect(stagePieceImportBatch).toHaveBeenCalledTimes(1));
    const [projectId, sourceType, sourceName, rows] =
      vi.mocked(stagePieceImportBatch).mock.calls[0];
    expect([projectId, sourceType, sourceName]).toEqual([
      "project-1",
      "csv",
      "tekla-export.csv",
    ]);
    expect(rows).toEqual([
      { piece_mark: "B1", quantity: "2", profile: "W12X26" },
      { piece_mark: "C2", quantity: "1", profile: "W10X33" },
    ]);
    expect(JSON.stringify(rows)).not.toContain(jsonNulEscape);
  });

  it("tells the user when null characters were removed from an import file", async () => {
    const encoder = new TextEncoder();
    const bytes = new Uint8Array([
      ...encoder.encode("piece_mark,quantity,profile\r\nB1"),
      0,
      ...encoder.encode(",2,W12X26\r\nC2,1,W10X33\r\n"),
      0, 0, 0, 0,
    ]);
    renderPieceRegister();
    fireEvent.click(screen.getByRole("button", { name: "Imports" }));

    fireEvent.change(screen.getByLabelText("File"), {
      target: { files: [importFileFromBytes(bytes, "pieces.csv")] },
    });

    const notice = await screen.findByText(
      "Removed 5 null characters from pieces.csv. Check the staged rows before applying.",
    );
    expect(notice).toHaveAttribute("role", "status");
    expect(screen.getByText("2 rows ready to stage")).toBeInTheDocument();
  });

  // Sentry JAVASCRIPT-REACT-2D: a held piece in the selection failed the whole
  // archive with P0001 behind a generic toast.
  it("excludes a held piece from archive and names it", async () => {
    vi.mocked(archivePieceLots).mockResolvedValue({ archived: 1 });
    const dialog = await openArchiveDialog(
      [
        { ...pieceRegisterRow("p1"), lifecycle_status: "not_started" },
        {
          ...pieceRegisterRow("p2"),
          lifecycle_status: "not_started",
          on_hold: true,
          on_hold_reason: "RFI 12",
        },
      ],
      ["P1", "P2"],
    );

    expect(within(dialog).getByRole("heading", { name: "Archive 1 piece?" }))
      .toBeInTheDocument();
    expect(within(dialog).getByRole("status")).toHaveTextContent(
      "Skipped — can't be archived: P2 lot A (held)",
    );
    fireEvent.change(within(dialog).getByLabelText("Reason"), {
      target: { value: "Duplicate import" },
    });
    fireEvent.change(within(dialog).getByLabelText(/Type ARCHIVE 1 PIECE to confirm/), {
      target: { value: "ARCHIVE 1 PIECE" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Archive pieces" }));

    await waitFor(() =>
      expect(archivePieceLots).toHaveBeenCalledWith(
        "project-1",
        ["p1"],
        "ARCHIVE 1 PIECE",
        "Duplicate import",
      ),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("1 piece archived, 1 skipped"),
    );
  });

  it("blocks archive when every selected piece is held", async () => {
    const dialog = await openArchiveDialog(
      [{ ...pieceRegisterRow("p2"), lifecycle_status: "not_started", on_hold: true }],
      ["P2"],
    );

    expect(within(dialog).getByText("None of the selected pieces can be archived."))
      .toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Reason"), {
      target: { value: "Duplicate import" },
    });
    // Type whatever phrase the dialog asks for; it must still refuse.
    const confirmation = within(dialog).getByLabelText(/to confirm/);
    fireEvent.change(confirmation, {
      target: { value: confirmation.getAttribute("placeholder") },
    });
    const archive = within(dialog).getByRole("button", { name: "Archive pieces" });
    expect(archive).toBeDisabled();
    fireEvent.click(archive);
    expect(archivePieceLots).not.toHaveBeenCalled();
  });
});

async function openArchiveDialog(
  rows: PieceRegisterRow[],
  marks: string[],
): Promise<HTMLElement> {
  vi.mocked(fetchPieceRegister).mockResolvedValue(rows);
  renderPieceRegister("/PieceRegister?view=register");
  for (const mark of marks) {
    fireEvent.click(await screen.findByLabelText(`Select ${mark} lot A`));
  }
  fireEvent.click(screen.getByRole("button", { name: /Archive selected/i }));
  return screen.getByRole("alertdialog");
}

function utf16le(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length * 2);
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    bytes[2 * index] = unit & 0xff;
    bytes[2 * index + 1] = unit >> 8;
  }
  return bytes;
}

// jsdom 25's File has no arrayBuffer()/text(); Node's File is a spec Blob.
function importFileFromBytes(bytes: Uint8Array, name: string): File {
  return new NodeFile([bytes], name) as unknown as File;
}
