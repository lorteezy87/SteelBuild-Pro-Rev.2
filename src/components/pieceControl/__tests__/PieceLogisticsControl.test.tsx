// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import {
  fetchLogisticsSnapshot,
  transitionPieceLots,
  type LogisticsSnapshot,
} from "@/lib/pieceControl/logisticsRepository";
import { PieceLogisticsControl } from "../PieceLogisticsControl";

vi.mock("@/lib/pieceControl/logisticsRepository", () => ({
  fetchLogisticsSnapshot: vi.fn(),
  transitionPieceLots: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const fabricatedPiece: LogisticsSnapshot["pieces"][number] = {
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
  current_station: "ready_to_ship",
  on_hold: false,
  is_container: false,
  is_deleted: false,
  source_system: "manual",
  external_ref: null,
  metadata: null,
  updated_at: "2026-07-23T12:00:00.000Z",
  deleted_at: null,
};

function renderControl(
  logisticsSnapshot: LogisticsSnapshot | null = {
    pieces: [fabricatedPiece],
    events: [],
  },
  pieceControlMode = "shadow",
) {
  if (logisticsSnapshot) {
    vi.mocked(fetchLogisticsSnapshot).mockResolvedValue(logisticsSnapshot);
  }
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={client}>
      <PieceLogisticsControl
        projectId="project-1"
        pieceControlMode={pieceControlMode}
      />
    </QueryClientProvider>,
  );
}

describe("PieceLogisticsControl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(transitionPieceLots).mockResolvedValue(undefined);
  });

  it("presents Ship, Deliver, and Erect with immutable logistics history", async () => {
    renderControl();

    expect(
      await screen.findByRole("heading", { name: "Ship" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Deliver" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Erect" })).toBeInTheDocument();
    expect(
      screen.getByText(/immutable logistics history/i),
    ).toBeInTheDocument();
  });

  it("keeps the exact disabled reason visible for an ineligible candidate", async () => {
    renderControl({
      pieces: [{ ...fabricatedPiece, on_hold: true }],
      events: [],
    });

    expect(
      await screen.findByText("Release the hold before recording logistics."),
    ).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });

  it("preserves browser confirmation and transition reference payloads", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderControl();

    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.change(screen.getByPlaceholderText("Shipment / load number"), {
      target: { value: "LOAD-17" },
    });
    fireEvent.change(screen.getByPlaceholderText("Carrier"), {
      target: { value: "Desert Freight" },
    });
    fireEvent.change(screen.getByPlaceholderText("Destination"), {
      target: { value: "North laydown" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm 1 shipped" }));

    expect(confirm).toHaveBeenCalledWith(
      "Ship selected lots (1)? This physical transition cannot be overridden or reversed.",
    );
    await waitFor(() =>
      expect(transitionPieceLots).toHaveBeenCalledWith(
        "ship",
        "project-1",
        ["piece-1"],
        {
          shipment_number: "LOAD-17",
          carrier: "Desert Freight",
          destination: "North laydown",
        },
      ),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Shipped selected piece lots."),
    );
  });

  it("exposes the off-state Logistics title as a heading", () => {
    renderControl(
      {
        pieces: [],
        events: [],
      },
      "off",
    );

    expect(
      screen.getByRole("heading", { name: "Logistics", level: 2 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Shipment, delivery, and erection actions are unavailable until the Piece Register is set up.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Piece Control is off/i)).not.toBeInTheDocument();
  });

  it("uses plain piece-lot terminology when no lots are ready", async () => {
    renderControl({ pieces: [], events: [] });

    expect(
      (await screen.findAllByText(/No piece lots currently have/i)).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/leaf lots/i)).not.toBeInTheDocument();
  });

  it("sanitizes logistics read errors and retries in place", async () => {
    vi.mocked(fetchLogisticsSnapshot)
      .mockRejectedValueOnce(
        new Error("PGRST301: invalid canonical logistics transition"),
      )
      .mockResolvedValueOnce({ pieces: [fabricatedPiece], events: [] });

    renderControl(null);

    expect(
      await screen.findByText("Logistics data could not be loaded."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/PGRST301|canonical/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { name: "Ship" }))
      .toBeInTheDocument();
    expect(fetchLogisticsSnapshot).toHaveBeenCalledTimes(2);
  });

  it("sanitizes logistics mutation errors", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(transitionPieceLots).mockRejectedValue(
      new Error("Invalid canonical logistics transition sequence"),
    );
    renderControl();

    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Confirm 1 shipped" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "The selected pieces are not ready for this logistics step.",
      ),
    );
    expect(confirm).toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalledWith(
      expect.stringMatching(/canonical|transition sequence/i),
    );
  });
});
