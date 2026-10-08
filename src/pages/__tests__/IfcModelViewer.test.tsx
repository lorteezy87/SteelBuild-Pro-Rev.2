// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { ProjectContext } from "@/components/shared/ProjectContext";
import ProjectScopedRoute from "@/components/shared/ProjectScopedRoute";
import IfcModelViewer from "@/pages/IfcModelViewer";

vi.mock("@/api/supabaseClient", () => ({ entities: {} }));
vi.mock("@/lib/AuthContext", () => ({ AuthContext: {} }));
vi.mock("@/components/shared/OrgContext", () => ({ useOptionalOrg: (): null => null }));

const PROJECTS = [{ id: "project-a", name: "Shop and field" }, { id: "project-b", name: "Erection only" }];

function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><output data-testid="location">{location.pathname}{location.search}{location.hash}</output><button onClick={() => navigate(-1)}>Back</button></>;
}

function renderEntry(entry = "/IfcModelViewer", activeProjectId: string | null = "project-a", loading = false) {
  function Scope() {
    const [activeProject, setActiveProject] = useState(PROJECTS.find((project) => project.id === activeProjectId) ?? null);
    // The JavaScript context's default value cannot express its real row shape.
    const value = { projects: PROJECTS, activeProject, setActiveProject, loading, projectLoadError: null as null };
    return (
      <ProjectContext.Provider value={value as unknown as React.ContextType<typeof ProjectContext>}>
        <LocationProbe />
        <Routes>
          <Route path="/Dashboard" element={<p>Dashboard</p>} />
          <Route path="/IfcModelViewer" element={<ProjectScopedRoute><IfcModelViewer /></ProjectScopedRoute>} />
          <Route path="/DrawingSubmittalHub" element={<ProjectScopedRoute><p>Existing guarded hub destination</p></ProjectScopedRoute>} />
        </Routes>
      </ProjectContext.Provider>
    );
  }
  return render(<MemoryRouter initialEntries={["/Dashboard", entry]} initialIndex={1}><Scope /></MemoryRouter>);
}

afterEach(cleanup);

describe("IFC model viewer entry", () => {
  it("opens the existing viewer tab and pins the selected project", async () => {
    renderEntry();
    await screen.findByText("Existing guarded hub destination");
    const destination = new URL(screen.getByTestId("location").textContent!, "https://local.invalid");
    expect(destination.pathname).toBe("/DrawingSubmittalHub");
    expect(destination.searchParams.get("hub_tab")).toBe("model3d");
    expect(destination.searchParams.get("projectId")).toBe("project-a");
  });

  it.each(["projectId", "project"])("preserves an explicit %s deep link and resolves it before entering", async (key) => {
    renderEntry(`/IfcModelViewer?${key}=project-b&modelId=example&hub_tab=drawings#selection`);
    await screen.findByText("Existing guarded hub destination");
    const destination = new URL(screen.getByTestId("location").textContent!, "https://local.invalid");
    expect(destination.searchParams.get(key)).toBe("project-b");
    expect(destination.searchParams.get("modelId")).toBe("example");
    expect(destination.searchParams.get("hub_tab")).toBe("model3d");
    expect(destination.hash).toBe("#selection");
    if (key === "project") expect(destination.searchParams.has("projectId")).toBe(false);
  });

  it("leaves an inaccessible explicit project at the standard access-denied guard", () => {
    renderEntry("/IfcModelViewer?projectId=other-company");
    expect(screen.getByText("You don't have access to this project")).toBeInTheDocument();
    expect(screen.queryByText("Existing guarded hub destination")).not.toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/IfcModelViewer?projectId=other-company");
  });

  it("waits for explicit project access to resolve", () => {
    renderEntry("/IfcModelViewer?projectId=not-loaded", null, true);
    expect(screen.getByRole("status", { name: "Loading page" })).toBeInTheDocument();
    expect(screen.queryByText("Existing guarded hub destination")).not.toBeInTheDocument();
  });

  it("leaves project selection to the existing hub when no project is selected", async () => {
    renderEntry("/IfcModelViewer", null);
    await screen.findByText("Existing guarded hub destination");
    expect(screen.getByTestId("location")).toHaveTextContent("/DrawingSubmittalHub?hub_tab=model3d");
  });

  it("replaces the entry so Back returns to the previous page without a redirect loop", async () => {
    const user = userEvent.setup();
    renderEntry();
    await screen.findByText("Existing guarded hub destination");
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
  });
});
