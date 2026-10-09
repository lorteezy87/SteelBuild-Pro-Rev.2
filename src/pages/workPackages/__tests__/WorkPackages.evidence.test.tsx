// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import type { WorkPackage } from "../types";
import type WpControlCenter from "../WpControlCenter";

const mocks = vi.hoisted(() => ({
  projectId: "project-1" as string | null,
  projects: vi.fn(), packages: vi.fn(), drawings: vi.fn(), drawingSets: vi.fn(), submittals: vi.fn(), deliveries: vi.fn(), releases: vi.fn(), pieces: vi.fn(), pieceDrawingSets: vi.fn(), pieceDrawings: vi.fn(), update: vi.fn(), create: vi.fn(),
  lastStatusAction: null as null | (() => void),
  lastSave: null as null | ((data: Record<string, unknown>) => void),
  lastBulkSave: null as null | ((rows: Record<string, unknown>[]) => void),
  formPieceDriven: undefined as boolean | undefined,
}));

vi.mock("@/api/supabaseClient", () => ({ entities: {
  Project: { list: mocks.projects },
  WorkPackage: { filterAll: mocks.packages, update: mocks.update, create: mocks.create },
  Drawing: { list: mocks.drawings },
  Delivery: { filterAll: mocks.deliveries },
} }));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/pieceControl/pagedSelect", () => ({
  fetchAllProjectRowsPaged: (_client: unknown, table: string, projectId: string, options: unknown) => {
    const readers: Record<string, typeof mocks.drawings> = {
      drawings: mocks.drawings, fab_releases: mocks.releases, pieces: mocks.pieces,
      drawing_sets: mocks.drawingSets, submittals: mocks.submittals,
      piece_drawing_sets: mocks.pieceDrawingSets, piece_drawings: mocks.pieceDrawings,
    };
    return readers[table](projectId, options);
  },
}));
vi.mock("@/hooks/useProjectId", () => ({ useProjectId: () => mocks.projectId }));
vi.mock("@/services/permissions", () => ({ usePermissions: () => ({ can: () => true }) }));
vi.mock("@/hooks/useRealtimeInvalidation", () => ({ useRealtimeInvalidation: (): void => {} }));
vi.mock("@/components/shared/numberSequencing", () => ({ getNextNumber: vi.fn().mockResolvedValue(2) }));
vi.mock("@/components/shared/DeleteDialog", () => ({ default: (): null => null }));
vi.mock("@/lib/native/fileExport", () => ({ presentGeneratedFile: vi.fn() }));
vi.mock("../components", () => ({ ExceptionPanel: (): null => null, PhaseFlowView: (): null => null, RegisterView: (): null => null, StatusBoardView: (): null => null }));
vi.mock("@/components/workpackages/WPFormModal", () => ({ default: ({ open, onSave, wp, pieceDrivenEvidence }: { open: boolean; onSave: (data: Record<string, unknown>) => void; wp?: WorkPackage; pieceDrivenEvidence?: boolean }) => {
  mocks.lastSave = onSave;
  mocks.formPieceDriven = pieceDrivenEvidence;
  return open ? <section role="dialog" aria-label="Work package form"><input aria-label="Package name draft" defaultValue={wp?.name ?? ""} /></section> : null;
} }));
vi.mock("@/components/workpackages/WPBulkAddModal", () => ({ default: ({ onCommit }: { onCommit: (rows: Record<string, unknown>[]) => void }): null => { mocks.lastBulkSave = onCommit; return null; } }));
vi.mock("@/components/workpackages/WorkPackageDetailModal", () => ({
  default: ({ wp, onSetStatus, onEdit, onClose, evidencePending, initialTab }: { wp: WorkPackage; evidencePending?: boolean; initialTab?: string; onClose?: () => void; onEdit?: ((wp: WorkPackage) => void) | null; onSetStatus?: ((wp: WorkPackage, status: string) => void) | null }) => {
    mocks.lastStatusAction = onSetStatus ? () => onSetStatus(wp, "Complete") : null;
    return <section aria-label="Package details">
      <output aria-label="Initial package tab">{initialTab}</output>
      <input aria-label="Open draft" defaultValue="" />
      {onEdit && <button type="button" onClick={() => onEdit(wp)}>Edit package</button>}
      {onSetStatus && <button type="button" disabled={evidencePending} onClick={() => onSetStatus(wp, "Complete")}>Mark complete</button>}
      <button type="button" onClick={onClose}>Close package</button>
    </section>;
  },
}));
// Keep the actual queries, canonical analytics, selection and mutation paths;
// substitute only the presentation shell so query timing is observable.
vi.mock("../WpControlCenter", () => ({
  default: ({ filtered, metrics, onOpenWp, onCreate, modals, bulkActions, onToggleAll, banner }: ComponentProps<typeof WpControlCenter>) => (
    <section aria-label="Production workflow">
      <p>{metrics.drawingStageClear.length} drawing stage clear</p>
      {filtered.map(wp => <button type="button" key={wp.id} onClick={() => onOpenWp(wp)}>
        {wp.wp_number}: {wp._signals.pieceDriven ? "piece-driven" : "manual"} · {wp._signals.phase}
      </button>)}
      <button type="button" onClick={() => onToggleAll?.(true)}>Select packages</button>
      <button type="button" onClick={() => onCreate?.()}>Create package</button>
      {banner}{bulkActions}{modals}
    </section>
  ),
}));

import WorkPackages from "@/pages/WorkPackages";
import { getNextNumber } from "@/components/shared/numberSequencing";

const project = { id: "project-1", name: "Steel job", piece_control_mode: "live" };
const packageRow = { id: "wp-1", project_id: project.id, wp_number: "WP-001", name: "North frame", phase: "Detailing", status: "Not Started", linked_drawing_ids: ["drawing-1"] };
const drawing = { id: "drawing-1", project_id: project.id, drawing_set_id: "set-1", stage: "IFC" };
const drawingSet = { id: "set-1", project_id: project.id };
const shopSubmittal = { id: "shop-1", project_id: project.id, submittal_type: "Shop Drawing", drawing_set_ids: [drawingSet.id], status: "Released for Fabrication" };
const piece = { id: "piece-1", work_package_id: packageRow.id, lifecycle_status: "fabricated" };
const pieceDrawingSet = { project_id: project.id, piece_id: piece.id, drawing_set_id: drawingSet.id };
const sources = ["packages", "projects", "drawings", "drawingSets", "submittals", "deliveries", "releases", "pieces", "pieceDrawingSets", "pieceDrawings"] as const;
type Source = typeof sources[number];
const rows: Record<Source, Record<string, unknown>[]> = {
  packages: [packageRow], projects: [project], drawings: [drawing], drawingSets: [drawingSet], submittals: [shopSubmittal], deliveries: [], releases: [], pieces: [piece],
  pieceDrawingSets: [pieceDrawingSet], pieceDrawings: [],
};
const clients: QueryClient[] = [];

function LocationState() {
  const location = useLocation();
  return <output aria-label="Current query">{location.search}</output>;
}

function renderPage(initialEntries = ["/WorkPackages"], prepare?: (client: QueryClient) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  prepare?.(client);
  clients.push(client);
  const view = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={initialEntries}><WorkPackages /><LocationState /></MemoryRouter></QueryClientProvider>);
  return { ...view, client };
}

function mockProjectTwoEvidence() {
  const projectId = "project-2";
  mocks.packages.mockResolvedValue([{ ...packageRow, id: "wp-2", project_id: projectId, wp_number: "WP-002" }]);
  mocks.drawings.mockResolvedValue([{ ...drawing, project_id: projectId }]);
  mocks.drawingSets.mockResolvedValue([{ ...drawingSet, project_id: projectId }]);
  mocks.submittals.mockResolvedValue([{ ...shopSubmittal, project_id: projectId }]);
  mocks.pieceDrawingSets.mockResolvedValue([]);
  mocks.pieceDrawings.mockResolvedValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.projectId = project.id;
  mocks.lastStatusAction = null;
  mocks.lastSave = null;
  mocks.lastBulkSave = null;
  mocks.formPieceDriven = undefined;
  sources.forEach(source => mocks[source].mockReset().mockResolvedValue(rows[source]));
  mocks.update.mockResolvedValue({ ...packageRow, status: "Complete" });
  mocks.create.mockResolvedValue({ ...packageRow, id: "created-wp" });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach(client => client.clear());
  onlineManager.setOnline(true);
});

describe("Work Packages evidence boundary", () => {
  it.each(["phase", "status", "percent_complete"])("rejects manual %s in an edit patch for a piece-driven package", async field => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /WP-001: piece-driven/ }));
    fireEvent.click(screen.getByRole("button", { name: "Edit package" }));
    await act(async () => { mocks.lastSave!({ name: "Updated scope", [field]: field === "percent_complete" ? 100 : "Complete" }); });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.formPieceDriven).toBe(true);
    await act(async () => { mocks.lastSave!({ name: "Updated scope" }); });
    expect(mocks.update).toHaveBeenCalledWith(packageRow.id, { name: "Updated scope" });
  });

  it.each(["create", "update"] as const)("accounts for the first committed %s batch when evidence refresh interrupts later rows", async operation => {
    const batchRows = Array.from({ length: 8 }, (_, index) => ({ ...packageRow, id: `batch-${index}`, wp_number: `WP-${index}` }));
    mocks.packages.mockResolvedValue(batchRows);
    mocks.pieces.mockResolvedValue([]);
    const { client } = renderPage();
    await screen.findByRole("button", { name: /WP-0: manual/ });
    const finish: Array<() => void> = [];
    mocks[operation].mockImplementation(() => new Promise(resolve => { finish.push(() => resolve(packageRow)); }));
    if (operation === "create") {
      await act(async () => { mocks.lastBulkSave!(batchRows); });
    } else {
      fireEvent.click(screen.getByRole("button", { name: "Select packages" }));
      fireEvent.click(screen.getByRole("button", { name: /SET COMPLETE/i }));
    }
    await waitFor(() => expect(mocks[operation]).toHaveBeenCalledTimes(5));
    mocks.pieces.mockReturnValue(new Promise(() => {}));
    await act(async () => {
      void client.invalidateQueries({ queryKey: ["wp-piece-counts", project.id] });
      finish.forEach(done => done());
    });
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith(operation === "create" ? "5 added, 3 failed" : "5 updated, 3 failed"));
    expect(mocks[operation]).toHaveBeenCalledTimes(5);
    expect(mocks.packages.mock.calls.length).toBeGreaterThan(1);
  });

  it("refreshes the open form's proven signal when a formerly manual package gains pieces", async () => {
    mocks.pieces.mockResolvedValue([]);
    const { client } = renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /WP-001: manual/ }));
    fireEvent.click(screen.getByRole("button", { name: "Edit package" }));
    expect(mocks.formPieceDriven).toBe(false);
    fireEvent.change(screen.getByLabelText("Package name draft"), { target: { value: "Keep scope edits" } });
    const oldSave = mocks.lastSave!;
    mocks.pieces.mockResolvedValue([piece]);
    await act(async () => { await client.invalidateQueries({ queryKey: ["wp-piece-counts", project.id] }); });
    await waitFor(() => expect(mocks.formPieceDriven).toBe(true));
    expect(screen.getByLabelText("Package name draft")).toHaveValue("Keep scope edits");
    await act(async () => { oldSave({ status: "Complete" }); });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("preserves ?new=1 until required evidence resolves, then opens the create form once", async () => {
    let resolvePieces!: (value: typeof piece[]) => void;
    mocks.pieces.mockReturnValue(new Promise(done => { resolvePieces = done; }));
    renderPage(["/WorkPackages?new=1"]);
    await waitFor(() => expect(mocks.pieces).toHaveBeenCalledOnce());
    expect(screen.getByLabelText("Current query")).toHaveTextContent("?new=1");
    expect(getNextNumber).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Work package form" })).not.toBeInTheDocument();
    await act(async () => { resolvePieces([piece]); });
    expect(await screen.findByRole("dialog", { name: "Work package form" })).toBeInTheDocument();
    expect(getNextNumber).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.getByLabelText("Current query")).toBeEmptyDOMElement());
  });

  it.each(sources)("waits for %s before classifying packages or offering transitions", async source => {
    let resolve!: (value: Record<string, unknown>[]) => void;
    mocks[source].mockReturnValue(new Promise(done => { resolve = done; }));
    renderPage(["/WorkPackages?id=wp-1"]);
    await waitFor(() => expect(mocks[source]).toHaveBeenCalled());
    expect(screen.getByRole("status", { name: "Work package evidence" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Production workflow" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark complete" })).not.toBeInTheDocument();
    expect(mocks.update).not.toHaveBeenCalled();
    await act(async () => { resolve(rows[source]); });
    expect(await screen.findByRole("button", { name: /WP-001: piece-driven · Fabrication/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark complete" })).not.toBeInTheDocument();
  });

  it.each(sources)("fails closed when %s fails and recovers through Retry", async source => {
    mocks[source].mockRejectedValue(new Error("Source unavailable"));
    renderPage();
    expect(await screen.findByRole("alert", { name: "Work package evidence" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Production workflow" })).not.toBeInTheDocument();
    expect(mocks.update).not.toHaveBeenCalled();
    mocks[source].mockResolvedValue(rows[source]);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("button", { name: /WP-001: piece-driven/ })).toBeInTheDocument();
  });

  it("keeps initial offline reads pending rather than rendering an empty workflow", () => {
    onlineManager.setOnline(false);
    renderPage();
    expect(screen.getByRole("status", { name: "Work package evidence" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Production workflow" })).not.toBeInTheDocument();
    sources.forEach(source => expect(mocks[source]).not.toHaveBeenCalled());
  });

  it("supports a proven empty piece scope as a manual package", async () => {
    mocks.pieces.mockResolvedValue([]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /WP-001: manual · Detailing/ }));
    expect(screen.getByText("1 drawing stage clear")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mark complete" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith("wp-1", { status: "Complete" }));
  });

  it("uses the assigned lot's set instead of a different approved work-package sheet", async () => {
    const blockedSheet = { id: "drawing-2", project_id: project.id, drawing_set_id: "set-2", stage: "OFA" };
    mocks.pieces.mockResolvedValue([{ ...piece, lifecycle_status: "not_started" }]);
    mocks.drawings.mockResolvedValue([drawing, blockedSheet]);
    mocks.drawingSets.mockResolvedValue([drawingSet, { id: "set-2", project_id: project.id }]);
    mocks.submittals.mockResolvedValue([
      shopSubmittal,
      { id: "shop-2", project_id: project.id, submittal_type: "Shop Drawing", drawing_set_ids: ["set-2"], status: "Submitted", ball_in_court: "EOR" },
    ]);
    mocks.pieceDrawingSets.mockResolvedValue([{ ...pieceDrawingSet, drawing_set_id: "set-2" }]);
    const { client } = renderPage();
    expect(await screen.findByText("0 drawing stage clear")).toBeInTheDocument();
    mocks.pieceDrawingSets.mockResolvedValue([pieceDrawingSet]);
    await act(async () => { await client.invalidateQueries({ queryKey: ["wp-piece-drawing-sets", project.id] }); });
    expect(await screen.findByText("1 drawing stage clear")).toBeInTheDocument();
  });

  it("does not wait for the deliberately disabled piece query when the project mode is off", async () => {
    mocks.projects.mockResolvedValue([{ ...project, piece_control_mode: "off" }]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /WP-001: manual/ }));
    expect(screen.getByRole("button", { name: "Mark complete" })).toBeInTheDocument();
    expect(mocks.pieces).not.toHaveBeenCalled();
    expect(mocks.pieceDrawingSets).not.toHaveBeenCalled();
    expect(mocks.pieceDrawings).not.toHaveBeenCalled();
  });

  it("rejects a queued manual transition when cached configuration newly requires pieces before repaint", async () => {
    mocks.projects.mockResolvedValue([{ ...project, piece_control_mode: "off" }]);
    const { client } = renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /WP-001: manual/ }));
    const queuedAction = mocks.lastStatusAction!;
    mocks.pieces.mockReturnValue(new Promise(() => {}));
    await act(async () => {
      client.setQueryData(["projects"], [project]);
      queuedAction();
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects a queued transition if piece control enables before lot-link evidence loads", async () => {
    mocks.projects.mockResolvedValue([{ ...project, piece_control_mode: "off" }]);
    const { client } = renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /WP-001: manual/ }));
    const queuedAction = mocks.lastStatusAction!;
    await act(async () => {
      client.setQueryData(["projects"], [project]);
      client.setQueryData(["wp-piece-counts", project.id], []);
      queuedAction();
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("asks for a project instead of classifying portfolio packages as manual", () => {
    mocks.projectId = null;
    renderPage();
    expect(screen.getByRole("heading", { name: "Select a project" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Production workflow" })).not.toBeInTheDocument();
    expect(mocks.pieces).not.toHaveBeenCalled();
    expect(mocks.releases).not.toHaveBeenCalled();
  });

  it.each(["drawings", "drawingSets", "submittals", "releases", "pieces", "pieceDrawingSets", "pieceDrawings"] as const)("rejects a truncated %s snapshot", async source => {
    mocks[source].mockImplementation((_projectId: string, options: { onTruncated?: (count: number) => void }) => {
      options.onTruncated?.(200_000);
      return Promise.resolve(rows[source]);
    });
    renderPage();
    expect(await screen.findByRole("alert", { name: "Work package evidence" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Production workflow" })).not.toBeInTheDocument();
  });

  it("removes evidence-dependent controls if a previously loaded piece query fails", async () => {
    mocks.pieces.mockResolvedValue([]);
    const { client } = renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /WP-001: manual/ }));
    expect(screen.getByRole("button", { name: "Mark complete" })).toBeInTheDocument();
    mocks.pieces.mockRejectedValue(new Error("Refresh failed"));
    await act(async () => { await client.invalidateQueries({ queryKey: ["wp-piece-counts", project.id] }); });
    expect(await screen.findByRole("alert", { name: "Work package evidence" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark complete" })).not.toBeInTheDocument();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("preserves the last complete snapshot and open draft while refreshing, but rejects a queued transition", async () => {
    mocks.pieces.mockResolvedValue([]);
    const { client } = renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /WP-001: manual/ }));
    fireEvent.change(screen.getByLabelText("Open draft"), { target: { value: "Keep this draft" } });
    const queuedAction = mocks.lastStatusAction!;
    let resolvePieces!: (value: typeof piece[]) => void;
    mocks.pieces.mockReturnValue(new Promise(done => { resolvePieces = done; }));
    mocks.packages.mockResolvedValue([{ ...packageRow, name: "Changed", phase: "Erection" }]);
    await act(async () => {
      void client.invalidateQueries({ queryKey: ["wp-piece-counts", project.id] });
      // Exercise the actual callback, including the interval before a render.
      queuedAction();
      await client.invalidateQueries({ queryKey: ["work-packages", project.id] });
    });
    expect(await screen.findByText(/Showing the last loaded records/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /WP-001: manual · Detailing/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Open draft")).toHaveValue("Keep this draft");
    expect(screen.getByRole("button", { name: "Mark complete" })).toBeDisabled();
    expect(mocks.update).not.toHaveBeenCalled();
    await act(async () => { resolvePieces([piece]); });
    expect(await screen.findByRole("button", { name: /WP-001: piece-driven · Fabrication/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark complete" })).not.toBeInTheDocument();
    await act(async () => { queuedAction(); });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("does not reuse capped register caches for complete evidence", async () => {
    mocks.packages.mockResolvedValue(Array.from({ length: 1001 }, (_, index) => ({ ...packageRow, id: `wp-${index}`, wp_number: `WP-${index}` })));
    mocks.pieces.mockResolvedValue([]);
    renderPage(["/WorkPackages"], client => {
      client.setQueryData(["work-packages", project.id], [packageRow]);
      client.setQueryData(["drawings", project.id], []);
    });
    expect(await screen.findByText("1001 drawing stage clear")).toBeInTheDocument();
    expect(mocks.packages).toHaveBeenCalledWith({ project_id: project.id }, "id");
    expect(mocks.drawingSets).toHaveBeenCalledWith(project.id, expect.any(Object));
    expect(mocks.submittals).toHaveBeenCalledWith(project.id, expect.any(Object));
    expect(mocks.drawings).toHaveBeenCalled();
  });

  it.each(["packages", "drawingSets", "submittals", "deliveries", "pieceDrawingSets", "pieceDrawings"] as const)("rejects %s evidence belonging to another project", async source => {
    mocks[source].mockResolvedValue([{ id: "foreign-row", project_id: "project-2" }]);
    renderPage();
    expect(await screen.findByRole("alert", { name: "Work package evidence" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Production workflow" })).not.toBeInTheDocument();
  });

  it("clears old-project drafts and rejects a queued old-package transition after the next project loads", async () => {
    mocks.pieces.mockResolvedValue([]);
    mocks.projects.mockResolvedValue([project, { ...project, id: "project-2" }]);
    const { client, rerender } = renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /WP-001: manual/ }));
    const queuedAction = mocks.lastStatusAction!;
    mocks.projectId = "project-2";
    mockProjectTwoEvidence();
    let resolvePieces!: (value: never[]) => void;
    mocks.pieces.mockReturnValue(new Promise(done => { resolvePieces = done; }));
    rerender(<QueryClientProvider client={client}><MemoryRouter><WorkPackages /></MemoryRouter></QueryClientProvider>);
    expect(screen.getByRole("status", { name: "Work package evidence" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Package details" })).not.toBeInTheDocument();
    await act(async () => { resolvePieces([]); });
    expect(await screen.findByRole("button", { name: /WP-002: manual/ })).toBeInTheDocument();
    await act(async () => { queuedAction(); });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects stale create and bulk-create callbacks after another project loads", async () => {
    mocks.pieces.mockResolvedValue([]);
    mocks.projects.mockResolvedValue([project, { ...project, id: "project-2" }]);
    const { client, rerender } = renderPage(["/WorkPackages?new=1"]);
    await screen.findByRole("dialog", { name: "Work package form" });
    const oldSave = mocks.lastSave!;
    const oldBulkSave = mocks.lastBulkSave!;
    mocks.projectId = "project-2";
    mockProjectTwoEvidence();
    rerender(<QueryClientProvider client={client}><MemoryRouter><WorkPackages /></MemoryRouter></QueryClientProvider>);
    await screen.findByRole("button", { name: /WP-002: manual/ });
    await act(async () => { oldSave({ name: "Project A draft" }); oldBulkSave([{ name: "Project A bulk draft" }]); });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("does not close another project's draft when an earlier create finishes", async () => {
    mocks.pieces.mockResolvedValue([]);
    mocks.projects.mockResolvedValue([project, { ...project, id: "project-2" }]);
    const { client, rerender } = renderPage(["/WorkPackages?new=1"]);
    await screen.findByRole("dialog", { name: "Work package form" });
    let finishCreate!: (value: typeof packageRow) => void;
    mocks.create.mockReturnValue(new Promise(done => { finishCreate = done; }));
    await act(async () => { mocks.lastSave!({ name: "Project A draft" }); });
    expect(mocks.create).toHaveBeenCalledOnce();
    mocks.projectId = "project-2";
    mockProjectTwoEvidence();
    rerender(<QueryClientProvider client={client}><MemoryRouter><WorkPackages /></MemoryRouter></QueryClientProvider>);
    await screen.findByRole("button", { name: /WP-002: manual/ });
    fireEvent.click(screen.getByRole("button", { name: "Create package" }));
    await screen.findByRole("dialog", { name: "Work package form" });
    fireEvent.change(screen.getByLabelText("Package name draft"), { target: { value: "Keep project B draft" } });
    await act(async () => { finishCreate(packageRow); });
    expect(screen.getByLabelText("Package name draft")).toHaveValue("Keep project B draft");
  });

  it("keeps a cached deep link until its initial refresh supplies a proven snapshot", async () => {
    let resolvePackages!: (value: typeof packageRow[]) => void;
    mocks.packages.mockReturnValue(new Promise(done => { resolvePackages = done; }));
    renderPage(["/WorkPackages?id=wp-1"], client => {
      client.setQueryData(["projects"], [project]);
      client.setQueryData(["work-packages", project.id, "wp-evidence"], [packageRow]);
      client.setQueryData(["drawings", project.id, "wp-evidence"], [drawing]);
      client.setQueryData(["deliveries-for-wps", project.id], []);
      client.setQueryData(["wp-fab-releases", project.id], []);
      client.setQueryData(["wp-piece-counts", project.id], []);
    });
    await waitFor(() => expect(mocks.packages).toHaveBeenCalledOnce());
    expect(screen.queryByRole("region", { name: "Package details" })).not.toBeInTheDocument();
    await act(async () => { resolvePackages([packageRow]); });
    expect(await screen.findByRole("region", { name: "Package details" })).toBeInTheDocument();
  });

  it("routes a Fab Release deep link to the exact package release gate and resets ordinary opens", async () => {
    renderPage(["/WorkPackages?id=wp-1&tab=release-gate"]);
    expect(await screen.findByRole("region", { name: "Package details" })).toBeInTheDocument();
    expect(screen.getByLabelText("Initial package tab")).toHaveTextContent("release gate");
    await waitFor(() => expect(screen.getByLabelText("Current query")).toBeEmptyDOMElement());

    fireEvent.click(screen.getByRole("button", { name: "Close package" }));
    fireEvent.click(screen.getByRole("button", { name: /WP-001: piece-driven/ }));
    expect(screen.getByLabelText("Initial package tab")).toHaveTextContent("scope");
  });
});
