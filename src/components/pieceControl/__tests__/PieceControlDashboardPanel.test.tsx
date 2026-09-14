// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCanonicalReportingRealtime } from "@/hooks/useCanonicalReportingRealtime";
import {
  fetchCanonicalDashboardSnapshot,
  type CanonicalDashboardSnapshot,
} from "@/lib/pieceControl/canonicalDashboardRepository";
import { PieceControlDashboardPanel } from "../PieceControlDashboardPanel";

vi.mock("@/lib/pieceControl/canonicalDashboardRepository", () => ({
  fetchCanonicalDashboardSnapshot: vi.fn(),
}));

vi.mock("@/hooks/useCanonicalReportingRealtime", () => ({
  useCanonicalReportingRealtime: vi.fn(),
}));

const snapshot: CanonicalDashboardSnapshot = {
  pieces: [
    {
      id: "piece-1",
      project_id: "p1",
      parent_piece_id: null,
      work_package_id: "wp-1",
      quantity: 2,
      weight_each_lbs: 100,
      weight_total_lbs: 200,
      lifecycle_status: "in_fabrication",
      current_station: "fit_up",
      on_hold: false,
      is_container: false,
      is_deleted: false,
      deleted_at: null,
    },
  ],
  workPackages: [],
  stations: [],
  completions: [],
  legacyProduction: [],
};

function createClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function renderPanel({
  pieceControlMode = "shadow",
  onOpen = vi.fn(),
}: {
  pieceControlMode?: string;
  onOpen?: () => void;
} = {}) {
  const client = createClient();
  const rendered = render(
    <QueryClientProvider client={client}>
      <PieceControlDashboardPanel
        project={{ id: "p1", piece_control_mode: pieceControlMode }}
        onOpen={onOpen}
      />
    </QueryClientProvider>,
  );
  return { ...rendered, client, onOpen };
}

function renderPanelWithSnapshot() {
  vi.mocked(fetchCanonicalDashboardSnapshot).mockResolvedValueOnce(snapshot);
  const onOpen = vi.fn();
  return renderPanel({ onOpen });
}

describe("PieceControlDashboardPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not fetch or subscribe when Piece Control is off", () => {
    const { container } = renderPanel({ pieceControlMode: "off" });

    expect(container).toBeEmptyDOMElement();
    expect(fetchCanonicalDashboardSnapshot).not.toHaveBeenCalled();
    expect(useCanonicalReportingRealtime).toHaveBeenCalledWith(undefined);
  });

  it("shows loading while canonical reporting is pending", () => {
    vi.mocked(fetchCanonicalDashboardSnapshot).mockReturnValueOnce(
      new Promise(() => {}),
    );

    renderPanel();

    expect(screen.getByText("Loading piece reporting...")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open Piece Register" }),
    ).toBeInTheDocument();
    expect(useCanonicalReportingRealtime).toHaveBeenCalledWith("p1");
  });

  it("filters containers, deleted rows, and active parents from its summary", async () => {
    vi.mocked(fetchCanonicalDashboardSnapshot).mockResolvedValueOnce({
      ...snapshot,
      pieces: [
        { ...snapshot.pieces[0], id: "parent", quantity: 100 },
        {
          ...snapshot.pieces[0],
          id: "child",
          parent_piece_id: "parent",
          quantity: 2,
        },
        {
          ...snapshot.pieces[0],
          id: "container",
          quantity: 50,
          is_container: true,
        },
        {
          ...snapshot.pieces[0],
          id: "deleted",
          quantity: 10,
          is_deleted: true,
        },
        { ...snapshot.pieces[0], id: "leaf", quantity: 3 },
      ],
    });

    renderPanel();

    const totalPiecesLabel = await screen.findByText("Total pieces");
    expect(totalPiecesLabel.previousElementSibling).toHaveTextContent("5");
  });

  it("shows the query error and retries canonical reporting", async () => {
    vi.mocked(fetchCanonicalDashboardSnapshot)
      .mockRejectedValueOnce(
        new Error("PGRST301: canonical reporting relation unavailable"),
      )
      .mockResolvedValueOnce(snapshot);

    renderPanel();

    expect(
      await screen.findByText("Piece reporting is unavailable."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/PGRST301|canonical/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() =>
      expect(fetchCanonicalDashboardSnapshot).toHaveBeenCalledTimes(2),
    );
    expect(await screen.findByText("Total pieces")).toBeInTheDocument();
  });

  it("opens the register from the empty import action", async () => {
    vi.mocked(fetchCanonicalDashboardSnapshot).mockResolvedValueOnce({
      ...snapshot,
      pieces: [],
    });
    const { onOpen } = renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "Import pieces" }));

    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("renders one compact panel and opens the register", async () => {
    const { onOpen } = renderPanelWithSnapshot();
    expect(
      await screen.findByRole("heading", { name: "Piece Control" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Canonical work packages")).not.toBeInTheDocument();
    expect(screen.queryByText("Shadow comparison")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Piece Register" }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("surfaces meaningful Shadow review differences from existing production records", async () => {
    vi.mocked(fetchCanonicalDashboardSnapshot).mockResolvedValueOnce({
      ...snapshot,
      pieces: [
        {
          ...snapshot.pieces[0],
          quantity: 3,
          weight_each_lbs: 200,
          weight_total_lbs: 600,
        },
      ],
      legacyProduction: [
        {
          id: "legacy-1",
          quantity: 1,
          weight: 100,
          status: "fabricated",
          ship_date: null,
        },
      ],
    });

    renderPanel();

    expect(
      await screen.findByText("Existing production records differ"),
    ).toBeInTheDocument();
    expect(screen.getByText("+2 pieces")).toBeInTheDocument();
    expect(screen.getByText("+0.25 tons")).toBeInTheDocument();
  });

  it("counts one legacy piece for tonnage when quantity is null or zero", async () => {
    vi.mocked(fetchCanonicalDashboardSnapshot).mockResolvedValueOnce({
      ...snapshot,
      pieces: [
        {
          ...snapshot.pieces[0],
          quantity: 2,
          weight_each_lbs: 200,
          weight_total_lbs: 400,
        },
      ],
      legacyProduction: [
        {
          id: "legacy-zero-quantity",
          quantity: 0,
          weight: 100,
          status: "fabricated",
          ship_date: null,
        },
        {
          id: "legacy-null-quantity",
          quantity: null,
          weight: 100,
          status: "fabricated",
          ship_date: null,
        },
        {
          id: "legacy-null-weight",
          quantity: 4,
          weight: null,
          status: "fabricated",
          ship_date: null,
        },
      ],
    });

    renderPanel();

    expect(
      await screen.findByText("Existing production records differ"),
    ).toBeInTheDocument();
    expect(screen.getByText("+0.10 tons")).toBeInTheDocument();
  });
});
