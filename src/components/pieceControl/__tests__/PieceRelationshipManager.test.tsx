// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fetchPieceRelationshipSnapshot } from "@/lib/pieceControl/relationshipsRepository";
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

  it("sanitizes relationship read errors and retries in place", async () => {
    vi.mocked(fetchPieceRelationshipSnapshot)
      .mockRejectedValueOnce(
        new Error("PGRST301: canonical piece scope query failed"),
      )
      .mockResolvedValueOnce({
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
        />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText("Piece relationships could not be loaded."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/PGRST301|canonical/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(
      await screen.findByRole("heading", { name: "Piece assignments" }),
    ).toBeInTheDocument();
    expect(vi.mocked(fetchPieceRelationshipSnapshot).mock.calls.length)
      .toBeGreaterThanOrEqual(2);
  });
});
