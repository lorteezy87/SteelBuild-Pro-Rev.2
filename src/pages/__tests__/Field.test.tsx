// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { entitiesMock, projectState } = vi.hoisted(() => {
  const entity = () => ({
    filter: vi.fn().mockResolvedValue([]),
    list: vi.fn().mockResolvedValue([]),
  });
  return {
    projectState: {
      id: "project-field" as string | null,
      activeProject: {
        id: "project-field",
        name: "Field Project",
      } as { id: string; name: string } | null,
    },
    entitiesMock: {
      DailyLog: entity(),
      Photo: entity(),
      PunchlistItem: entity(),
      Inspection: entity(),
      SafetyIncident: entity(),
      QualityControlRecord: entity(),
      Delivery: entity(),
    },
  };
});

vi.mock("@/api/supabaseClient", () => ({ entities: entitiesMock }));
vi.mock("@/hooks/useProjectId", () => ({
  useProjectId: () => projectState.id,
}));
vi.mock("@/components/shared/ProjectContext", () => ({
  useProjectContext: () => ({ activeProject: projectState.activeProject }),
}));
vi.mock("@/components/design-system", () => ({
  CommandBar: ({
    title,
    eyebrow,
    count,
    children,
  }: {
    title: string;
    eyebrow: string;
    count: number;
    children?: React.ReactNode;
  }) => (
    <header>
      <span>{eyebrow}</span>
      <h1>{title}</h1>
      <span>{count} today</span>
      {children}
    </header>
  ),
  KpiTile: ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div>
      {label}: {value}
    </div>
  ),
}));
vi.mock("@/components/shared/LoadingSkeleton", () => ({
  default: () => <div>field loading</div>,
}));

import Field from "../Field";

function renderField() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter initialEntries={["/Field"]}>
      <QueryClientProvider client={client}>
        <Field />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("Field page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectState.id = "project-field";
    projectState.activeProject = {
      id: "project-field",
      name: "Field Project",
    };
    entitiesMock.DailyLog.filter.mockResolvedValue([
      {
        id: "log-1",
        date: new Date().toISOString().slice(0, 10),
        headcount: 6,
      },
    ]);
  });

  it("keeps every dashboard source scoped to the selected project", async () => {
    renderField();

    expect(await screen.findByRole("heading", { name: "Field" })).toBeInTheDocument();
    expect(screen.getByText("Field Project")).toBeInTheDocument();

    await waitFor(() => {
      for (const entity of Object.values(entitiesMock)) {
        expect(entity.filter).toHaveBeenCalled();
        expect(entity.filter.mock.calls[0]?.[0]).toEqual({
          project_id: "project-field",
        });
        expect(entity.list).not.toHaveBeenCalled();
      }
    });
  });

  it("renders the assembled field overview after all source queries settle", async () => {
    renderField();

    expect(await screen.findByText("Daily Log Today: ✓")).toBeInTheDocument();
    expect(screen.getByText("Open Punch: 0")).toBeInTheDocument();
    expect(screen.getByText("Today's Activity")).toBeInTheDocument();
    expect(screen.getByText("Recent Photos")).toBeInTheDocument();
    expect(screen.queryByText("field loading")).not.toBeInTheDocument();
  });
});
