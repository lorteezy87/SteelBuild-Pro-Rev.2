// @vitest-environment jsdom
//
// Route-level project-scope guard (#14). The guard only acts on an explicit
// ?projectId= / ?project= deep link to a project that isn't in the user's
// RLS-scoped accessible list — everything else (portfolio mode, accessible
// projects, still-loading, load error) must render the page through.

import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

let projState;

vi.mock("@/components/shared/ProjectContext", () => ({
  useProjectContext: () => projState,
  ProjectProvider: ({ children }) => children,
}));
vi.mock("@/boot/PageLoader", () => ({ default: () => <div>LOADER</div> }));

import ProjectScopedRoute from "@/components/shared/ProjectScopedRoute";

const ctx = (over = {}) => ({
  projects: [],
  activeProject: null,
  setActiveProject: vi.fn(),
  loading: false,
  projectLoadError: null,
  ...over,
});

function renderAt(url) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ProjectScopedRoute>
        <div>PAGE</div>
      </ProjectScopedRoute>
    </MemoryRouter>,
  );
}

const DENIED = /don't have access to this project/i;

describe("ProjectScopedRoute", () => {
  beforeEach(() => {
    projState = ctx();
  });

  it("renders the page in portfolio mode (no URL project param)", () => {
    renderAt("/RFIs");
    expect(screen.getByText("PAGE")).toBeInTheDocument();
  });

  it("renders when the URL project is in the accessible set", () => {
    projState = ctx({
      projects: [{ id: "p1" }, { id: "p2" }],
      activeProject: { id: "p1" },
    });
    renderAt("/RFIs?projectId=p1");
    expect(screen.getByText("PAGE")).toBeInTheDocument();
  });

  it("activates an accessible deep-linked project before rendering its page", async () => {
    const targetProject = { id: "p2", name: "Target project" };
    const setActiveProject = vi.fn();
    projState = ctx({
      projects: [{ id: "p1", name: "Current project" }, targetProject],
      activeProject: { id: "p1", name: "Current project" },
      setActiveProject,
    });

    renderAt("/Submittals?projectId=p2&recordId=submittal-2");

    await waitFor(() =>
      expect(setActiveProject).toHaveBeenCalledWith(targetProject),
    );
    expect(screen.getByText("LOADER")).toBeInTheDocument();
    expect(screen.queryByText("PAGE")).not.toBeInTheDocument();
  });

  it("honors the legacy ?project= alias", () => {
    projState = ctx({
      projects: [{ id: "p1" }],
      activeProject: { id: "p1" },
    });
    renderAt("/RFIs?project=p1");
    expect(screen.getByText("PAGE")).toBeInTheDocument();
  });

  it("denies an accessible-list miss once loading has finished", () => {
    projState = ctx({ projects: [{ id: "p1" }], loading: false });
    renderAt("/RFIs?projectId=ghost");
    expect(screen.getByText(DENIED)).toBeInTheDocument();
    expect(screen.queryByText("PAGE")).not.toBeInTheDocument();
  });

  it("waits (loader) instead of denying while the list is still loading", () => {
    projState = ctx({ projects: [], loading: true });
    renderAt("/RFIs?projectId=p1");
    expect(screen.getByText("LOADER")).toBeInTheDocument();
    expect(screen.queryByText(DENIED)).not.toBeInTheDocument();
  });

  it("renders an accessible cached project even while a refresh is loading", () => {
    projState = ctx({
      projects: [{ id: "p1" }],
      activeProject: { id: "p1" },
      loading: true,
    });
    renderAt("/RFIs?projectId=p1");
    expect(screen.getByText("PAGE")).toBeInTheDocument();
  });

  it("falls back to rendering when the project list failed to load", () => {
    projState = ctx({ projects: [], loading: false, projectLoadError: "network" });
    renderAt("/RFIs?projectId=p1");
    expect(screen.getByText("PAGE")).toBeInTheDocument();
  });

  it("denies a zero-project user deep-linking into any project", () => {
    projState = ctx({ projects: [], loading: false });
    renderAt("/Dashboard?projectId=p1");
    expect(screen.getByText(DENIED)).toBeInTheDocument();
  });
});
