// @vitest-environment jsdom

import React from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  projectListMock: vi.fn(),
}));

vi.mock("@/api/supabaseClient", () => ({
  entities: {
    Project: {
      list: mocks.projectListMock,
    },
  },
}));

import { ProjectContext, ProjectProvider } from "@/components/shared/ProjectContext";
import { emitProjectUpdated } from "@/services/projectUpdateEvents";

function Probe() {
  const { activeProject, projects, loading } = React.useContext(ProjectContext);
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="active">{activeProject?.name || "none"}</span>
      <span data-testid="contract">{activeProject?.original_contract_value ?? "none"}</span>
      <span data-testid="count">{projects.length}</span>
    </div>
  );
}

describe("ProjectProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.projectListMock.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not resurrect cached projects after a confirmed empty project list", async () => {
    const staleProject = { id: "deleted-project", name: "Deleted Project" };
    localStorage.setItem("activeProjectId", staleProject.id);
    localStorage.setItem("sbp_projects_cache", JSON.stringify([staleProject]));
    mocks.projectListMock.mockResolvedValue([]);

    render(
      <ProjectProvider>
        <Probe />
      </ProjectProvider>
    );

    await act(async () => { await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    await act(async () => { await Promise.resolve(); });

    expect(mocks.projectListMock).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
    expect(screen.getByTestId("active")).toHaveTextContent("none");
    expect(screen.getByTestId("count")).toHaveTextContent("0");
    expect(localStorage.getItem("activeProjectId")).toBeNull();
    expect(localStorage.getItem("sbp_projects_cache")).toBeNull();
  });

  it("merges successful project saves into active state and the project cache", async () => {
    const project = { id: "p-1", name: "Project One", original_contract_value: 100000 };
    localStorage.setItem("activeProjectId", project.id);
    localStorage.setItem("sbp_projects_cache", JSON.stringify([project]));
    mocks.projectListMock.mockResolvedValue([project]);

    render(
      <ProjectProvider>
        <Probe />
      </ProjectProvider>
    );

    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId("contract")).toHaveTextContent("100000");

    await act(async () => {
      emitProjectUpdated({ ...project, original_contract_value: 125000, contract_type: "GMP" });
    });

    expect(screen.getByTestId("contract")).toHaveTextContent("125000");
    expect(JSON.parse(localStorage.getItem("sbp_projects_cache"))[0]).toMatchObject({
      id: "p-1",
      original_contract_value: 125000,
      contract_type: "GMP",
    });
  });
});
