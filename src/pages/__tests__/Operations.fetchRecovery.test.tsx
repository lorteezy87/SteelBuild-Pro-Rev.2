// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import Schedule from "../Schedule";
import FieldToday from "../FieldToday";
import FieldHub from "../FieldHub";

const state = vi.hoisted(() => ({ projectId: "project-1" as string | null }));
const reads = vi.hoisted(() => ({
  schedule: vi.fn(), photos: vi.fn(), punchlist: vi.fn(), safety: vi.fn(),
}));
const writes = vi.hoisted(() => ({ schedule: vi.fn(), punchlist: vi.fn(), upload: vi.fn() }));
const outbox = vi.hoisted(() => ({ pending: 0, enqueue: vi.fn(), flush: vi.fn() }));
vi.mock("@/api/supabaseClient", () => ({
  entities: {
    Project: { list: async () => [{ id: "project-1", name: "Project One" }] },
    ScheduleTask: { filter: reads.schedule, update: writes.schedule },
    Photo: { filter: reads.photos },
    PunchlistItem: { filter: reads.punchlist, list: reads.punchlist, create: writes.punchlist },
    SafetyIncident: { filter: reads.safety, list: reads.safety },
    DailyLog: { filter: async (): Promise<unknown[]> => [], list: async (): Promise<unknown[]> => [] },
    Inspection: { filter: async (): Promise<unknown[]> => [], list: async (): Promise<unknown[]> => [] },
    Document: { filter: async (): Promise<unknown[]> => [] },
  },
  integrations: { Core: { UploadFile: writes.upload } },
}));
vi.mock("@/hooks/useProjectId", () => ({ useProjectId: () => state.projectId }));
vi.mock("@/components/shared/ProjectContext", () => ({
  useProjectContext: () => ({ activeProject: state.projectId ? { id: state.projectId, name: "Project One" } : null }),
}));
vi.mock("@/hooks/useRealtimeInvalidation", () => ({ useRealtimeInvalidation: () => {} }));
vi.mock("@/hooks/useScheduleBaselines", () => ({ useScheduleBaselines: () => ({}) }));
vi.mock("@/hooks/useProjectCalendar", () => ({ useProjectCalendar: (): { calendar: undefined } => ({ calendar: undefined }) }));
vi.mock("../schedule/useScheduleMutations", () => ({ useScheduleMutations: () => ({}) }));
vi.mock("../schedule/ScheduleBody", () => ({ default: () => <div>Schedule body</div> }));
vi.mock("@/services/permissions", () => ({ usePermissions: () => ({ can: () => true }) }));
vi.mock("@/lib/field/OutboxContext", () => ({
  useOutbox: () => outbox,
}));
vi.mock("@/lib/field/blobStore", () => ({ reconcilePendingPhotos: vi.fn(), putPendingPhoto: vi.fn() }));
vi.mock("@/utils/compressImage", () => ({ compressImage: async (file: File) => file }));
vi.mock("@/components/punchlist/PunchlistFormModal", () => ({
  default: ({ projectId, onSave }: { projectId: string; onSave: (record: Record<string, unknown>) => void }) =>
    <button onClick={() => onSave({ project_id: projectId, description: "Offline punch", status: "Open" })}>Save punch</button>,
}));

const cases = [
  { name: "Schedule", Page: Schedule, read: reads.schedule, label: "Schedule", empty: "No significant schedule risks detected." },
  { name: "Field Today", Page: FieldToday, read: reads.schedule, label: "Field Today", empty: "No open tasks for today." },
  { name: "Field Hub", Page: FieldHub, read: reads.safety, label: "Field Hub", empty: "No open safety or overdue items." },
];

beforeEach(() => {
  state.projectId = "project-1";
  Object.values(reads).forEach((read) => read.mockReset().mockResolvedValue([]));
  Object.values(writes).forEach((write) => write.mockReset().mockRejectedValue(new TypeError("Failed to fetch")));
  outbox.pending = 0;
  outbox.enqueue.mockClear();
  outbox.flush.mockClear();
});
afterEach(() => { cleanup(); onlineManager.setOnline(true); });

function LocationProbe() {
  return <output aria-label="Current URL">{useLocation().search}</output>;
}

function renderPage(Page: typeof Schedule | typeof FieldToday | typeof FieldHub, entry = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[entry]}><Page /><LocationProbe /></MemoryRouter></QueryClientProvider>);
  return client;
}

describe.each(cases)("$name query evidence", ({ Page, read, label, empty }) => {
  it("shows retry after a failed request, then shows confirmed empty data after recovery", async () => {
    read.mockRejectedValueOnce(new Error("Network unavailable"));
    renderPage(Page);
    expect(await screen.findByRole("alert", { name: label })).toBeInTheDocument();
    expect(screen.queryByText(empty)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(empty)).toBeInTheDocument();
  });

  it("keeps offline paused initial requests pending rather than claiming no issues", () => {
    onlineManager.setOnline(false);
    renderPage(Page);
    expect(screen.getByRole("status", { name: label })).toBeInTheDocument();
    expect(screen.queryByText(empty)).not.toBeInTheDocument();
    if (Page === FieldToday) {
      expect(screen.getByRole("button", { name: "Add Punch" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Photo" })).toBeEnabled();
    }
  });
});

it.each(cases.slice(0, 2))("$name requests a project before showing empty metrics", ({ Page, empty }) => {
  state.projectId = null;
  renderPage(Page);
  expect(screen.getByText("Select a project")).toBeInTheDocument();
  expect(screen.queryByText(empty)).not.toBeInTheDocument();
});

it.each([
  { Page: FieldToday, read: reads.punchlist, label: "Field Today" },
  { Page: FieldToday, read: reads.photos, label: "Field Today" },
  { Page: FieldHub, read: reads.punchlist, label: "Field Hub" },
])("guards supplementary field sources against failed reads", async ({ Page, read, label }) => {
  read.mockRejectedValueOnce(new Error("Source unavailable"));
  renderPage(Page);
  expect(await screen.findByRole("alert", { name: label })).toBeInTheDocument();
});

it("keeps cached schedule rows in cache but hides current-risk claims after a refetch failure", async () => {
  const savedTasks = [{ id: "task-1", project_id: "project-1", task_name: "Completed work", wbs_code: "1.1", percent_complete: 100, status: "Complete" }];
  reads.schedule.mockResolvedValue(savedTasks);
  const client = renderPage(Schedule);
  expect(await screen.findByText("No significant schedule risks detected.")).toBeInTheDocument();
  reads.schedule.mockRejectedValueOnce(new Error("Refresh failed"));
  await client.invalidateQueries({ queryKey: ["schedule-tasks", "project-1"] });
  await waitFor(() => expect(screen.getByRole("alert", { name: "Schedule" })).toBeInTheDocument());
  expect(client.getQueryData(["schedule-tasks", "project-1"])).toEqual(savedTasks);
  expect(screen.queryByText("No significant schedule risks detected.")).not.toBeInTheDocument();
});

it("retains a schedule record deep link through a failed read and consumes it after retry", async () => {
  reads.schedule.mockRejectedValueOnce(new Error("Network unavailable"));
  renderPage(Schedule, "/Schedule?recordId=task-1");
  expect(await screen.findByRole("alert", { name: "Schedule" })).toBeInTheDocument();
  expect(screen.getByLabelText("Current URL")).toHaveTextContent("recordId=task-1");
  reads.schedule.mockResolvedValue([{ id: "task-1", wbs_code: "1.1", task_name: "Requested task" }]);
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(screen.getByLabelText("Current URL")).toHaveTextContent(/^$/));
});

it("retains cold-error photo and punch captures and routes offline saves to the project outbox", async () => {
  reads.schedule.mockRejectedValue(new TypeError("Failed to fetch"));
  reads.photos.mockRejectedValue(new TypeError("Failed to fetch"));
  reads.punchlist.mockRejectedValue(new TypeError("Failed to fetch"));
  outbox.pending = 1;
  renderPage(FieldToday);
  expect(await screen.findByRole("alert", { name: "Field Today" })).toBeInTheDocument();
  expect(screen.queryByText("No open tasks for today.")).not.toBeInTheDocument();
  expect(screen.queryByText("No overdue schedule tasks.")).not.toBeInTheDocument();
  expect(screen.queryByText("0 Tasks")).not.toBeInTheDocument();
  expect(screen.queryByText("0 Photos Today")).not.toBeInTheDocument();
  expect(screen.queryByText("No open punch items.")).not.toBeInTheDocument();
  expect(screen.queryByText("No photos captured today.")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Add Punch" }));
  fireEvent.click(screen.getByRole("button", { name: "Save punch" }));
  await waitFor(() => expect(outbox.enqueue).toHaveBeenCalledWith(expect.objectContaining({
    type: "punch-create", payload: expect.objectContaining({ project_id: "project-1" }),
  })));
  expect(screen.getByRole("button", { name: "Photo" })).toBeEnabled();
  fireEvent.change(screen.getByLabelText("Capture field photo"), { target: { files: [new File(["image"], "field.jpg", { type: "image/jpeg" })] } });
  await waitFor(() => expect(outbox.enqueue).toHaveBeenCalledWith(expect.objectContaining({
    type: "photo-create", payload: expect.objectContaining({ meta: expect.objectContaining({ project_id: "project-1" }) }),
  })));
  fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
  expect(outbox.flush).toHaveBeenCalled();
});

it("keeps cached field task progress available with a stale disclosure after an offline refresh failure", async () => {
  const today = new Date().toISOString().slice(0, 10);
  reads.schedule.mockResolvedValue([{ id: "task-1", project_id: "project-1", task_name: "Cached erection task", start_date: today, end_date: today, percent_complete: 25 }]);
  const client = renderPage(FieldToday);
  expect(await screen.findByRole("button", { name: "Set progress 75%" })).toBeEnabled();
  reads.schedule.mockRejectedValue(new TypeError("Failed to fetch"));
  await client.invalidateQueries({ queryKey: ["schedule-tasks", "project-1"] });
  expect(await screen.findByRole("alert", { name: "Field Today" })).toBeInTheDocument();
  expect(screen.getByText(/cached schedule tasks.*stale/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Set progress 75%" }));
  await waitFor(() => expect(outbox.enqueue).toHaveBeenCalledWith(expect.objectContaining({
    type: "schedule-progress", payload: { id: "task-1", pct: 75 },
  })));
  expect(screen.getByRole("button", { name: "Add Punch" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Photo" })).toBeEnabled();
});

it("discloses paused cached field tasks without removing offline progress controls", async () => {
  const today = new Date().toISOString().slice(0, 10);
  reads.schedule.mockResolvedValue([{ id: "task-1", task_name: "Cached field task", start_date: today, end_date: today, percent_complete: 25 }]);
  const client = renderPage(FieldToday);
  expect(await screen.findByRole("button", { name: "Set progress 75%" })).toBeEnabled();
  onlineManager.setOnline(false);
  const refresh = client.invalidateQueries({ queryKey: ["schedule-tasks", "project-1"] });
  expect(await screen.findByText(/cached schedule tasks.*stale/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Set progress 75%" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Add Punch" })).toBeEnabled();
  onlineManager.setOnline(true);
  await refresh;
});
