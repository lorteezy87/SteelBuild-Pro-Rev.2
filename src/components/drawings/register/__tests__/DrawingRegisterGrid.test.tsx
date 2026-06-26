// @vitest-environment jsdom
//
// Render test for the register's release affordance. Covers the field-confirmed
// bug fix: a row with no current revision must show an ENABLED "Set up release
// tracking" button (not a dead disabled "Release…" select), and clicking it
// provisions a revision via ensureCurrentRevision and refetches the register. A
// row that already has a current revision shows the normal Release select.

import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DrawingRegisterRow } from "@/hooks/useDrawingRegister";

const ensureCurrentRevision = vi.fn().mockResolvedValue({ id: "rev-new", is_current: true });
const invalidateQueries = vi.fn();

let registerRows: DrawingRegisterRow[] = [];

vi.mock("@/hooks/useDrawingRegister", () => ({
  useDrawingRegister: () => ({ data: registerRows, isLoading: false, error: null as Error | null }),
}));
vi.mock("@/hooks/usePublishRevision", () => ({
  usePublishRevision: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useDrawingWatch", () => ({
  useMyDrawingWatches: () => ({ data: new Set() }),
  useToggleDrawingWatch: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/services/permissions", () => ({
  usePermissions: () => ({ can: () => true }), // PM+ — release column visible
}));
vi.mock("@/components/shared/useAppSecurity", () => ({
  useAppSecurity: () => ({ user: { id: "user-1", email: "pm@x.com" } }),
}));
vi.mock("@/lib/drawingHub/revisions", () => ({
  ensureCurrentRevision: (...a: any[]) => ensureCurrentRevision(...a),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { DrawingRegisterGrid } from "../DrawingRegisterGrid";

function makeRow(over: Partial<DrawingRegisterRow> = {}): DrawingRegisterRow {
  return {
    drawing_id: "dwg-1",
    project_id: "proj-1",
    sheet_number: "S101",
    sheet_title: "First Floor Framing",
    discipline: "S",
    drawing_set_name: "Main Steel - IFC",
    stage: "IFC",
    current_revision_id: null,
    current_revision: "A",
    current_status: null,
    current_issued_at: null,
    open_impact_count: 0,
    pending_review_count: 0,
    rfi_count: 0,
    work_package_count: 0,
    last_activity: null,
    ...over,
  };
}

function renderGrid() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.invalidateQueries = invalidateQueries as any;
  return render(
    <QueryClientProvider client={qc}>
      <DrawingRegisterGrid projectId="proj-1" />
    </QueryClientProvider>,
  );
}

describe("DrawingRegisterGrid — release affordance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureCurrentRevision.mockResolvedValue({ id: "rev-new", is_current: true });
  });

  it("shows an enabled provision button (not a disabled select) for a row with no current revision", () => {
    registerRows = [makeRow({ current_revision_id: null })];
    renderGrid();
    const btn = screen.getByRole("button", { name: /set up release tracking/i });
    expect(btn).toBeEnabled();
    // The dead Release… select must NOT be present for this row.
    expect(screen.queryByRole("option", { name: "Release…" })).not.toBeInTheDocument();
  });

  it("shows the Release select for a row that already has a current revision", () => {
    registerRows = [makeRow({ drawing_id: "dwg-2", current_revision_id: "rev-existing" })];
    renderGrid();
    expect(screen.getByRole("option", { name: "Release…" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /set up release tracking/i })).not.toBeInTheDocument();
  });

  it("provisions a revision on click with the mapped drawing, then invalidates the register query", async () => {
    registerRows = [makeRow({ drawing_id: "dwg-9", project_id: "proj-9", current_revision_id: null, current_revision: "B" })];
    renderGrid();
    await userEvent.click(screen.getByRole("button", { name: /set up release tracking/i }));
    await waitFor(() => expect(ensureCurrentRevision).toHaveBeenCalledTimes(1));
    expect(ensureCurrentRevision).toHaveBeenCalledWith({
      drawing: expect.objectContaining({ id: "dwg-9", project_id: "proj-9", revision: "B" }),
      userId: "user-1",
    });
    await waitFor(() =>
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["drawing-register", "proj-1"] }),
    );
  });

  it("offers a bulk 'set up tracking for all' action counting only untracked rows", () => {
    registerRows = [
      makeRow({ drawing_id: "a", current_revision_id: null }),
      makeRow({ drawing_id: "b", current_revision_id: "rev-b" }),
      makeRow({ drawing_id: "c", current_revision_id: null }),
    ];
    renderGrid();
    expect(screen.getByRole("button", { name: /set up tracking for all \(2\)/i })).toBeInTheDocument();
  });
});
