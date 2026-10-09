// @vitest-environment jsdom

import React from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  projectListMock: vi.fn(),
  org: { currentOrg: { id: "org-a" } },
}));

vi.mock("@/api/supabaseClient", () => ({
  entities: {
    Project: {
      list: mocks.projectListMock,
      filterAll: async (...args) => (await mocks.projectListMock(...args)).map((project) => ({
        org_id: mocks.org.currentOrg.id, ...project,
      })),
    },
  },
}));

vi.mock("@/lib/AuthContext", async () => {
  const { createContext } = await import("react");
  return { AuthContext: createContext({ user: { id: "user-a" }, isAuthenticated: true, isLoadingAuth: false }) };
});
vi.mock("@/components/shared/OrgContext", () => ({ useOptionalOrg: () => mocks.org }));

import { writeOwnedProjects } from "@/lib/projectSelection";
import { AuthContext } from "@/lib/AuthContext";
import { ProjectContext, ProjectProvider } from "@/components/shared/ProjectContext";
import { emitProjectUpdated } from "@/services/projectUpdateEvents";

function saveProjects(projects) {
  writeOwnedProjects(projects.map((project) => ({ org_id: "org-a", ...project })),
    { userId: "user-a", orgId: "org-a" });
}

function Probe() {
  const { activeProject, projects, activeProjects, loading, removeProject } =
    React.useContext(ProjectContext);
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="active">{activeProject?.name || "none"}</span>
      <span data-testid="contract">{activeProject?.original_contract_value ?? "none"}</span>
      <span data-testid="count">{projects.length}</span>
      <span data-testid="active-count">{activeProjects.length}</span>
      <span data-testid="ids">{projects.map((p) => p.id).join(",")}</span>
      <button type="button" data-testid="remove-a" onClick={() => removeProject("p-a")}>
        remove
      </button>
    </div>
  );
}

describe("ProjectProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.projectListMock.mockReset();
    localStorage.clear();
    mocks.org = { currentOrg: { id: "org-a" } };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not resurrect cached projects after a confirmed empty project list", async () => {
    const staleProject = { id: "deleted-project", name: "Deleted Project" };
    localStorage.setItem("activeProjectId", staleProject.id);
    saveProjects([staleProject]);
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
    saveProjects([project]);
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
    expect(JSON.parse(localStorage.getItem("sbp_projects_cache")).projects[0]).toMatchObject({
      id: "p-1",
      original_contract_value: 125000,
      contract_type: "GMP",
    });
  });

  it("does not resurrect an archived project when a stale in-flight list resolves later", async () => {
    const projectA = { id: "p-a", name: "Alpha", on_hold: false };
    const projectB = { id: "p-b", name: "Beta", on_hold: false };
    saveProjects([projectA, projectB]);

    let resolveList;
    mocks.projectListMock.mockImplementation(
      () => new Promise((resolve) => { resolveList = resolve; }),
    );

    render(
      <ProjectProvider>
        <Probe />
      </ProjectProvider>
    );

    // Seeded from cache before the network list settles.
    expect(screen.getByTestId("count")).toHaveTextContent("2");

    await act(async () => {
      screen.getByTestId("remove-a").click();
    });
    expect(screen.getByTestId("ids")).toHaveTextContent("p-b");
    expect(JSON.parse(localStorage.getItem("sbp_projects_cache")).projects.map((p) => p.id)).toEqual(["p-b"]);

    // Stale pre-archive snapshot arrives after removeProject — must not win.
    await act(async () => {
      resolveList([projectA, projectB]);
      await Promise.resolve();
    });

    expect(screen.getByTestId("ids")).toHaveTextContent("p-b");
    expect(screen.getByTestId("count")).toHaveTextContent("1");
    expect(JSON.parse(localStorage.getItem("sbp_projects_cache")).projects.map((p) => p.id)).toEqual(["p-b"]);
  });

  it("drops soft-deleted rows from cache seed and list results", async () => {
    const live = { id: "p-live", name: "Live", on_hold: false, is_deleted: false };
    const archived = { id: "p-arch", name: "Archived", on_hold: false, is_deleted: true };
    saveProjects([live, archived]);
    mocks.projectListMock.mockResolvedValue([live, archived]);

    render(
      <ProjectProvider>
        <Probe />
      </ProjectProvider>
    );

    expect(screen.getByTestId("ids")).toHaveTextContent("p-live");
    expect(screen.getByTestId("ids")).not.toHaveTextContent("p-arch");

    await act(async () => { await Promise.resolve(); });

    expect(screen.getByTestId("ids")).toHaveTextContent("p-live");
    expect(screen.getByTestId("ids")).not.toHaveTextContent("p-arch");
    expect(screen.getByTestId("active-count")).toHaveTextContent("1");
  });

  it("never displays a legacy cache without an authenticated owner", async () => {
    localStorage.setItem("sbp_projects_cache", JSON.stringify([{ id: "secret", name: "Previous user" }]));
    localStorage.setItem("activeProjectId", "secret");
    mocks.projectListMock.mockImplementation(() => new Promise(() => {}));
    render(<ProjectProvider><Probe /></ProjectProvider>);
    expect(screen.getByTestId("count")).toHaveTextContent("0");
    expect(screen.getByTestId("active")).toHaveTextContent("none");
  });

  it("remounts project state for another account before its request resolves", async () => {
    saveProjects([{ id: "p-a", name: "Private Alpha" }]);
    localStorage.setItem("activeProjectId", "p-a");
    let resolveOld;
    mocks.projectListMock.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    mocks.projectListMock.mockImplementation(() => new Promise(() => {}));
    const tree = (id) => (
      <AuthContext.Provider value={{ user: { id }, isAuthenticated: true, isLoadingAuth: false }}>
        <ProjectProvider><Probe /></ProjectProvider>
      </AuthContext.Provider>
    );
    const view = render(tree("user-a"));
    expect(screen.getByTestId("active")).toHaveTextContent("Private Alpha");
    view.rerender(tree("user-b"));
    expect(screen.getByTestId("count")).toHaveTextContent("0");
    expect(screen.getByTestId("active")).toHaveTextContent("none");
    await act(async () => { resolveOld([{ id: "p-a", name: "Private Alpha", org_id: "org-a" }]); });
    expect(screen.getByTestId("count")).toHaveTextContent("0");
  });

  it("scopes project reads and drops prior project state on workspace switch", async () => {
    mocks.projectListMock.mockResolvedValueOnce([{ id: "p-a", name: "Alpha", org_id: "org-a" }]);
    const view = render(<ProjectProvider><Probe /></ProjectProvider>);
    await act(async () => { await Promise.resolve(); });
    expect(mocks.projectListMock).toHaveBeenCalledWith({ org_id: "org-a" }, "-created_at");
    expect(screen.getByTestId("ids")).toHaveTextContent("p-a");
    mocks.projectListMock.mockImplementation(() => new Promise(() => {}));
    mocks.org = { currentOrg: { id: "org-b" } };
    view.rerender(<ProjectProvider><Probe /></ProjectProvider>);
    expect(screen.getByTestId("count")).toHaveTextContent("0");
    expect(mocks.projectListMock).toHaveBeenLastCalledWith({ org_id: "org-b" }, "-created_at");
  });

  it("removes a project from the switcher when an update marks it deleted", async () => {
    const project = { id: "p-1", name: "Project One", on_hold: false };
    localStorage.setItem("activeProjectId", project.id);
    saveProjects([project]);
    mocks.projectListMock.mockResolvedValue([project]);

    render(
      <ProjectProvider>
        <Probe />
      </ProjectProvider>
    );

    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId("count")).toHaveTextContent("1");

    await act(async () => {
      emitProjectUpdated({ ...project, is_deleted: true });
    });

    expect(screen.getByTestId("count")).toHaveTextContent("0");
    expect(screen.getByTestId("active")).toHaveTextContent("none");
    expect(localStorage.getItem("sbp_projects_cache")).toBeNull();
  });
});
