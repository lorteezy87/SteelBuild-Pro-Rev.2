// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { OrgProvider, useOrg } from "@/components/shared/OrgContext";
import { ProjectProvider, useProjectContext } from "@/components/shared/ProjectContext";
import { getActiveOrgId } from "@/lib/activeOrg";
import WorkspaceSelector from "../WorkspaceSelector";

const mocks = vi.hoisted(() => ({ memberships: vi.fn(), projects: vi.fn() }));
vi.mock("@/lib/AuthContext", async () => {
  const { createContext, useContext } = await import("react");
  const AuthContext = createContext({ user: { id: "alice" }, isAuthenticated: true, isLoadingAuth: false });
  return { AuthContext, useAuth: () => useContext(AuthContext) };
});
vi.mock("@/lib/org/repository", () => ({ listMyMemberships: mocks.memberships }));
vi.mock("@/api/supabaseClient", () => ({ entities: { Project: { filterAll: mocks.projects } } }));

const memberships = [
  { organization: { id: "org-a", name: "Fabricator A" }, role: "owner" },
  { organization: { id: "org-b", name: "Erector B" }, role: "member" },
];
type Project = { id: string; name: string; org_id: string };
type ProjectsValue = { projects: Project[]; activeProject: Project | null; setActiveProject: (project: Project) => void };
type OrgValue = { isLoadingOrgs: boolean; currentOrg: { id: string } | null };
let client: QueryClient;
const renders: Array<{ orgId: string | undefined; projectIds: string[] }> = [];
function Projects() {
  const { projects, activeProject, setActiveProject } = useProjectContext() as unknown as ProjectsValue;
  const { currentOrg } = useOrg() as unknown as OrgValue;
  renders.push({ orgId: currentOrg?.id, projectIds: projects.map(project => project.id) });
  return <div><output aria-label="Selected project">{activeProject?.name || "No project selected"}</output>
    {projects.map(project => <button key={project.id} onClick={() => setActiveProject(project)}>{project.name}</button>)}
  </div>;
}
function ProjectGate() {
  const { isLoadingOrgs } = useOrg() as unknown as OrgValue;
  return isLoadingOrgs ? null : <ProjectProvider><Projects /></ProjectProvider>;
}
function Location() {
  const location = useLocation();
  return <output aria-label="Current route">{location.pathname}{location.search}</output>;
}
function mount() {
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/RFIs?projectId=project-org-a&view=private-rfi"]}>
    <OrgProvider><WorkspaceSelector /><ProjectGate /><Location /></OrgProvider>
  </MemoryRouter></QueryClientProvider>);
}
beforeEach(() => {
  localStorage.clear();
  renders.length = 0;
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mocks.memberships.mockReset().mockResolvedValue(memberships);
  mocks.projects.mockReset().mockImplementation(async ({ org_id }: { org_id: string }) => [
    { id: `project-${org_id}`, org_id, name: `Project for ${org_id}` },
  ]);
});
afterEach(() => { cleanup(); client.clear(); });

it("switches workspace through the visible selector before exposing its owned projects", async () => {
  const user = userEvent.setup();
  let resolveNextProjects!: (projects: Project[]) => void;
  const nextProjects = new Promise<Project[]>(resolve => { resolveNextProjects = resolve; });
  mocks.projects.mockImplementation(({ org_id }: { org_id: string }) => org_id === "org-b" ? nextProjects : Promise.resolve([
    { id: "project-org-a", org_id, name: "Project for org-a" },
  ]));
  mount();
  await user.click(await screen.findByRole("button", { name: "Project for org-a" }));
  expect(screen.getByLabelText("Selected project")).toHaveTextContent("Project for org-a");
  client.setQueryData(["rfis", "project-org-a"], [{ id: "private-a" }]);
  const selector = screen.getByRole("combobox", { name: "Workspace" });
  expect(selector).toHaveValue("org-a");
  await user.selectOptions(selector, "org-b");
  await waitFor(() => expect(mocks.projects).toHaveBeenCalledWith({ org_id: "org-b" }, "-created_at"));
  expect(screen.getByLabelText("Selected project")).toHaveTextContent("No project selected");
  expect(screen.queryByRole("button", { name: "Project for org-a" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Project for org-b" })).not.toBeInTheDocument();
  resolveNextProjects([{ id: "project-org-b", org_id: "org-b", name: "Project for org-b" }]);
  await screen.findByRole("button", { name: "Project for org-b" });
  expect(screen.getByRole("combobox", { name: "Workspace" })).toHaveValue("org-b");
  expect(screen.getByLabelText("Selected project")).toHaveTextContent("No project selected");
  expect(screen.queryByRole("button", { name: "Project for org-a" })).not.toBeInTheDocument();
  expect(getActiveOrgId()).toBe("org-b");
  expect(localStorage.getItem("sbp:current-org")).toBe("org-b");
  expect(localStorage.getItem("activeProjectId")).toBeNull();
  expect(screen.getByLabelText("Current route")).toHaveTextContent(/^\/Projects$/);
  expect(client.getQueryData(["rfis", "project-org-a"])).toBeUndefined();
  expect(client.getQueryData(["my-orgs", "alice"])).toBeDefined();
  expect(JSON.parse(localStorage.getItem("sbp_projects_cache")!)).toMatchObject({
    owner: { userId: "alice", orgId: "org-b" }, projects: [{ id: "project-org-b" }],
  });
  expect(renders.some(frame => frame.orgId === "org-b" && frame.projectIds.includes("project-org-a"))).toBe(false);
});

it("keeps the current project and deep link when the selected workspace is unchanged", async () => {
  const user = userEvent.setup();
  mount();
  await user.click(await screen.findByRole("button", { name: "Project for org-a" }));
  client.setQueryData(["rfis", "project-org-a"], [{ id: "private-a" }]);
  await user.selectOptions(screen.getByRole("combobox", { name: "Workspace" }), "org-a");
  expect(screen.getByLabelText("Current route")).toHaveTextContent("/RFIs?projectId=project-org-a&view=private-rfi");
  expect(screen.getByLabelText("Selected project")).toHaveTextContent("Project for org-a");
  expect(client.getQueryData(["rfis", "project-org-a"])).toEqual([{ id: "private-a" }]);
  expect(mocks.projects).toHaveBeenCalledTimes(1);
});

it("disables selection while memberships load and reveals the available workspaces afterwards", async () => {
  let resolve!: (value: typeof memberships) => void;
  mocks.memberships.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  mount();
  expect(screen.getByRole("combobox", { name: "Workspace" })).toBeDisabled();
  expect(screen.getByRole("option", { name: "Loading workspaces…" })).toBeInTheDocument();
  resolve(memberships);
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Workspace" })).toBeEnabled());
});

it("shows the current workspace without a switching control for a single membership", async () => {
  mocks.memberships.mockResolvedValueOnce(memberships.slice(0, 1));
  mount();
  expect(await screen.findByRole("status", { name: "Workspace" })).toHaveTextContent("Fabricator A");
  expect(screen.queryByRole("combobox", { name: "Workspace" })).not.toBeInTheDocument();
});

it("shows an unavailable state when no current workspace can be resolved", async () => {
  mocks.memberships.mockResolvedValueOnce([]);
  mount();
  expect(await screen.findByRole("status", { name: "Workspace" })).toHaveTextContent("Workspace unavailable");
  expect(screen.queryByRole("combobox", { name: "Workspace" })).not.toBeInTheDocument();
});
