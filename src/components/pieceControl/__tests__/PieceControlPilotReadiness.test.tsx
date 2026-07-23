// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchPilotReadiness,
  setPieceControlMode,
  type PilotReadinessSnapshot,
} from "@/lib/pieceControl/pilotReadinessRepository";
import { exportToCSV } from "@/lib/csv";
import { PieceControlPilotReadiness } from "../PieceControlPilotReadiness";
import { toast } from "sonner";

vi.mock("@/lib/pieceControl/pilotReadinessRepository", () => ({
  fetchPilotReadiness: vi.fn(),
  setPieceControlMode: vi.fn(),
}));

vi.mock("@/lib/csv", () => ({
  exportToCSV: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const rpcReadinessCopy = {
  modelLinks: "3 active model elements are not linked to canonical pieces",
  discrepancy: "Canonical versus legacy discrepancy: 4 pieces and 1.25 tons",
  releaseChecks:
    "2 scoped work packages currently fail the canonical release gate",
  pieceScope: "No active actionable canonical piece scope",
  pilotImport: "Resolve invalid import rows before pilot",
  stations:
    "Canonical station configuration must contain six stations totaling 100 percent",
  liveMaterial: "Resolve missing material mappings before live mode",
  liveDiscrepancy:
    "Resolve meaningful canonical versus legacy metric discrepancies before live mode",
};

const blockedSnapshot: PilotReadinessSnapshot = {
  report: {
    project_id: "project-1",
    mode: "shadow",
    generated_at: "2026-07-23T12:00:00.000Z",
    metrics: {
      canonical_import_coverage_percent: 92,
      model_element_coverage_percent: 81,
    },
    data_quality_warnings: [
      rpcReadinessCopy.modelLinks,
      rpcReadinessCopy.discrepancy,
    ],
    hard_release_blockers: [rpcReadinessCopy.releaseChecks],
    pilot_transition_blockers: [
      rpcReadinessCopy.pieceScope,
      rpcReadinessCopy.pilotImport,
      rpcReadinessCopy.stations,
    ],
    live_transition_blockers: [
      rpcReadinessCopy.liveMaterial,
      rpcReadinessCopy.liveDiscrepancy,
    ],
    pilot_ready: false,
    live_ready: false,
  },
  role: "admin",
  modeEvents: [],
  recentFailureCount: 0,
};

function renderReadiness(snapshot: PilotReadinessSnapshot = blockedSnapshot) {
  vi.mocked(fetchPilotReadiness).mockResolvedValue(snapshot);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <PieceControlPilotReadiness
        projectId="project-1"
        currentMode="shadow"
      />
    </QueryClientProvider>,
  );
}

describe("PieceControlPilotReadiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(setPieceControlMode).mockResolvedValue(undefined);
  });

  it("shows friendly authority and blocked workflow states", async () => {
    renderReadiness();

    expect(await screen.findByText("Shadow review")).toBeInTheDocument();
    expect(
      screen.getByText(/existing production records remain authoritative/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Pilot workflow blocked")).toBeInTheDocument();
    expect(screen.getByText("Live workflow blocked")).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Pilot workflow" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Confirm mode change" }),
    ).toBeDisabled();
  });

  it("keeps the exact confirmation and mode mutation contract", async () => {
    renderReadiness();

    fireEvent.change(await screen.findByRole("combobox"), {
      target: { value: "pilot" },
    });
    const confirmation = screen.getByPlaceholderText(
      "Type: CHANGE SHADOW TO PILOT",
    );
    fireEvent.change(confirmation, {
      target: { value: "CHANGE SHADOW TO PILOT" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm mode change" }),
    );

    await waitFor(() => {
      expect(setPieceControlMode).toHaveBeenCalledWith(
        "project-1",
        "pilot",
        "CHANGE SHADOW TO PILOT",
      );
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        "Piece Control moved to Pilot workflow.",
      );
    });
  });

  it("maps RPC readiness copy in the report and CSV without mutating the snapshot", async () => {
    renderReadiness();

    expect(
      await screen.findByText(
        "3 active model elements are not linked to Piece Register pieces",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Piece Register versus existing production records discrepancy: 4 pieces and 1.25 tons",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "2 scoped work packages currently fail the fabrication release checks",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Resolve invalid import rows for Pilot workflow"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Resolve meaningful Piece Register versus existing production records metric discrepancies for Live workflow",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No active pieces are in the Piece Register"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Fabrication station setup must contain six stations totaling 100 percent",
      ),
    ).toBeInTheDocument();

    for (const rawCopy of Object.values(rpcReadinessCopy)) {
      expect(screen.queryByText(rawCopy)).not.toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));

    expect(exportToCSV).toHaveBeenCalledTimes(1);
    const exportArgs = vi.mocked(exportToCSV).mock.calls[0][0];
    const exportedText = exportArgs.rows.flat().join(" ");
    expect(exportedText).toContain(
      "Piece Register versus existing production records discrepancy: 4 pieces and 1.25 tons",
    );
    expect(exportedText).toContain(
      "2 scoped work packages currently fail the fabrication release checks",
    );
    expect(exportedText).toContain(
      "Resolve invalid import rows for Pilot workflow",
    );
    expect(exportedText).toContain(
      "Resolve meaningful Piece Register versus existing production records metric discrepancies for Live workflow",
    );
    expect(exportedText).not.toMatch(
      /canonical|legacy|release gate|before pilot|live mode/i,
    );

    expect(blockedSnapshot.report.data_quality_warnings).toEqual([
      rpcReadinessCopy.modelLinks,
      rpcReadinessCopy.discrepancy,
    ]);
    expect(blockedSnapshot.report.hard_release_blockers).toEqual([
      rpcReadinessCopy.releaseChecks,
    ]);
  });

  it("sanitizes blocked workflow mutation errors", async () => {
    vi.mocked(setPieceControlMode).mockRejectedValue(
      new Error(
        'Pilot transition blocked: ["No active actionable canonical piece scope"]',
      ),
    );
    renderReadiness();

    fireEvent.change(await screen.findByRole("combobox"), {
      target: { value: "pilot" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("Type: CHANGE SHADOW TO PILOT"),
      { target: { value: "CHANGE SHADOW TO PILOT" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm mode change" }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Pilot workflow is blocked. Review the readiness checks and try again.",
      ),
    );
    expect(toast.error).not.toHaveBeenCalledWith(
      expect.stringMatching(/canonical|transition blocked/i),
    );
  });
});
