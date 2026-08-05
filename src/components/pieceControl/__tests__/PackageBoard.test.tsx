// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assignPiecesToWorkPackage,
  fetchPieceRelationshipSnapshot,
  unassignPiecesFromWorkPackage,
} from "@/lib/pieceControl/relationshipsRepository";
import PackageBoard from "../PackageBoard";

vi.mock("@/lib/pieceControl/relationshipsRepository", () => ({
  assignPiecesToWorkPackage: vi.fn(),
  fetchPieceRelationshipSnapshot: vi.fn(),
  unassignPiecesFromWorkPackage: vi.fn(),
}));

vi.mock("@hello-pangea/dnd", () => ({
  DragDropContext: ({
    children,
    onDragEnd,
  }: {
    children: React.ReactNode;
    onDragEnd: (result: {
      draggableId: string;
      source: { droppableId: string; index: number };
      destination: { droppableId: string; index: number } | null;
      reason: string;
      type: string;
      mode: string;
    }) => void;
  }) => (
    <div>
      <button
        type="button"
        data-testid="simulate-assign"
        onClick={() =>
          onDragEnd({
            draggableId: "p1",
            source: { droppableId: "unassigned", index: 0 },
            destination: { droppableId: "wp-1", index: 0 },
            reason: "DROP",
            type: "DEFAULT",
            mode: "FLUID",
          })
        }
      >
        Simulate assign
      </button>
      <button
        type="button"
        data-testid="simulate-reassign"
        onClick={() =>
          onDragEnd({
            draggableId: "p2",
            source: { droppableId: "wp-1", index: 0 },
            destination: { droppableId: "wp-2", index: 0 },
            reason: "DROP",
            type: "DEFAULT",
            mode: "FLUID",
          })
        }
      >
        Simulate reassign
      </button>
      {children}
    </div>
  ),
  Droppable: ({
    children,
  }: {
    children: (
      provided: {
        innerRef: () => void;
        droppableProps: Record<string, unknown>;
        placeholder: null;
      },
      snapshot: { isDraggingOver: boolean },
    ) => React.ReactNode;
  }) =>
    children(
      { innerRef: () => undefined, droppableProps: {}, placeholder: null },
      { isDraggingOver: false },
    ),
  Draggable: ({
    children,
  }: {
    children: (
      provided: {
        innerRef: () => void;
        draggableProps: Record<string, unknown>;
        dragHandleProps: Record<string, unknown>;
      },
      snapshot: { isDragging: boolean },
    ) => React.ReactNode;
  }) =>
    children(
      {
        innerRef: () => undefined,
        draggableProps: {},
        dragHandleProps: {},
      },
      { isDragging: false },
    ),
}));

function renderBoard(mode = "pilot") {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PackageBoard projectId="project-1" pieceControlMode={mode} />
    </QueryClientProvider>,
  );
}

const snapshot = {
  pieces: [
    {
      id: "p1",
      project_id: "project-1",
      piece_mark: "C1",
      normalized_piece_mark: "C1",
      lot_code: "ALL",
      parent_piece_id: null,
      quantity: 1,
      profile: null,
      material_grade: null,
      weight_each_lbs: 2000,
      weight_total_lbs: 2000,
      work_package_id: null,
      lifecycle_status: "not_started",
      on_hold: false,
      is_container: false,
      is_deleted: false,
      source_system: null,
      external_ref: null,
      metadata: null,
      updated_at: "2026-07-25T00:00:00Z",
      deleted_at: null,
    },
    {
      id: "p2",
      project_id: "project-1",
      piece_mark: "C2",
      normalized_piece_mark: "C2",
      lot_code: "ALL",
      parent_piece_id: null,
      quantity: 1,
      profile: null,
      material_grade: null,
      weight_each_lbs: 2000,
      weight_total_lbs: 2000,
      work_package_id: "wp-1",
      lifecycle_status: "released",
      on_hold: false,
      is_container: false,
      is_deleted: false,
      source_system: null,
      external_ref: null,
      metadata: null,
      updated_at: "2026-07-25T00:00:00Z",
      deleted_at: null,
    },
  ],
  pieceDrawings: [],
  drawings: [],
  workPackages: [
    {
      id: "wp-1",
      project_id: "project-1",
      wp_number: "WP-001",
      name: "First",
      is_deleted: false,
      deleted_at: null,
    },
    {
      id: "wp-2",
      project_id: "project-1",
      wp_number: "WP-002",
      name: "Second",
      is_deleted: false,
      deleted_at: null,
    },
  ],
  drawingSets: [],
  submittals: [],
  sheetResponses: [],
  drawingRevisions: [],
  drawingReviews: [],
  drawingSignoffs: [],
  commentDispositions: [],
};

describe("PackageBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchPieceRelationshipSnapshot).mockResolvedValue(snapshot as never);
    vi.mocked(assignPiecesToWorkPackage).mockResolvedValue({
      assigned: 1,
      model_elements_synced: 0,
    });
    vi.mocked(unassignPiecesFromWorkPackage).mockResolvedValue({ unassigned: 1 });
  });

  it("shows setup copy when Piece Control is off", () => {
    renderBoard("off");
    expect(screen.getByText(/Package Board is unavailable/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Set up the Piece Register for this project/i),
    ).toBeInTheDocument();
  });

  it("assigns Unassigned → WP via drag end", async () => {
    renderBoard("pilot");
    expect(await screen.findByTestId("package-board")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("simulate-assign"));
    await waitFor(() => {
      expect(assignPiecesToWorkPackage).toHaveBeenCalledWith(
        "project-1",
        ["p1"],
        "wp-1",
      );
    });
  });

  it("confirms before WP → WP reassign", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderBoard("pilot");
    expect(await screen.findByTestId("package-board")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("simulate-reassign"));
    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalled();
      expect(assignPiecesToWorkPackage).toHaveBeenCalledWith(
        "project-1",
        ["p2"],
        "wp-2",
      );
    });
    confirmSpy.mockRestore();
  });

  it("skips reassign when confirm is cancelled", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderBoard("pilot");
    expect(await screen.findByTestId("package-board")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("simulate-reassign"));
    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalled();
    });
    expect(assignPiecesToWorkPackage).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
