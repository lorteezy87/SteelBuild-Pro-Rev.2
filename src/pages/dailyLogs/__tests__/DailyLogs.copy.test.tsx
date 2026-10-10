// @vitest-environment jsdom
import React from "react";
import type { ComponentProps } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  projectId: "project-1" as string | null,
  filter: vi.fn(), list: vi.fn(), create: vi.fn(), update: vi.fn(),
  enqueue: vi.fn(), flush: vi.fn(), error: vi.fn(),
  projectAddress: "", weather: vi.fn(),
  audit: vi.fn(), enqueueOther: vi.fn(), success: vi.fn(), message: vi.fn(),
  lastSave: null as null | ((data: Record<string, unknown>) => void),
}));

vi.mock("@/api/supabaseClient", () => ({
  entities: {
    DailyLog: { filter: mocks.filter, list: mocks.list, create: mocks.create, update: mocks.update },
    Project: { list: vi.fn(async () => [{ id: "project-1", name: "Erection job", address: mocks.projectAddress }]) },
    ActionItem: { filter: vi.fn().mockResolvedValue([]), list: vi.fn().mockResolvedValue([]) },
    RFI: { filter: vi.fn().mockResolvedValue([]), list: vi.fn().mockResolvedValue([]) },
    Delivery: { filter: vi.fn().mockResolvedValue([]) },
  },
}));
vi.mock("@/hooks/useProjectId", () => ({ useProjectId: () => mocks.projectId }));
vi.mock("@/hooks/useRealtimeInvalidation", () => ({ useRealtimeInvalidation: (): undefined => undefined }));
vi.mock("@/services/permissions", () => ({ usePermissions: () => ({ can: () => true }) }));
vi.mock("@/services/auditLogger", () => ({ logActivity: mocks.audit }));
vi.mock("@/lib/field/OutboxContext", () => ({ useOutbox: () => ({ enqueue: mocks.projectId === "project-1" ? mocks.enqueue : mocks.enqueueOther, flush: mocks.flush }) }));
vi.mock("@/components/shared/PhotoStripUploader", () => ({ default: (): null => null }));
vi.mock("@/components/shared/weatherUtils", () => ({ getCurrentWeather: mocks.weather, geocodeAddress: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, message: mocks.message, error: mocks.error } }));
// Observe queued callbacks while rendering the actual form and all its controls.
vi.mock("@/components/fieldops/DailyLogForm", async importOriginal => {
  const actual = await importOriginal<typeof import("@/components/fieldops/DailyLogForm")>();
  return { default: (props: ComponentProps<typeof actual.default>) => {
    mocks.lastSave = props.onSave;
    return <actual.default {...props} />;
  } };
});

import DailyLogs from "@/pages/DailyLogs";
import DailyLogForm from "@/components/fieldops/DailyLogForm";

const previousLog = {
  id: "prior-log", project_id: "project-1", client_op_id: "prior-operation",
  date: "2026-10-05", created_at: "2026-10-05T22:00:00Z", updated_at: "2026-10-05T23:00:00Z",
  crew_name: "Erection A", headcount: 6, superintendent: "Site superintendent",
  equipment_used: "80-ton crane", hours_worked: 8, activities: "Yesterday's erection work",
  materials_received: "Yesterday's steel delivery", delays: "Yesterday's weather delay", delay_hours: 3,
  safety_incidents: 1, safety_notes: "Yesterday's incident", photos: ["prior-photo.jpg"],
  weather_description: "Rain", temperature: "62", wind_speed: "20",
  related_action_item_ids: ["prior-action"], related_rfi_ids: ["prior-rfi"], delivery_ids: ["prior-delivery"],
  metadata: { weather_auto: { source: "open-meteo", fetched_at: "2026-10-05T20:00:00Z" }, incident: "old" },
};

let queryClient: QueryClient;
function openPage(route = "/DailyLogs") {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const tree = () => <QueryClientProvider client={queryClient}><MemoryRouter initialEntries={[route]}><DailyLogs /></MemoryRouter></QueryClientProvider>;
  return { ...render(tree()), tree };
}

async function copyAndSave() {
  await screen.findByText("1 · ENTRIES");
  fireEvent.click(screen.getByRole("button", { name: "Copy Yesterday" }));
  expect(screen.getByRole("heading", { name: "New Daily Log" })).toBeInTheDocument();
  expect(screen.getByDisplayValue("Erection A")).toBeInTheDocument();
  expect(screen.getByPlaceholderText("Describe work performed, progress, accomplishments...")).toHaveValue("");
  fireEvent.change(screen.getByPlaceholderText("Describe work performed, progress, accomplishments..."), { target: { value: "Today's reviewed erection work" } });
  fireEvent.click(screen.getByRole("button", { name: "Save Log" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.projectId = "project-1";
  mocks.projectAddress = "";
  mocks.lastSave = null;
  mocks.filter.mockResolvedValue([previousLog]);
  mocks.list.mockResolvedValue([previousLog]);
  mocks.create.mockImplementation(async (draft: Record<string, unknown>) => ({ ...draft, id: "new-log" }));
  mocks.update.mockImplementation(async (id: string, draft: Record<string, unknown>) => ({ ...draft, id }));
  // The UTC clock is already tomorrow while the user's local calendar is October 6.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-07T02:30:00Z"));
  vi.spyOn(Date.prototype, "getFullYear").mockReturnValue(2026);
  vi.spyOn(Date.prototype, "getMonth").mockReturnValue(9);
  vi.spyOn(Date.prototype, "getDate").mockReturnValue(6);
});

afterEach(() => {
  cleanup();
  queryClient?.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("DailyLogs copy and edit", () => {
  it("creates a fresh log for the current job and local day, keeping only reviewed reusable defaults", async () => {
    openPage();
    await copyAndSave();
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.update).not.toHaveBeenCalled();
    const draft = mocks.create.mock.calls[0][0];
    expect(draft).toMatchObject({
      project_id: "project-1", date: "2026-10-06", crew_name: "Erection A", headcount: 6,
      superintendent: "Site superintendent", equipment_used: "80-ton crane", activities: "Today's reviewed erection work",
      hours_worked: 0, materials_received: "", delays: "", delay_hours: 0, safety_incidents: 0, safety_notes: "",
      photos: [], weather_description: "", temperature: null, wind_speed: null,
      related_action_item_ids: [], related_rfi_ids: [], delivery_ids: [],
      client_op_id: expect.any(String),
    });
    expect(draft.client_op_id).not.toBe(previousLog.client_op_id);
    for (const key of ["id", "created_at", "updated_at"]) expect(draft).not.toHaveProperty(key);
    expect(draft.metadata).not.toHaveProperty("weather_auto");
    expect(draft.metadata).not.toHaveProperty("incident");
    expect(previousLog.activities).toBe("Yesterday's erection work");
  });

  it("updates an existing log opened from its record link, retaining its historical evidence", async () => {
    openPage("/DailyLogs?id=prior-log");
    await screen.findByRole("heading", { name: "Edit Daily Log" });
    fireEvent.change(screen.getByPlaceholderText("Describe work performed, progress, accomplishments..."), { target: { value: "Corrected erection work" } });
    fireEvent.click(screen.getByRole("button", { name: "Update Log" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith("prior-log", expect.objectContaining({
      id: "prior-log", project_id: "project-1", date: "2026-10-05", client_op_id: "prior-operation",
      activities: "Corrected erection work", photos: ["prior-photo.jpg"], safety_incidents: 1,
      metadata: expect.objectContaining({ weather_auto: previousLog.metadata.weather_auto }),
    }));
  });

  it("also initializes an ordinary new log on the local calendar day", async () => {
    openPage();
    fireEvent.click(screen.getByRole("button", { name: "New Log" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Log" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ date: "2026-10-06", project_id: "project-1" }));
  });

  it("queues a copied create with the same fresh operation id when the online save fails offline", async () => {
    mocks.create.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    openPage();
    await copyAndSave();
    await waitFor(() => expect(mocks.enqueue).toHaveBeenCalledTimes(1));
    const attempted = mocks.create.mock.calls[0][0];
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      type: "daily-log-create", id: attempted.client_op_id,
      payload: expect.objectContaining({ project_id: "project-1", date: "2026-10-06", client_op_id: attempted.client_op_id }),
    }));
    expect(attempted.client_op_id).not.toBe(previousLog.client_op_id);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("requires a current project before copying from the all-projects register", async () => {
    mocks.projectId = null;
    openPage();
    await screen.findByText("1 · ENTRIES");
    fireEvent.click(screen.getByRole("button", { name: "Copy Yesterday" }));
    expect(mocks.error).toHaveBeenCalledWith("Select a project before copying a daily log.");
    expect(screen.queryByPlaceholderText("Describe work performed, progress, accomplishments...")).not.toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("does not reuse a different project's crew defaults from a stale register result", async () => {
    mocks.filter.mockResolvedValue([{ ...previousLog, project_id: "another-project" }]);
    openPage();
    await screen.findByText("1 · ENTRIES");
    fireEvent.click(screen.getByRole("button", { name: "Copy Yesterday" }));
    expect(mocks.error).toHaveBeenCalledWith("No previous logs to copy from");
    expect(screen.queryByPlaceholderText("Describe work performed, progress, accomplishments...")).not.toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("clears historical evidence when switching an open existing log to a copied draft", async () => {
    openPage("/DailyLogs?id=prior-log");
    await screen.findByRole("heading", { name: "Edit Daily Log" });
    await copyAndSave();
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    const draft = mocks.create.mock.calls[0][0];
    expect(draft).not.toHaveProperty("id");
    expect(draft.metadata).not.toHaveProperty("weather_auto");
    expect(draft.photos).toEqual([]);
    expect(draft.safety_incidents).toBe(0);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each(["copy", "edit"])("closes the %s draft on project change and rejects its retained save callback", async mode => {
    const page = openPage(mode === "edit" ? "/DailyLogs?id=prior-log" : "/DailyLogs");
    if (mode === "copy") {
      await screen.findByText("1 · ENTRIES");
      fireEvent.click(screen.getByRole("button", { name: "Copy Yesterday" }));
    } else await screen.findByRole("heading", { name: "Edit Daily Log" });
    const staleSave = mocks.lastSave!;
    mocks.projectId = "project-2";
    mocks.filter.mockResolvedValue([]);
    page.rerender(page.tree());
    expect(screen.queryByPlaceholderText("Describe work performed, progress, accomplishments...")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "New Log" }));
    await act(async () => { staleSave({ ...previousLog, activities: "Old project draft" }); });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "New Daily Log" })).toBeInTheDocument();
  });

  it.each(["create", "update"] as const)("keeps a newer project's form and cache when an older %s finishes", async mode => {
    let finish!: (record: Record<string, unknown>) => void;
    mocks[mode].mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const page = openPage(mode === "update" ? "/DailyLogs?id=prior-log" : "/DailyLogs");
    if (mode === "create") await copyAndSave();
    else {
      await screen.findByRole("heading", { name: "Edit Daily Log" });
      fireEvent.click(screen.getByRole("button", { name: "Update Log" }));
    }
    await waitFor(() => expect(mocks[mode]).toHaveBeenCalledTimes(1));
    mocks.projectId = "project-2";
    const created = { ...previousLog, id: mode === "create" ? "created-a" : previousLog.id };
    mocks.filter.mockImplementation(async ({ project_id }: { project_id: string }) => project_id === "project-1" ? [created] : []);
    page.rerender(page.tree());
    await screen.findByText("0 · ENTRIES");
    fireEvent.click(screen.getByRole("button", { name: "New Log" }));
    fireEvent.change(screen.getByPlaceholderText("Describe work performed, progress, accomplishments..."), { target: { value: "Project B unsaved work" } });
    await act(async () => { finish(created); });
    expect(screen.getByPlaceholderText("Describe work performed, progress, accomplishments...")).toHaveValue("Project B unsaved work");
    expect(queryClient.getQueryData(["daily-logs", "project-2"])).toEqual([]);
    expect(mocks.audit).toHaveBeenCalledWith("daily_log", mode === "create" ? "created" : "updated", created, expect.objectContaining({ projectId: "project-1" }));
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("does not close a newer draft in the same project when the prior create finishes", async () => {
    let finish!: (record: Record<string, unknown>) => void;
    mocks.create.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    openPage();
    await copyAndSave();
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "New Log" }));
    fireEvent.change(screen.getByPlaceholderText("Describe work performed, progress, accomplishments..."), { target: { value: "Next unsaved draft" } });
    await act(async () => { finish({ ...previousLog, id: "created-a" }); });
    expect(screen.getByPlaceholderText("Describe work performed, progress, accomplishments...")).toHaveValue("Next unsaved draft");
  });

  it("queues a late offline failure through its captured outbox with its original project and operation", async () => {
    let fail!: (error: Error) => void;
    mocks.create.mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject; }));
    const page = openPage();
    await copyAndSave();
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    const original = mocks.create.mock.calls[0][0];
    mocks.projectId = "project-2";
    mocks.filter.mockResolvedValue([]);
    page.rerender(page.tree());
    fireEvent.click(screen.getByRole("button", { name: "New Log" }));
    await act(async () => { fail(new TypeError("Failed to fetch")); });
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({ id: original.client_op_id, payload: original }));
    expect(mocks.enqueueOther).not.toHaveBeenCalled();
    expect(mocks.message).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "New Daily Log" })).toBeInTheDocument();
  });

  it("does not overwrite historical weather when a copied draft's weather response arrives late", async () => {
    mocks.projectAddress = "Fixture site address";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [{ latitude: 33, longitude: -112 }] }) }));
    let finishWeather!: (weather: { temperature: number; windSpeed: number; description: string }) => void;
    mocks.weather.mockReturnValueOnce(new Promise(resolve => { finishWeather = resolve; }));
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(["projects-for-daily-log", "project-1"], [{ id: "project-1", address: mocks.projectAddress }]);
    const save = vi.fn();
    const tree = (log: Record<string, unknown>) => <QueryClientProvider client={queryClient}>
      <DailyLogForm projectId="project-1" log={log} onSave={save} onClose={vi.fn()} isSaving={false} />
    </QueryClientProvider>;
    const view = render(tree({ project_id: "project-1", date: "2026-10-06", crew_name: "Erection A" }));
    await waitFor(() => expect(mocks.weather).toHaveBeenCalledTimes(1));
    view.rerender(tree(previousLog));
    await act(async () => { finishWeather({ temperature: 100, windSpeed: 2, description: "Today's clear skies" }); });
    fireEvent.click(screen.getByRole("button", { name: "Update Log" }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      id: "prior-log", weather_description: "Rain", temperature: "62", wind_speed: "20",
      metadata: expect.objectContaining({ weather_auto: previousLog.metadata.weather_auto }),
    }));
  });

  it("preserves manually entered weather and does not label it as an automatic reading", async () => {
    mocks.projectAddress = "Fixture site address";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [{ latitude: 33, longitude: -112 }] }) }));
    let finish!: (weather: { temperature: number; windSpeed: number; description: string }) => void;
    mocks.weather.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(["projects-for-daily-log", "project-1"], [{ id: "project-1", address: mocks.projectAddress }]);
    const save = vi.fn();
    render(<QueryClientProvider client={queryClient}><DailyLogForm projectId="project-1" log={null} onSave={save} onClose={vi.fn()} isSaving={false} /></QueryClientProvider>);
    await waitFor(() => expect(mocks.weather).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByPlaceholderText("Sunny, Cloudy, Rainy, etc."), { target: { value: "Observed dust storm" } });
    await act(async () => { finish({ temperature: 100, windSpeed: 2, description: "Clear skies" }); });
    fireEvent.click(screen.getByRole("button", { name: "Save Log" }));
    const saved = save.mock.calls[0][0];
    expect(saved.weather_description).toBe("Observed dust storm");
    expect(saved.temperature).toBeNull();
    expect(saved.wind_speed).toBeNull();
    expect(saved.metadata).not.toHaveProperty("weather_auto");
    expect(screen.queryByText(/Auto-pulled from/)).not.toBeInTheDocument();
  });
});
