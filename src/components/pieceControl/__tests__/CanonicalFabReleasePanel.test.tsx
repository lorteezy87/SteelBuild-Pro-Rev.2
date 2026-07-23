// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import {
  evaluateCanonicalReleaseGate,
  releaseCanonicalWorkPackage,
  type CanonicalReleaseGate,
} from "@/lib/pieceControl/releaseRepository";
import CanonicalFabReleasePanel from "../CanonicalFabReleasePanel";

vi.mock("@/lib/pieceControl/releaseRepository", () => ({
  evaluateCanonicalReleaseGate: vi.fn(),
  releaseCanonicalWorkPackage: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

const canonicalScopeBlocker =
  "No active, actionable canonical leaf pieces are assigned to this work package.";

const blockedGate: CanonicalReleaseGate = {
  work_package_id: "wp-1",
  project_id: "project-1",
  passes: false,
  already_released: false,
  checks: {
    scope: { passed: false, blockers: [canonicalScopeBlocker] },
    drawings: { passed: true, blockers: [] },
    material: { passed: true, blockers: [] },
    holds: { passed: true, blockers: [] },
  },
  blockers: [],
  evaluated_at: "2026-07-23T12:00:00.000Z",
};

function renderPanel(pieceControlMode = "shadow") {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <CanonicalFabReleasePanel
        projectId="project-1"
        workPackageId="wp-1"
        pieceControlMode={pieceControlMode}
      />
    </QueryClientProvider>,
  );
}

describe("CanonicalFabReleasePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(evaluateCanonicalReleaseGate).mockResolvedValue(blockedGate);
  });

  it("uses Piece Register language when fabrication release is unavailable", () => {
    renderPanel("off");

    expect(
      screen.getByText(
        "Fabrication release is unavailable until the Piece Register is set up.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/piece control is off/i)).not.toBeInTheDocument();
    expect(evaluateCanonicalReleaseGate).not.toHaveBeenCalled();
  });

  it("uses operational fabrication-release and piece-scope labels", async () => {
    renderPanel();

    expect(
      await screen.findByRole("heading", { name: "Fabrication release" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Piece scope")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Missing active piece scope is a hard block and cannot be overridden.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No active pieces are assigned to this work package."),
    ).toBeInTheDocument();
    expect(screen.queryByText(canonicalScopeBlocker)).not.toBeInTheDocument();
    expect(screen.queryByText(/canonical/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/release gate/i)).not.toBeInTheDocument();
  });

  it("uses plain operational query error copy", async () => {
    vi.mocked(evaluateCanonicalReleaseGate).mockRejectedValue(
      new Error("Network unavailable"),
    );
    renderPanel();

    expect(
      await screen.findByText("Fabrication release could not be evaluated."),
    ).toBeInTheDocument();
  });

  it("uses plain operational mutation error copy", async () => {
    vi.mocked(evaluateCanonicalReleaseGate).mockResolvedValue({
      ...blockedGate,
      passes: true,
      checks: {
        ...blockedGate.checks,
        scope: { passed: true, blockers: [] },
      },
    });
    vi.mocked(releaseCanonicalWorkPackage).mockRejectedValue(
      new Error(
        "CANONICAL_RELEASE_NO_SCOPE: A release exception cannot bypass missing canonical piece scope",
      ),
    );

    renderPanel();

    fireEvent.click(
      await screen.findByRole("button", { name: "Release for fabrication" }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Fabrication release requires active pieces assigned to this work package.",
      ),
    );
  });

  it("associates the exception reason label with a stable textarea id", async () => {
    vi.mocked(evaluateCanonicalReleaseGate).mockResolvedValue({
      ...blockedGate,
      checks: {
        ...blockedGate.checks,
        scope: { passed: true, blockers: [] },
        drawings: { passed: false, blockers: ["Shop drawings are incomplete."] },
      },
      blockers: ["Shop drawings are incomplete."],
    });

    renderPanel();

    fireEvent.click(
      await screen.findByRole("button", { name: "Release with exception" }),
    );

    expect(
      screen.getByLabelText("Required exception reason"),
    ).toHaveAttribute("id", "piece-release-exception-reason-wp-1");
  });
});
