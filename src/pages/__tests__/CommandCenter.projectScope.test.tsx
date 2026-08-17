// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { entitiesMock } = vi.hoisted(() => {
  const entity = () => ({
    filter: vi.fn().mockResolvedValue([]),
    listAll: vi.fn().mockResolvedValue([]),
  });
  return {
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
vi.mock("@/hooks/useProjectId", () => ({ useProjectId: () => "project-bimc" }));
vi.mock("@/components/shared/ProjectContext", () => ({
  useProjectContext: () => ({
    activeProject: {
      id: "project-bimc",
      name: "BIMC ED Expansion",
      project_number: "26179",
    },
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

import CommandCenter from "../CommandCenter";

describe("CommandCenter project scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
