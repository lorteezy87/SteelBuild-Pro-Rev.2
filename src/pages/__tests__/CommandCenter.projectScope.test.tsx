// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { entitiesMock, projectState } = vi.hoisted(() => {
  const entity = () => ({
    filter: vi.fn().mockResolvedValue([]),
    filterAll: vi.fn().mockResolvedValue([]),
    listAll: vi.fn().mockResolvedValue([]),
  });
  return {
    projectState: {
      id: "project-bimc" as string | null,
      activeProject: {
        id: "project-bimc",
        name: "BIMC ED Expansion",
        project_number: "26179",
      } as { id: string; name: string; project_number: string } | null,
    },
    entitiesMock: {
      RFI: entity(),
      Submittal: entity(),
      ChangeOrder: entity(),
      Delivery: entity(),
      WorkPackage: entity(),
      ScheduleTask: entity(),
    },
  };
});

vi.mock("@/api/supabaseClient", () => ({ entities: entitiesMock }));
vi.mock("@/hooks/useProjectId", () => ({ useProjectId: () => projectState.id }));
vi.mock("@/components/shared/ProjectContext", () => ({
  useProjectContext: () => ({
    activeProject: projectState.activeProject,
  }),
}));
vi.mock("../commandCenter/CommandCenterControlCenter", () => ({
  default: ({ sources, projectName, projectCount }: any) => (
    <div data-testid="project-cockpit">
      <span>{projectName}</span>
      <span>{projectCount} project</span>
      <span>{sources.rfis.length} RFIs</span>
    </div>
  ),
}));
vi.mock("@/components/commandcenter/ItemDetailDrawer", () => ({ default: (): null => null }));
vi.mock("@/components/commandcenter/ForwardLookDrawer", () => ({ default: (): null => null }));
vi.mock("@/components/shared/LoadingSkeleton", () => ({ default: () => <div>loading</div> }));
vi.mock("@/components/design-system/EmptyState", () => ({
  default: ({ title, body }: { title: string; body: string }) => <div><h2>{title}</h2><p>{body}</p></div>,
}));
vi.mock("@/components/design-system/CommandBar", () => ({
  default: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

import CommandCenter from "../CommandCenter";

afterEach(cleanup);

describe("CommandCenter project scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectState.id = "project-bimc";
    projectState.activeProject = {
      id: "project-bimc",
      name: "BIMC ED Expansion",
      project_number: "26179",
    };
    for (const entity of Object.values(entitiesMock)) entity.filterAll.mockReset().mockResolvedValue([]);
    entitiesMock.RFI.filterAll.mockResolvedValue([{ id: "bimc-rfi", project_id: "project-bimc" }]);
  });

  it("queries every operational source for only the selected project", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <CommandCenter />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("BIMC ED Expansion")).toBeInTheDocument();
    expect(screen.getByText("1 project")).toBeInTheDocument();
    expect(screen.getByText("1 RFIs")).toBeInTheDocument();

    await waitFor(() => {
      for (const client of Object.values(entitiesMock)) {
        expect(client.filterAll).toHaveBeenCalledWith(
          { project_id: "project-bimc" },
          expect.anything(),
        );
        expect(client.listAll).not.toHaveBeenCalled();
        expect(client.filter).not.toHaveBeenCalled();
      }
    });
  });

  it("requires a project instead of rendering a misleading all-zero command center", () => {
    projectState.id = null;
    projectState.activeProject = null;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <CommandCenter />
      </QueryClientProvider>,
    );

    expect(screen.getByRole("heading", { name: "Select a project" })).toBeInTheDocument();
    expect(screen.getByText(/never mix across jobs/i)).toBeInTheDocument();
    for (const entity of Object.values(entitiesMock)) {
      expect(entity.filter).not.toHaveBeenCalled();
      expect(entity.filterAll).not.toHaveBeenCalled();
    }
  });

  it("loads beyond a server page and does not reuse a capped register cache", async () => {
    entitiesMock.RFI.filterAll.mockResolvedValue(Array.from({ length: 1001 }, (_, i) => ({ id: `r${i}`, project_id: "project-bimc" })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["rfis", "project-bimc"], [{ id: "partial", project_id: "project-bimc" }]);
    render(<QueryClientProvider client={client}><CommandCenter /></QueryClientProvider>);
    expect(await screen.findByText("1001 RFIs")).toBeInTheDocument();
    expect(entitiesMock.RFI.filterAll).toHaveBeenCalledOnce();
    // Registry prefix invalidation must still refresh the complete source.
    await act(async () => { await client.invalidateQueries({ queryKey: ["rfis", "project-bimc"] }); });
    expect(entitiesMock.RFI.filterAll).toHaveBeenCalledTimes(2);
  });

  it.each(["RFI", "Submittal", "ChangeOrder", "Delivery", "WorkPackage", "ScheduleTask"] as const)(
    "waits for %s before publishing a briefing", async (source) => {
      let resolve!: (records: never[]) => void;
      entitiesMock[source].filterAll.mockReturnValue(new Promise((done) => { resolve = done; }));
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(<QueryClientProvider client={client}><CommandCenter /></QueryClientProvider>);
      await waitFor(() => expect(entitiesMock.ScheduleTask.filterAll).toHaveBeenCalled());
      expect(screen.queryByTestId("project-cockpit")).not.toBeInTheDocument();
      await act(async () => { resolve([]); });
      expect(await screen.findByTestId("project-cockpit")).toBeInTheDocument();
    },
  );

  it.each(["RFI", "Submittal", "ChangeOrder", "Delivery", "WorkPackage", "ScheduleTask"] as const)(
    "fails closed when %s fails and can retry", async (source) => {
      entitiesMock[source].filterAll.mockRejectedValueOnce(new Error("Source unavailable"));
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(<QueryClientProvider client={client}><CommandCenter /></QueryClientProvider>);
      expect(await screen.findByRole("alert")).toHaveTextContent("Project briefing unavailable");
      expect(screen.queryByTestId("project-cockpit")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Retry project sources" }));
      expect(await screen.findByTestId("project-cockpit")).toBeInTheDocument();
    },
  );

  it.each([
    ["a source at the safety cap", Array.from({ length: 100_000 }, (_, i) => ({ id: `r${i}`, project_id: "project-bimc" }))],
    ["a record from another project", [{ id: "foreign", project_id: "project-other" }]],
    ["a record with no project", [{ id: "unscoped" }]],
  ])("does not publish %s", async (_label, records) => {
    entitiesMock.RFI.filterAll.mockResolvedValue(records);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><CommandCenter /></QueryClientProvider>);
    expect(await screen.findByRole("alert")).toHaveTextContent("RFIs");
    expect(screen.queryByTestId("project-cockpit")).not.toBeInTheDocument();
  });

  it("removes the briefing when a background source refresh fails", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><CommandCenter /></QueryClientProvider>);
    expect(await screen.findByTestId("project-cockpit")).toBeInTheDocument();
    entitiesMock.Delivery.filterAll.mockRejectedValue(new Error("Refresh failed"));
    await act(async () => { await client.invalidateQueries({ queryKey: ["deliveries", "project-bimc"] }); });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByTestId("project-cockpit")).not.toBeInTheDocument();
  });

  it("does not retain the previous project's records while the next project loads", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(<QueryClientProvider client={client}><CommandCenter /></QueryClientProvider>);
    expect(await screen.findByText("1 RFIs")).toBeInTheDocument();
    projectState.id = "project-next";
    projectState.activeProject = { id: "project-next", name: "Next steel job", project_number: "26200" };
    let resolve!: (records: { id: string; project_id: string }[]) => void;
    entitiesMock.RFI.filterAll.mockReturnValue(new Promise((done) => { resolve = done; }));
    rerender(<QueryClientProvider client={client}><CommandCenter /></QueryClientProvider>);
    expect(screen.queryByText("1 RFIs")).not.toBeInTheDocument();
    expect(screen.queryByText("BIMC ED Expansion")).not.toBeInTheDocument();
    await act(async () => { resolve([{ id: "new1", project_id: "project-next" }, { id: "new2", project_id: "project-next" }]); });
    expect(await screen.findByText("Next steel job")).toBeInTheDocument();
    expect(screen.getByText("2 RFIs")).toBeInTheDocument();
  });
});
