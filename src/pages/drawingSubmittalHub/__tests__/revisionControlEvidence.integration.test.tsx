// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import RevisionImpactViews from "../RevisionImpactViews";

vi.mock("@/api/supabaseClient", () => ({ entities: {} }));
vi.mock("@/services/permissions", () => ({ usePermissions: () => ({ can: () => true }) }));
vi.mock("@/hooks/useDrawingRegister", () => ({ useDrawingRegister: () => ({ data: [], isLoading: false }) }));
vi.mock("@/hooks/useDrawingImpacts", () => ({ useDrawingImpacts: () => ({ data: [], isLoading: false, error: null }) }));

const row = {
  revisionId: "r1",
  drawingId: "d1",
  sheetNumber: "S-101",
  severity: "unknown",
  wpNames: [],
  rfiCount: 0,
  openRfiCount: 0,
  affectedPieces: null,
  modelScope: { state: "not_loaded", affectedPieces: null, reasonCode: "MODEL_ROSTER_NOT_LOADED" },
  revisionControl: {
    status: "review_required",
    reasons: [{ code: "MODEL_ROSTER_NOT_LOADED", message: "Model roster is not loaded.", severity: "review_required" }],
  },
};

describe("revision-control evidence routing", () => {
  it("does not request the full roster until mapping evidence is explicitly requested", async () => {
    const user = userEvent.setup();
    const onLoadMappingEvidence = vi.fn();
    render(
      <MemoryRouter initialEntries={["/DrawingSubmittalHub?hub_tab=revimpact"]}>
        <QueryClientProvider client={new QueryClient()}>
          <RevisionImpactViews
            projectId="p1"
            rows={[row]}
            rosterState="not_loaded"
            onLoadMappingEvidence={onLoadMappingEvidence}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    expect(onLoadMappingEvidence).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /load mapping evidence/i }));
    expect(onLoadMappingEvidence).toHaveBeenCalledTimes(1);
  });
});
