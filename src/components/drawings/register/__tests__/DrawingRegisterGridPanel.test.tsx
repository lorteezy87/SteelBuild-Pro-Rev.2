// @vitest-environment jsdom
//
// Render test for the register's release affordance. Covers the field-confirmed
// bug fix: a row with no current revision must show an ENABLED "Set up revision
// tracking" button (not a dead disabled distribution select), and clicking it
// provisions a revision via ensureCurrentRevision and refetches the register. A
// row that already has a current revision shows the distribution select.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { DrawingRegisterRow } from "@/hooks/useDrawingRegister";
import type { DrawingRegisterGridPanelProps } from "../DrawingRegisterGridPanel";
import type { DrawingSet, SetPackage } from "@/pages/drawingSubmittalHub/types";
import { buildSetPackages } from "@/pages/drawingSubmittalHub/format";

const ensureCurrentRevision = vi.fn().mockResolvedValue({ id: "rev-new", is_current: true });
const invalidateQueries = vi.fn();
const setEvidence = vi.hoisted(() => ({
  gate: { isPending: true, isError: false, isFetching: false, data: null as any, refetch: vi.fn() },
  scope: { isPending: true, isError: false, isFetching: false, data: null as any, refetch: vi.fn() },
}));
let canEdit = true;

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
  usePermissions: () => ({ can: (action: string) => action === "edit" ? canEdit : true }),
}));
vi.mock("@/components/shared/useAppSecurity", () => ({
  useAppSecurity: () => ({ user: { id: "user-1", email: "pm@x.com" } }),
}));
vi.mock("../useSheetSetEvidence", () => ({
  useSheetSetEvidence: () => setEvidence,
}));
vi.mock("@/lib/drawingHub/revisions", () => ({
  ensureCurrentRevision: (...a: any[]) => ensureCurrentRevision(...a),
}));
vi.mock("@/components/drawings/RevisionUploadModal", () => ({
  default: ({ onComplete }: { onComplete: (result: { complete: boolean; failed: number }) => void }) => (
    <div role="dialog" aria-label="Revision upload">
      <span>Revision recovery controls</span>
      <button type="button" onClick={() => onComplete({ complete: false, failed: 1 })}>Partially save revision</button>
      <button type="button" onClick={() => onComplete({ complete: true, failed: 0 })}>Complete revision upload</button>
    </div>
  ),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { DrawingRegisterGridPanel } from "../DrawingRegisterGridPanel";

function makeRow(over: Partial<DrawingRegisterRow> = {}): DrawingRegisterRow {
  return {
    drawing_id: "dwg-1",
    drawing_set_id: "set-1",
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

function renderGrid(props: Partial<DrawingRegisterGridPanelProps> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.invalidateQueries = invalidateQueries as any;
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <DrawingRegisterGridPanel projectId="proj-1" {...props} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("DrawingRegisterGridPanel — release affordance", () => {
  beforeEach(() => {
    canEdit = true;
  });

  it("does not present incomplete legacy RFI and WP link counts as totals", () => {
    registerRows = [makeRow({ rfi_count: 0, work_package_count: 0 })];
    renderGrid();
    expect(screen.queryByRole("columnheader", { name: "RFIs" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "WPs" })).not.toBeInTheDocument();
  });

  it("shows unavailable impact evidence as unknown rather than zero", () => {
    registerRows = [makeRow({ open_impact_count: null, pending_review_count: null })];
    renderGrid();
    expect(screen.getAllByLabelText("Count unavailable")).toHaveLength(2);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    canEdit = true;
    ensureCurrentRevision.mockResolvedValue({ id: "rev-new", is_current: true });
  });

  it("shows an enabled provision button (not a disabled select) for a row with no current revision", () => {
    registerRows = [makeRow({ current_revision_id: null })];
    renderGrid();
    const btn = screen.getByRole("button", { name: /set up revision tracking/i });
    expect(btn).toBeEnabled();
    // The dead distribution select must NOT be present for this row.
    expect(screen.queryByRole("option", { name: "Set distribution…" })).not.toBeInTheDocument();
  });

  it("shows the Release select for a row that already has a current revision", () => {
    registerRows = [makeRow({ drawing_id: "dwg-2", current_revision_id: "rev-existing" })];
    renderGrid();
    expect(screen.getByRole("option", { name: "Set distribution…" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /set up revision tracking/i })).not.toBeInTheDocument();
  });

  it("provisions a revision on click with the mapped drawing, then invalidates the register query", async () => {
    registerRows = [makeRow({ drawing_id: "dwg-9", project_id: "proj-9", current_revision_id: null, current_revision: "B" })];
    renderGrid();
    await userEvent.click(screen.getByRole("button", { name: /set up revision tracking/i }));
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

  it("bulk-provisions every untracked row on click, then invalidates the register query once", async () => {
    registerRows = [
      makeRow({ drawing_id: "a", current_revision_id: null }),
      makeRow({ drawing_id: "b", current_revision_id: "rev-b" }), // already tracked — skipped
      makeRow({ drawing_id: "c", current_revision_id: null }),
    ];
    renderGrid();
    await userEvent.click(screen.getByRole("button", { name: /set up tracking for all \(2\)/i }));
    // One ensureCurrentRevision per UNTRACKED row (a + c), not the tracked one (b).
    await waitFor(() => expect(ensureCurrentRevision).toHaveBeenCalledTimes(2));
    const provisionedIds = ensureCurrentRevision.mock.calls.map((c) => c[0].drawing.id).sort();
    expect(provisionedIds).toEqual(["a", "c"]);
    await waitFor(() =>
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["drawing-register", "proj-1"] }),
    );
  });
});

describe("DrawingRegisterGridPanel — revision workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canEdit = true;
    registerRows = [makeRow()];
  });

  const drawingSet: DrawingSet = { id: "set-1", set_name: "Main Steel - IFC" };
  const pkg: SetPackage = {
    key: "id:set-1",
    setId: "set-1",
    name: "Main Steel - IFC",
    parent: drawingSet,
    sheets: [{ id: "dwg-1" }],
    supersededSheets: [],
    submittals: [],
  };

  it("opens a saved summary from the canonical sheet grid", async () => {
    const onOpenSummary = vi.fn();
    const summary = { setId: "set-1", sheetsChanged: 3 };
    renderGrid({
      setPackages: [pkg],
      summariesBySet: new Map([["set-1", { summary, sheets_changed: 3 } as any]]),
      onOpenSummary,
    });

    await userEvent.click(screen.getByRole("button", { name: /revised · 3/i }));
    expect(onOpenSummary).toHaveBeenCalledWith(summary);
  });

  it("opens revision upload and forwards the exact package key on completion", async () => {
    const onRevisionUploaded = vi.fn();
    renderGrid({
      activeProject: { id: "proj-1", name: "Project One" },
      drawingSets: [drawingSet],
      setPackages: [pkg],
      onRevisionUploaded,
    });

    await userEvent.click(screen.getByRole("button", { name: "Upload revision for Main Steel - IFC" }));
    await userEvent.click(await screen.findByRole("button", { name: "Complete revision upload" }));

    expect(onRevisionUploaded).toHaveBeenCalledWith("id:set-1");
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["drawing-register", "proj-1"] });
  });

  it("keeps revision recovery visible after a partial save and does not announce full completion", async () => {
    const onRevisionUploaded = vi.fn();
    renderGrid({
      activeProject: { id: "proj-1", name: "Project One" },
      drawingSets: [drawingSet], setPackages: [pkg], onRevisionUploaded,
    });
    await userEvent.click(screen.getByRole("button", { name: "Upload revision for Main Steel - IFC" }));
    await userEvent.click(await screen.findByRole("button", { name: "Partially save revision" }));

    expect(screen.getByRole("dialog", { name: "Revision upload" })).toBeInTheDocument();
    expect(screen.getByText("Revision recovery controls")).toBeInTheDocument();
    expect(onRevisionUploaded).not.toHaveBeenCalled();
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["drawing-register", "proj-1"] });
  });

  it("keeps saved summaries readable for viewers without exposing revision upload", async () => {
    canEdit = false;
    const onOpenSummary = vi.fn();
    renderGrid({
      setPackages: [pkg],
      summariesBySet: new Map([["set-1", { summary: { setId: "set-1" }, sheets_changed: 1 } as any]]),
      onOpenSummary,
    });

    expect(screen.queryByRole("button", { name: /upload revision/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /revised · 1/i }));
    expect(onOpenSummary).toHaveBeenCalledTimes(1);
  });

  it("resolves a visible sheet from its canonical set ID when the hub drawing list is truncated", () => {
    const truncatedPackage: SetPackage = { ...pkg, sheets: [] };
    renderGrid({
      setPackages: [truncatedPackage],
      summariesBySet: new Map([["set-1", { summary: { setId: "set-1" }, sheets_changed: 2 } as any]]),
      onOpenSummary: vi.fn(),
    });

    expect(screen.getByRole("button", { name: /revised · 2/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload revision for Main Steel - IFC" })).toBeInTheDocument();
  });

  it("resolves revision actions for superseded sheets", () => {
    registerRows = [makeRow({ drawing_set_id: null })];
    const supersededPackage: SetPackage = { ...pkg, sheets: [], supersededSheets: [{ id: "dwg-1", is_superseded: true }] };
    renderGrid({
      setPackages: [supersededPackage],
      summariesBySet: new Map([["set-1", { summary: { setId: "set-1" }, sheets_changed: 1 } as any]]),
      onOpenSummary: vi.fn(),
    });

    expect(screen.getByRole("button", { name: /revised · 1/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload revision for Main Steel - IFC" })).toBeInTheDocument();
  });
});

describe("DrawingRegisterGridPanel — large registers", () => {
  let rectSpy: ReturnType<typeof vi.spyOn>;
  let originalResizeObserver: typeof window.ResizeObserver;

  beforeEach(() => {
    originalResizeObserver = window.ResizeObserver;
    window.ResizeObserver = class {
      private readonly callback: ResizeObserverCallback;

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }

      observe(target: Element) {
        const rect = target.getBoundingClientRect();
        this.callback([{
          target,
          contentRect: rect,
          borderBoxSize: [{
            inlineSize: rect.width,
            blockSize: rect.height,
          }],
        } as unknown as ResizeObserverEntry], this);
      }

      unobserve() {}
      disconnect() {}
    };
    rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function getBoundingClientRect() {
        const height = this.getAttribute("data-testid") === "drawing-register-virtual-body"
          ? 600
          : 54;
        return {
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          right: 1400,
          bottom: height,
          width: 1400,
          height,
          toJSON: () => ({}),
        };
      });
    vi.clearAllMocks();
    canEdit = true;
    registerRows = Array.from({ length: 150 }, (_, index) => {
      const sequence = String(index + 1).padStart(3, "0");
      return makeRow({
        drawing_id: `dwg-${sequence}`,
        sheet_number: `S${sequence}`,
        sheet_title: `Framing level ${sequence}`,
        current_revision_id: `rev-${sequence}`,
      });
    });

    afterEach(() => {
      rectSpy.mockRestore();
      window.ResizeObserver = originalResizeObserver;
    });
  });

  it("virtualizes the row body while preserving accessible headers and visible controls", () => {
    renderGrid();

    expect(screen.getByRole("table", { name: "Drawing Register" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Sheet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "S001" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View S001" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "S150" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("row").length).toBeLessThan(registerRows.length);
  });

  it("can inspect a visible virtualized sheet without navigating away or bulk-selecting it", async () => {
    renderGrid();

    await userEvent.click(screen.getByRole("button", { name: "Inspect sheet S002" }));
    expect(within(screen.getByRole("complementary", { name: "Sheet context" }))
      .getByRole("heading", { name: "S002" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "S002" })).toHaveAttribute("href", "/DrawingViewer?recordId=dwg-002");
  });

  it("keeps filtering and grouped expansion controls functional across virtualization", async () => {
    const user = userEvent.setup();
    const view = renderGrid();

    await user.type(screen.getByPlaceholderText("Filter sheet, title, discipline, set…"), "S150");
    expect(screen.getByRole("link", { name: "S150" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View S150" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "S001" })).not.toBeInTheDocument();

    view.unmount();
    registerRows = registerRows.map((row) => ({ ...row, drawing_set_name: "Main Steel - IFC" }));
    renderGrid();
    await user.click(screen.getByRole("button", { name: "Group by set" }));
    const groupToggle = screen.getByRole("button", { name: /main steel - ifc.*150 sheets/i });
    expect(groupToggle).toHaveAttribute("aria-expanded", "true");
    await user.click(groupToggle);
    expect(groupToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "S001" })).not.toBeInTheDocument();
  });
});

describe("DrawingRegisterGridPanel — selected sheet context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canEdit = true;
    setEvidence.gate.isPending = true;
    setEvidence.gate.isError = false;
    setEvidence.gate.isFetching = false;
    setEvidence.gate.data = null;
    setEvidence.scope.isPending = true;
    setEvidence.scope.isError = false;
    setEvidence.scope.isFetching = false;
    setEvidence.scope.data = null;
  });

  describe("Inspect sheet on narrow screens", () => {
    const queuedFrames: FrameRequestCallback[] = [];
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");

    beforeEach(() => {
      queuedFrames.length = 0;
      registerRows = [
        makeRow({ drawing_id: "dwg-1", sheet_number: "S101" }),
        makeRow({ drawing_id: "dwg-2", sheet_number: "S102" }),
      ];
      vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
        queuedFrames.push(callback);
        return queuedFrames.length;
      });
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
        configurable: true,
        value: scrollIntoView,
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      scrollIntoView.mockClear();
      if (originalScrollIntoView) {
        Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScrollIntoView);
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
      }
    });

    it("moves focus and the viewport to the selected context below a stacked register", async () => {
      const matchMedia = vi.fn(() => ({ matches: true }));
      vi.stubGlobal("matchMedia", matchMedia);
      renderGrid();

      const context = screen.getByRole("complementary", { name: "Sheet context" });
      await userEvent.click(screen.getByRole("button", { name: "Inspect sheet S102" }));
      expect(within(context).getByRole("heading", { name: "S102" })).toBeInTheDocument();
      expect(matchMedia).toHaveBeenCalledWith("(max-width: 1100px)");
      expect(queuedFrames).toHaveLength(1);

      queuedFrames[0](0);
      expect(context).toHaveFocus();
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    });

    it("leaves the viewport and focus alone when context is beside the register", async () => {
      vi.stubGlobal("matchMedia", () => ({ matches: false }));
      renderGrid();

      await userEvent.click(screen.getByRole("button", { name: "Inspect sheet S102" }));
      expect(within(screen.getByRole("complementary", { name: "Sheet context" }))
        .getByRole("heading", { name: "S102" })).toBeInTheDocument();
      expect(queuedFrames).toHaveLength(0);
      expect(scrollIntoView).not.toHaveBeenCalled();
      expect(screen.getByRole("complementary", { name: "Sheet context" })).not.toHaveFocus();
    });
  });

  it("keeps revision distribution separate from governed approval and fabrication release", async () => {
    registerRows = [
      makeRow({ drawing_id: "dwg-1", sheet_number: "S101", current_revision_id: "rev-1", current_revision: "A" }),
      makeRow({ drawing_id: "dwg-2", sheet_number: "S102", current_revision_id: "rev-2", current_revision: "B", current_status: "released_for_shop", drawing_set_id: "set-2", drawing_set_name: "Tower framing" }),
    ];
    const pkg: SetPackage = {
      key: "id:set-2",
      setId: "set-2",
      name: "Tower framing",
      parent: { id: "set-2", set_name: "Tower framing" },
      sheets: [{ id: "dwg-2" }],
      supersededSheets: [],
      submittals: [{ id: "sub-2", status: "Approved as Noted", ball_in_court: "Detailer", round_number: 2, drawing_set_ids: ["set-2"] }],
    };
    setEvidence.gate.isPending = false;
    setEvidence.gate.data = {
      ok: false, blockers: [], blockingRfiNumbers: [], evaluatedAt: "2026-10-07T00:00:00Z",
      submittalId: "sub-2", submittalNumber: "SD-2", governingStage: "OFS",
    };
    renderGrid({ setPackages: [pkg] });
    expect(screen.getByRole("columnheader", { name: "Distribution" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Inspect sheet S102" }));
    const context = screen.getByRole("complementary", { name: "Sheet context" });
    expect(within(context).getByRole("heading", { name: "S102" })).toBeInTheDocument();
    expect(within(context).getByText("Revision B")).toBeInTheDocument();
    expect(within(context).getByText("Shop distribution")).toBeInTheDocument();
    expect(within(context).getByText("OFS")).toBeInTheDocument();
    expect(within(context).getByText("Set approval stage")).toBeInTheDocument();
    expect(within(context).getByText(/ball in court: detailer/i)).toBeInTheDocument();
    expect(within(context).getByRole("link", { name: /open governing submittal/i }))
      .toHaveAttribute("href", "/DrawingSubmittalHub?hub_tab=submittals&recordId=sub-2");
    expect(within(context).getByText("Not verified", { selector: "[data-evidence='fab-release']" })).toBeInTheDocument();
    expect(within(context).getByRole("link", { name: /open fab release check/i }))
      .toHaveAttribute("href", "/FabRelease");
    expect(within(context).getByText("Drawing-set gate")).toBeInTheDocument();
    expect(within(context).getByText("Canonical linked scope")).toBeInTheDocument();
  });

  it("uses the server-selected governing record even when client package order differs", async () => {
    registerRows = [makeRow()];
    const pkg: SetPackage = {
      key: "id:set-1", setId: "set-1", name: "Main Steel - IFC",
      parent: { id: "set-1" }, sheets: [{ id: "dwg-1" }], supersededSheets: [],
      submittals: [
        { id: "client-newer", status: "Approved", ball_in_court: "GC", round_number: 3, drawing_set_ids: ["set-1"] },
        { id: "server-governing", status: "Approved as Noted", ball_in_court: "Detailer", round_number: 2, drawing_set_ids: ["set-1"] },
      ],
    };
    setEvidence.gate.isPending = false;
    setEvidence.gate.data = {
      ok: false, blockers: [], blockingRfiNumbers: [], evaluatedAt: "2026-10-07T00:00:00Z",
      submittalId: "server-governing", submittalNumber: "SD-2", governingStage: "OFS",
    };
    renderGrid({ setPackages: [pkg] });

    const context = screen.getByRole("complementary", { name: "Sheet context" });
    expect(within(context).getByText("OFS", { selector: "[data-evidence='approval']" })).toBeInTheDocument();
    expect(within(context).getByText(/ball in court: detailer/i)).toBeInTheDocument();
    expect(within(context).getByRole("link", { name: "Open governing submittal" }))
      .toHaveAttribute("href", "/DrawingSubmittalHub?hub_tab=submittals&recordId=server-governing");
  });

  it("links a server-governing record without inventing ball-in-court when the cache lacks it", () => {
    registerRows = [makeRow()];
    setEvidence.gate.isPending = false;
    setEvidence.gate.data = {
      ok: false, blockers: [], blockingRfiNumbers: [], evaluatedAt: "2026-10-07T00:00:00Z",
      submittalId: "server-only", submittalNumber: "SD-8", governingStage: "OFA",
    };
    renderGrid({ setPackages: [{
      key: "id:set-1", setId: "set-1", name: "Main Steel - IFC",
      parent: { id: "set-1" }, sheets: [{ id: "dwg-1" }], supersededSheets: [], submittals: [],
    }] });

    const context = screen.getByRole("complementary", { name: "Sheet context" });
    expect(within(context).getByText("OFA", { selector: "[data-evidence='approval']" })).toBeInTheDocument();
    expect(within(context).getByText(/SD-8 · Ball in court: Not verified/)).toBeInTheDocument();
    expect(within(context).getByRole("link", { name: "Open governing submittal" }))
      .toHaveAttribute("href", "/DrawingSubmittalHub?hub_tab=submittals&recordId=server-only");
  });

  it("leaves approval unverified when the server gate is unavailable despite a client submittal", () => {
    registerRows = [makeRow()];
    setEvidence.gate.isPending = false;
    setEvidence.gate.isError = true;
    const pkg: SetPackage = {
      key: "id:set-1", setId: "set-1", name: "Main Steel - IFC",
      parent: { id: "set-1" }, sheets: [{ id: "dwg-1" }], supersededSheets: [],
      submittals: [{ id: "client-approved", status: "Approved", ball_in_court: "GC", drawing_set_ids: ["set-1"] }],
    };
    renderGrid({ setPackages: [pkg] });

    const context = screen.getByRole("complementary", { name: "Sheet context" });
    expect(within(context).getByText("Not verified", { selector: "[data-evidence='approval']" })).toBeInTheDocument();
    expect(within(context).queryByRole("link", { name: "Open governing submittal" })).not.toBeInTheDocument();
    expect(within(context).getByText("Unavailable", { selector: "[data-evidence='drawing-set-gate']" })).toBeInTheDocument();
  });

  it("treats a name-only legacy submittal as historical evidence, never governing approval", async () => {
    registerRows = [makeRow({ drawing_id: "dwg-2", drawing_set_id: "set-2", drawing_set_name: "Tower framing" })];
    const packages = buildSetPackages(
      [{ id: "dwg-2", drawing_set_id: "set-2", drawing_set_name: "Tower framing" }] as any,
      [{ id: "set-2", set_name: "Tower framing" }] as any,
      [{ id: "legacy", status: "Approved", ball_in_court: "GC", drawing_set_name: "Tower framing", drawing_set_ids: [] }] as any,
    );
    renderGrid({ setPackages: packages });

    await userEvent.click(screen.getByRole("button", { name: "Inspect sheet S101" }));
    const context = screen.getByRole("complementary", { name: "Sheet context" });
    expect(within(context).getByText("Not verified", { selector: "[data-evidence='approval']" })).toBeInTheDocument();
    expect(within(context).queryByRole("link", { name: /open governing submittal/i })).not.toBeInTheDocument();
    expect(within(context).getByText(/historical name-only match.*unverified/i)).toBeInTheDocument();
    expect(within(context).getByRole("link", { name: /open historical submittal/i }))
      .toHaveAttribute("href", "/DrawingSubmittalHub?hub_tab=submittals&recordId=legacy");
  });

  it("routes set-linked Product Data and untyped records to Shop Drawing classification", () => {
    registerRows = [makeRow()];
    const packages = buildSetPackages(
      [{ id: "dwg-1", drawing_set_id: "set-1", drawing_set_name: "Main Steel - IFC" }] as any,
      [{ id: "set-1", set_name: "Main Steel - IFC" }] as any,
      [
        { id: "product-data", submittal_type: "Product Data", status: "Approved", submitted_date: "2026-10-01", drawing_set_ids: ["set-1"] },
        { id: "untyped", submittal_type: null, status: "Approved", submitted_date: "2026-10-02", drawing_set_ids: ["set-1"] },
      ] as any,
    );
    setEvidence.gate.isPending = false;
    setEvidence.gate.data = {
      ok: false,
      blockers: [{ kind: "no_submittal", title: "No Shop Drawing submittal governs this package" }],
      blockingRfiNumbers: [], evaluatedAt: "2026-10-07T00:00:00Z",
      submittalId: null, submittalNumber: null, governingStage: "Not Started",
    };
    renderGrid({ setPackages: packages });

    const context = screen.getByRole("complementary", { name: "Sheet context" });
    expect(within(context).getByText("Not verified", { selector: "[data-evidence='approval']" })).toBeInTheDocument();
    expect(within(context).getByText(/2 set-ID-linked records do not govern Shop Drawing approval/i)).toBeInTheDocument();
    expect(within(context).getByText(/classify one as Shop Drawing if appropriate, or create\/link/i)).toBeInTheDocument();
    expect(within(context).getByRole("link", { name: "Classify linked record as Shop Drawing" }))
      .toHaveAttribute("href", "/DrawingSubmittalHub?hub_tab=submittals&recordId=untyped");
    expect(within(context).getByRole("link", { name: "Create or link a Shop Drawing submittal" }))
      .toHaveAttribute("href", "/DrawingSubmittalHub?hub_tab=submittals&targetSetId=set-1");
    expect(within(context).queryByText(/historical name-only match/i)).not.toBeInTheDocument();
  });

  it("does not assert a governed approval when the selected sheet itself has no set ID", async () => {
    registerRows = [makeRow({ drawing_set_id: null })];
    const pkg: SetPackage = {
      key: "id:set-1", setId: "set-1", name: "Main Steel - IFC",
      parent: { id: "set-1", set_name: "Main Steel - IFC" },
      sheets: [{ id: "dwg-1" }], supersededSheets: [],
      submittals: [{ id: "approved", status: "Approved", ball_in_court: "GC", drawing_set_ids: ["set-1"] }],
    };
    renderGrid({ setPackages: [pkg] });

    await userEvent.click(screen.getByRole("button", { name: "Inspect sheet S101" }));
    const context = screen.getByRole("complementary", { name: "Sheet context" });
    expect(within(context).getByText("Not verified", { selector: "[data-evidence='approval']" })).toBeInTheDocument();
    expect(within(context).queryByRole("link", { name: /open governing submittal/i })).not.toBeInTheDocument();
    expect(within(context).getByText(/set link not verified/i)).toBeInTheDocument();
  });

  it("shows unknown link evidence honestly while surfacing an active hold", () => {
    registerRows = [makeRow({
      current_revision_id: "rev-1",
      current_revision: "A",
      current_status: "released_for_shop",
      active_hold_id: "hold-1",
      active_hold_reason: "EOR connection clarification",
      rfi_count: 0,
      work_package_count: 0,
    })];
    renderGrid();

    const context = screen.getByRole("complementary", { name: "Sheet context" });
    expect(within(context).getByText("Not verified", { selector: "[data-evidence='approval']" })).toBeInTheDocument();
    expect(within(context).getByText("1 active", { selector: "[data-evidence='hold']" })).toBeInTheDocument();
    expect(within(context).getByText("EOR connection clarification")).toBeInTheDocument();
    expect(within(context).getByText("Not verified", { selector: "[data-evidence='rfi']" })).toBeInTheDocument();
    expect(within(context).getByText("Not verified", { selector: "[data-evidence='work-package']" })).toBeInTheDocument();
  });

  it("qualifies positive legacy links as minimum counts", () => {
    registerRows = [makeRow({ rfi_count: 2, work_package_count: 3 })];
    renderGrid();

    const context = screen.getByRole("complementary", { name: "Sheet context" });
    expect(within(context).getByText("At least 2 linked", { selector: "[data-evidence='rfi']" })).toBeInTheDocument();
    expect(within(context).getByText("At least 3 linked", { selector: "[data-evidence='work-package']" })).toBeInTheDocument();
  });

  it("shows selected-set server blockers and exact active canonical lot scope", () => {
    registerRows = [makeRow({ current_revision_id: "rev-1" })];
    setEvidence.gate.isPending = false;
    setEvidence.gate.data = {
      ok: false,
      blockers: [{ kind: "active_holds", title: "1 sheet on hold" }],
      blockingRfiNumbers: ["RFI-11"],
      evaluatedAt: "2026-10-07T01:00:00Z",
    };
    setEvidence.scope.isPending = false;
    setEvidence.scope.data = {
      linkedLeafLotCount: 2,
      unassignedLeafLotCount: 0,
      unresolvedWorkPackageCount: 0,
      workPackages: [{ id: "wp-1", wp_number: "WP-014", name: "Level 3", leafLotCount: 2 }],
    };
    const pkg: SetPackage = {
      key: "id:set-1", setId: "set-1", name: "Main Steel - IFC",
      parent: { id: "set-1" }, sheets: [{ id: "dwg-1" }], supersededSheets: [], submittals: [],
    };
    renderGrid({ setPackages: [pkg] });

    const context = screen.getByRole("complementary", { name: "Sheet context" });
    expect(within(context).getByText("Blocked · 1 issue", { selector: "[data-evidence='drawing-set-gate']" })).toBeInTheDocument();
    expect(within(context).getByText("1 sheet on hold")).toBeInTheDocument();
    expect(within(context).getByText("2 leaf lots · 1 active work package", { selector: "[data-evidence='canonical-scope']" })).toBeInTheDocument();
    expect(within(context).getByRole("link", { name: "WP-014 · 2 linked lots" }))
      .toHaveAttribute("href", "/PieceRegister?wp=wp-1");
    expect(within(context).getByText("Not verified", { selector: "[data-evidence='fab-release']" })).toBeInTheDocument();
  });

  it("distinguishes selected-set loading and unavailable reads from a clear result", async () => {
    registerRows = [makeRow()];
    const pkg: SetPackage = {
      key: "id:set-1", setId: "set-1", name: "Main Steel - IFC",
      parent: { id: "set-1" }, sheets: [{ id: "dwg-1" }], supersededSheets: [], submittals: [],
    };
    const view = renderGrid({ setPackages: [pkg] });
    let context = screen.getByRole("complementary", { name: "Sheet context" });
    expect(within(context).getByText("Checking…", { selector: "[data-evidence='drawing-set-gate']" })).toBeInTheDocument();
    expect(within(context).getByText("Loading…", { selector: "[data-evidence='canonical-scope']" })).toBeInTheDocument();

    view.unmount();
    setEvidence.gate.isPending = false;
    setEvidence.gate.isError = true;
    setEvidence.scope.isPending = false;
    setEvidence.scope.isError = true;
    renderGrid({ setPackages: [pkg] });
    context = screen.getByRole("complementary", { name: "Sheet context" });
    expect(within(context).getAllByText("Unavailable")).toHaveLength(2);
    await userEvent.click(within(context).getByRole("button", { name: "Retry set check" }));
    expect(setEvidence.gate.refetch).toHaveBeenCalledTimes(1);
  });

  it("hides cached approval and scope after a failed refresh", () => {
    registerRows = [makeRow()];
    setEvidence.gate.isPending = false;
    setEvidence.gate.isError = true;
    setEvidence.gate.data = {
      ok: true, blockers: [], blockingRfiNumbers: [], evaluatedAt: "2026-10-07T00:00:00Z",
      submittalId: "stale-approved", submittalNumber: "SD-1", governingStage: "IFC",
    };
    setEvidence.scope.isPending = false;
    setEvidence.scope.isError = true;
    setEvidence.scope.data = {
      linkedLeafLotCount: 2, unassignedLeafLotCount: 0, splitParentSetLinks: 0,
      unresolvedWorkPackageCount: 0,
      workPackages: [{ id: "wp-stale", wp_number: "WP-1", name: "Stale", leafLotCount: 2 }],
    };
    renderGrid({ setPackages: [{
      key: "id:set-1", setId: "set-1", name: "Main Steel - IFC",
      parent: { id: "set-1" }, sheets: [{ id: "dwg-1" }], supersededSheets: [],
      submittals: [{ id: "stale-approved", status: "Approved", ball_in_court: "GC", drawing_set_ids: ["set-1"] }],
    }] });

    const context = screen.getByRole("complementary", { name: "Sheet context" });
    expect(within(context).getByText("Not verified", { selector: "[data-evidence='approval']" })).toBeInTheDocument();
    expect(within(context).getByText("Unavailable", { selector: "[data-evidence='canonical-scope']" })).toBeInTheDocument();
    expect(within(context).getByText("Unavailable", { selector: "[data-evidence='drawing-set-gate']" })).toBeInTheDocument();
    expect(within(context).queryByRole("link", { name: "Open governing submittal" })).not.toBeInTheDocument();
    expect(within(context).queryByRole("link", { name: /WP-1/ })).not.toBeInTheDocument();
  });

  it("hides a cached clear set check while release inputs are refreshing", () => {
    registerRows = [makeRow()];
    setEvidence.gate.isPending = false;
    setEvidence.gate.isError = false;
    setEvidence.gate.isFetching = true;
    setEvidence.gate.data = {
      ok: true, blockers: [], blockingRfiNumbers: [], evaluatedAt: "2026-10-07T00:00:00Z",
      submittalId: "old-approval", submittalNumber: "SD-1", governingStage: "IFC",
    };
    const pkg: SetPackage = {
      key: "id:set-1", setId: "set-1", name: "Main Steel - IFC",
      parent: { id: "set-1" }, sheets: [{ id: "dwg-1" }], supersededSheets: [],
      submittals: [{ id: "old-approval", status: "Approved", drawing_set_ids: ["set-1"] }],
    };
    renderGrid({ setPackages: [pkg] });

    const context = screen.getByRole("complementary", { name: "Sheet context" });
    expect(within(context).getByText("Checking…", { selector: "[data-evidence='drawing-set-gate']" })).toBeInTheDocument();
    expect(within(context).getByText("Not verified", { selector: "[data-evidence='approval']" })).toBeInTheDocument();
    expect(within(context).queryByRole("link", { name: "Open governing submittal" })).not.toBeInTheDocument();
  });

  it("hides cached lot and work-package scope while relationships are refreshing", () => {
    registerRows = [makeRow()];
    setEvidence.scope.isPending = false;
    setEvidence.scope.isFetching = true;
    setEvidence.scope.data = {
      linkedLeafLotCount: 2, unassignedLeafLotCount: 0, splitParentSetLinks: 0,
      unresolvedWorkPackageCount: 0,
      workPackages: [{ id: "wp-stale", wp_number: "WP-1", name: "Stale", leafLotCount: 2 }],
    };
    renderGrid({ setPackages: [{
      key: "id:set-1", setId: "set-1", name: "Main Steel - IFC",
      parent: { id: "set-1" }, sheets: [{ id: "dwg-1" }], supersededSheets: [], submittals: [],
    }] });

    const context = screen.getByRole("complementary", { name: "Sheet context" });
    expect(within(context).getByText("Checking…", { selector: "[data-evidence='canonical-scope']" })).toBeInTheDocument();
    expect(within(context).queryByRole("link", { name: /WP-1/ })).not.toBeInTheDocument();
  });
});
