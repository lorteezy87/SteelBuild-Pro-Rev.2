// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { entitiesMock, projectState } = vi.hoisted(() => {
  const entity = () => ({
    filter: vi.fn().mockResolvedValue([]),
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
    <div>
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

describe("CommandCenter project scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectState.id = "project-bimc";
    projectState.activeProject = {
      id: "project-bimc",
      name: "BIMC ED Expansion",
      project_number: "26179",
    };
    entitiesMock.RFI.filter.mockResolvedValue([{ id: "bimc-rfi" }]);
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
        expect(client.filter).toHaveBeenCalledWith(
          { project_id: "project-bimc" },
          expect.anything(),
        );
        expect(client.listAll).not.toHaveBeenCalled();
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
    }
  });
});
