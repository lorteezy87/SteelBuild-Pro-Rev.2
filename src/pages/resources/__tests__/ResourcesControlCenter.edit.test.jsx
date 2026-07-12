// @vitest-environment jsdom
/**
 * Guards the edit affordance on the Resources Control Center.
 *
 * The command_ui skin shipped as a read-only table: no edit control, no row
 * click, and a dead "New Resource" button (ResourceHub rendered it with no
 * props). Because command_ui is on globally and the Crew Schedule board is
 * create-only, that left users with no way to edit a resource once created.
 * These tests pin the affordances so the read-only regression can't return.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ResourcesControlCenter from "../ResourcesControlCenter";

const RESOURCES = [
  { id: "r1", name: "Ironworker Crew A", resource_type: "Crew", role: "Erection", capacity: 320, unit: "hours", cost_rate: 78, availability: "Allocated" },
  { id: "r2", name: "Manitowoc 4100", resource_type: "Equipment", role: "Crane", capacity: 160, unit: "hours", cost_rate: 240, availability: "Available" },
];

vi.mock("@/api/supabaseClient", () => ({
  entities: {
    Resource: { filter: vi.fn(async () => RESOURCES), list: vi.fn(async () => RESOURCES) },
    WorkPackage: { filter: vi.fn(async () => []), list: vi.fn(async () => []) },
  },
}));

vi.mock("@/hooks/useProjectId", () => ({ useProjectId: () => "proj-1" }));
vi.mock("@/config/launcherConfig", () => ({ photoFor: () => null }));

function renderCC(props = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ResourcesControlCenter projectName="Capstone" {...props} />
    </QueryClientProvider>,
  );
}

/** The row for a named resource, found via its edit button's accessible name. */
async function rowFor(name) {
  const btn = await screen.findByRole("button", { name: `Edit ${name}` });
  return btn.closest("tr");
}

beforeEach(() => vi.clearAllMocks());

describe("ResourcesControlCenter — edit affordance", () => {
  it("renders an edit button per row when onEditResource is supplied", async () => {
    renderCC({ onEditResource: vi.fn() });
    expect(await screen.findByRole("button", { name: "Edit Ironworker Crew A" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Edit Manitowoc 4100" })).toBeInTheDocument();
  });

  it("calls onEditResource with the clicked resource", async () => {
    const onEditResource = vi.fn();
    renderCC({ onEditResource });
    await userEvent.click(await screen.findByRole("button", { name: "Edit Manitowoc 4100" }));
    expect(onEditResource).toHaveBeenCalledTimes(1);
    expect(onEditResource.mock.calls[0][0]).toMatchObject({ id: "r2", name: "Manitowoc 4100" });
  });

  it("opens the editor when the row itself is clicked", async () => {
    const onEditResource = vi.fn();
    renderCC({ onEditResource });
    const row = await rowFor("Ironworker Crew A");
    await userEvent.click(within(row).getByText("Ironworker Crew A"));
    expect(onEditResource.mock.calls[0][0]).toMatchObject({ id: "r1" });
  });

  it("calls onDeleteResource without also firing the row's edit handler", async () => {
    const onEditResource = vi.fn();
    const onDeleteResource = vi.fn();
    renderCC({ onEditResource, onDeleteResource });
    await userEvent.click(await screen.findByRole("button", { name: "Delete Ironworker Crew A" }));
    expect(onDeleteResource.mock.calls[0][0]).toMatchObject({ id: "r1" });
    expect(onEditResource).not.toHaveBeenCalled();
  });

  it("omits the actions column entirely when no handlers are passed", async () => {
    renderCC();
    // Wait for data, then assert no edit/delete controls exist.
    expect(await screen.findByText("Ironworker Crew A")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Edit / })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Delete / })).toBeNull();
  });

  it("exposes a working New Resource button", async () => {
    const onAddResource = vi.fn();
    renderCC({ onAddResource });
    await userEvent.click(await screen.findByRole("button", { name: /New Resource/i }));
    expect(onAddResource).toHaveBeenCalledTimes(1);
  });
});
