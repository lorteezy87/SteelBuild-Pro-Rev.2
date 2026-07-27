// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  fetchPieceRelationshipSnapshot,
  linkPieceDrawing,
} from "@/lib/pieceControl/relationshipsRepository";
import PieceRelationshipManager from "../PieceRelationshipManager";

vi.mock("@/components/shared/ProjectContext", () => ({
  useProjectContext: () => ({
    activeProject: {
      id: "project-1",
      piece_control_mode: "shadow",
    },
  }),
}));

vi.mock("@/lib/pieceControl/relationshipsRepository", () => ({
  assignPiecesToWorkPackage: vi.fn(),
  fetchPieceRelationshipSnapshot: vi.fn(),
  linkPieceDrawing: vi.fn(),
  unassignPiecesFromWorkPackage: vi.fn(),
  unlinkPieceDrawing: vi.fn(),
}));

describe("PieceRelationshipManager", () => {
  it("uses operational language and keeps readiness read-only", async () => {
    vi.mocked(fetchPieceRelationshipSnapshot).mockResolvedValue({
      pieces: [],
      pieceDrawings: [],
      drawings: [],
      workPackages: [
        {
          id: "wp-1",
          project_id: "project-1",
          wp_number: "WP-001",
          name: "First sequence",
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
    });
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <PieceRelationshipManager
          projectId="project-1"
          pieceControlMode="shadow"
        />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: "Piece assignments" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "WP-001 - First sequence" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/pieces\.work_package_id/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/read-only readiness check/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No active pieces assigned to this work package."),
    ).toBeInTheDocument();
    expect(screen.getByText("Material status is not available.")).toBeInTheDocument();
    expect(
      screen.queryByText(/not yet evaluated in this release/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/canonical pieces/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Import or add active pieces to the Piece Register before linking drawings.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Add active project drawings before creating piece links.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Piece")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Drawing")).not.toBeInTheDocument();
  });

  it("uses Piece Register setup language when relationships are unavailable", () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <PieceRelationshipManager
          projectId="project-1"
          pieceControlMode="off"
        />
      </QueryClientProvider>,
    );

    expect(
      screen.getByText(
        "Set up the Piece Register for this project to manage active piece scope.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Enable Piece Control/i)).not.toBeInTheDocument();
  });

  it("explains the work-package assignment prerequisite in focused context", async () => {
    vi.mocked(fetchPieceRelationshipSnapshot).mockResolvedValue({
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
    });
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <PieceRelationshipManager
          projectId="project-1"
          pieceControlMode="shadow"
          focusedWorkPackageId="wp-1"
        />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText(
        "Assign active pieces to this work package before linking drawings.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Import or add active pieces/i),
    ).not.toBeInTheDocument();
  });

  it("previews auto-assign matches by sequence before applying", async () => {
    vi.mocked(fetchPieceRelationshipSnapshot).mockResolvedValue({
      pieces: [
        {
          id: "piece-1",
          project_id: "project-1",
          piece_mark: "B-101",
          normalized_piece_mark: "b-101",
          lot_code: "L1",
          parent_piece_id: null,
          quantity: 1,
          profile: null,
          material_grade: null,
          weight_each_lbs: null,
          weight_total_lbs: null,
          work_package_id: null,
          sequence_number: "WP-002",
          erection_area: null,
          lifecycle_status: "active",
          on_hold: false,
          source_system: null,
          external_ref: null,
          metadata: null,
          updated_at: "2026-07-01T00:00:00Z",
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
          name: "Foundations",
          sequence_number: "1",
          is_deleted: false,
          deleted_at: null,
        },
        {
          id: "wp-2",
          project_id: "project-1",
          wp_number: "WP-002",
          name: "ladder",
          sequence_number: "2",
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
    });
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <PieceRelationshipManager
          projectId="project-1"
          pieceControlMode="shadow"
        />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: "Piece assignments" }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /Auto-assign by import \/ sequence/i }),
    );

    expect(screen.getByText(/Auto-assign preview/i)).toBeInTheDocument();
    expect(screen.getByText(/B-101 → WP-002 - ladder/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Confirm auto-assign" }),
    ).toBeEnabled();
  });

  it("shift-clicks to select an inclusive range of piece marks", async () => {
    const pieces = ["A", "B", "C", "D"].map((mark, index) => ({
      id: `piece-${index + 1}`,
      project_id: "project-1",
      piece_mark: mark,
      normalized_piece_mark: mark.toLowerCase(),
      lot_code: "ALL",
      parent_piece_id: null,
      quantity: 1,
      profile: null,
      material_grade: null,
      weight_each_lbs: null,
      weight_total_lbs: null,
      work_package_id: null,
      lifecycle_status: "active",
      on_hold: false,
      source_system: null,
      external_ref: null,
      metadata: null,
      updated_at: "2026-07-01T00:00:00Z",
      deleted_at: null,
    }));
    vi.mocked(fetchPieceRelationshipSnapshot).mockResolvedValue({
      pieces,
      pieceDrawings: [],
      drawings: [],
      workPackages: [
        {
          id: "wp-1",
          project_id: "project-1",
          wp_number: "WP-001",
          name: "Sequence",
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
    });
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <PieceRelationshipManager
          projectId="project-1"
          pieceControlMode="shadow"
        />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText(/Shift-click to select a range/i),
    ).toBeInTheDocument();

    const boxA = document.getElementById("piece-assignment-piece-1") as HTMLInputElement;
    const boxC = document.getElementById("piece-assignment-piece-3") as HTMLInputElement;
    expect(boxA).toBeTruthy();
    expect(boxC).toBeTruthy();

    const rowA = boxA.closest("label") as HTMLElement;
    const rowC = boxC.closest("label") as HTMLElement;

    fireEvent.click(rowA);
    expect(boxA).toBeChecked();

    fireEvent.click(rowC, { shiftKey: true });
    expect(boxA).toBeChecked();
    expect(document.getElementById("piece-assignment-piece-2")).toBeChecked();
    expect(boxC).toBeChecked();
    expect(document.getElementById("piece-assignment-piece-4")).not.toBeChecked();
    expect(screen.getByText(/3 selected/i)).toBeInTheDocument();
  });

  it("bulk-links the selected pieces to one drawing", async () => {
    const pieces = ["A", "B"].map((mark, index) => ({
      id: `piece-${index + 1}`,
      project_id: "project-1",
      piece_mark: mark,
      normalized_piece_mark: mark.toLowerCase(),
      lot_code: "ALL",
      parent_piece_id: null,
      quantity: 1,
      profile: null,
      material_grade: null,
      weight_each_lbs: null,
      weight_total_lbs: null,
      work_package_id: null,
      lifecycle_status: "active",
      on_hold: false,
      source_system: null,
      external_ref: null,
      metadata: null,
      updated_at: "2026-07-01T00:00:00Z",
      deleted_at: null,
    }));
    vi.mocked(fetchPieceRelationshipSnapshot).mockResolvedValue({
      pieces,
      pieceDrawings: [],
      drawings: [
        {
          id: "drawing-1",
          project_id: "project-1",
          drawing_set_id: "set-1",
          sheet_number: "S-101",
          title: "Embeds",
          stage: "Released",
          set_approval_status: null,
          is_deleted: false,
          deleted_at: null,
          is_superseded: false,
        },
      ],
      workPackages: [],
      drawingSets: [],
      submittals: [],
      sheetResponses: [],
      drawingRevisions: [],
      drawingReviews: [],
      drawingSignoffs: [],
      commentDispositions: [],
    });
    vi.mocked(linkPieceDrawing).mockResolvedValue({ linked: true } as never);

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <PieceRelationshipManager
          projectId="project-1"
          pieceControlMode="shadow"
        />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole("button", { name: /Link drawing to selected/i }),
    ).toBeDisabled();

    fireEvent.click(
      document.getElementById("piece-assignment-piece-1")!.closest("label")!,
    );
    fireEvent.click(
      document.getElementById("piece-assignment-piece-2")!.closest("label")!,
    );

    fireEvent.change(screen.getByLabelText("Drawing"), {
      target: { value: "drawing-1" },
    });

    const bulkButton = screen.getByRole("button", {
      name: /Link drawing to 2 selected/i,
    });
    expect(bulkButton).toBeEnabled();
    fireEvent.click(bulkButton);

    await waitFor(() => {
      expect(linkPieceDrawing).toHaveBeenCalledTimes(2);
    });
    expect(linkPieceDrawing).toHaveBeenCalledWith(
      "project-1",
      "piece-1",
      "drawing-1",
    );
    expect(linkPieceDrawing).toHaveBeenCalledWith(
      "project-1",
      "piece-2",
      "drawing-1",
    );
  });
});
