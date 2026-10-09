// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Toaster, toast } from "sonner";
import { setActiveOrgId } from "@/lib/activeOrg";
import type { CloseoutDbRow } from "@/lib/closeout/closeoutPayload";
import ProjectCloseout from "../ProjectCloseout";

const api = vi.hoisted(() => ({
  projectId: null as string | null,
  list: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
}));
vi.mock("@/hooks/useProjectId", () => ({ useProjectId: () => api.projectId }));
vi.mock("@/api/supabaseClient", () => ({
  entities: {
    Project: { list: async (): Promise<Array<{ id: string; name: string }>> => [] },
    ProjectCloseout: { list: api.list, filter: api.list, update: api.update, create: api.create },
  },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const firstCloseout: CloseoutDbRow = {
  id: "closeout-a", project_id: "project-a", status: "In Progress",
  final_inspection_date: null, lessons_learned: "Private company A lessons",
};
const secondCloseout: CloseoutDbRow = {
  id: "closeout-b", project_id: "project-b", status: "In Progress",
  final_inspection_date: null, lessons_learned: "Company B lessons",
};
let client: QueryClient;

function openPage() {
  return render(
    <QueryClientProvider client={client}>
      <ProjectCloseout />
      <Toaster />
    </QueryClientProvider>,
  );
}

async function beginUpdate() {
  const request = deferred<typeof firstCloseout>();
  api.update.mockReturnValueOnce(request.promise);
  const view = openPage();
  fireEvent.click(await screen.findByRole("button", { name: "Final Inspection: not done" }));
  await waitFor(() => expect(api.update).toHaveBeenCalledWith("closeout-a", {
    final_inspection_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
  }));
  return { request, view };
}

beforeEach(() => {
  vi.resetAllMocks();
  api.projectId = null;
  setActiveOrgId("org-a");
  client = new QueryClient({ defaultOptions: {
    queries: { retry: false, gcTime: Infinity }, mutations: { retry: false },
  } });
  api.list.mockResolvedValue([firstCloseout]);
  api.update.mockResolvedValue(firstCloseout);
});
afterEach(() => {
  toast.dismiss();
  cleanup();
  client.clear();
  setActiveOrgId(null);
  vi.restoreAllMocks();
});

// Regression: removing the owner guard restores A's snapshot over B's cache,
// and a stale success invalidates B's data and announces A's save to B.
it.each(["reject", "resolve"] as const)("ignores an old workspace update that later %ss", async (outcome) => {
  const { request, view } = await beginUpdate();
  view.unmount();
  setActiveOrgId("org-b");
  client.clear();
  api.list.mockResolvedValue([secondCloseout]);
  openPage();
  fireEvent.click(await screen.findByRole("button", { name: "Lessons Learned" }));
  expect(screen.getByText("Company B lessons")).toBeInTheDocument();
  const readsBeforeCompletion = api.list.mock.calls.length;
  const toastsBeforeCompletion = toast.getHistory().length;
  api.list.mockReturnValue(new Promise(() => {}));
  await act(async () => {
    if (outcome === "reject") request.reject(new Error("A's delayed save failed"));
    else request.resolve({ ...firstCloseout, final_inspection_date: "2026-10-07" });
  });
  expect(client.getQueryData(["closeouts", null])).toEqual([secondCloseout]);
  expect(screen.queryByText("Private company A lessons")).not.toBeInTheDocument();
  expect(screen.queryByText(/Closeout updated|A's delayed save failed/)).not.toBeInTheDocument();
  expect(api.list).toHaveBeenCalledTimes(readsBeforeCompletion);
  expect(toast.getHistory()).toHaveLength(toastsBeforeCompletion);
});

// A->signed out->A must invalidate old work even though the org ID is equal;
// this also proves generation checks operate before React rerenders/unmounts.
it("does not revive a snapshot after the same workspace signs in again", async () => {
  const { request } = await beginUpdate();
  setActiveOrgId(null);
  setActiveOrgId("org-a");
  await act(async () => { client.setQueryData(["closeouts", null], [secondCloseout]); });
  const readsBeforeCompletion = api.list.mock.calls.length;
  await act(async () => { request.reject(new Error("Previous session failed")); });
  expect(client.getQueryData(["closeouts", null])).toEqual([secondCloseout]);
  expect(api.list).toHaveBeenCalledTimes(readsBeforeCompletion);
  expect(screen.queryByText(/Previous session failed/)).not.toBeInTheDocument();
});

it("does not restore an unmounted screen's snapshot even without an org change", async () => {
  const { request, view } = await beginUpdate();
  view.unmount();
  client.clear();
  await act(async () => { request.reject(new Error("Abandoned save failed")); });
  expect(client.getQueryData(["closeouts", null])).toBeUndefined();
});

it("does not roll the prior project's snapshot into a changed project on the same mounted screen", async () => {
  const { request, view } = await beginUpdate();
  api.projectId = "project-b";
  api.list.mockResolvedValue([secondCloseout]);
  view.rerender(
    <QueryClientProvider client={client}>
      <ProjectCloseout />
      <Toaster />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Lessons Learned" }));
  await screen.findByText("Company B lessons");
  client.removeQueries({ queryKey: ["closeouts", null], exact: true });
  const readsBeforeCompletion = api.list.mock.calls.length;
  const toastsBeforeCompletion = toast.getHistory().length;
  await act(async () => { request.reject(new Error("Prior project's save failed")); });
  expect(client.getQueryData(["closeouts", null])).toBeUndefined();
  expect(client.getQueryData(["closeouts", "project-b"])).toEqual([secondCloseout]);
  expect(api.list).toHaveBeenCalledTimes(readsBeforeCompletion);
  expect(toast.getHistory()).toHaveLength(toastsBeforeCompletion);
});

it("does not start the write or optimistic update after a scope change during query cancellation", async () => {
  const cancellation = deferred<void>();
  const cancelQueries = client.cancelQueries.bind(client);
  vi.spyOn(client, "cancelQueries").mockImplementationOnce(async (filters) => {
    await cancelQueries(filters);
    await cancellation.promise;
  });
  const view = openPage();
  fireEvent.click(await screen.findByRole("button", { name: "Final Inspection: not done" }));
  await waitFor(() => expect(client.cancelQueries).toHaveBeenCalled());
  view.unmount();
  setActiveOrgId("org-b");
  client.clear();
  client.setQueryData(["closeouts", null], [secondCloseout]);
  await act(async () => { cancellation.resolve(); });
  expect(api.update).not.toHaveBeenCalled();
  expect(client.getQueryData(["closeouts", null])).toEqual([secondCloseout]);
});

it("restores the current workspace's checklist when its save fails", async () => {
  const { request } = await beginUpdate();
  expect(await screen.findByRole("button", { name: "Final Inspection: done" })).toBeDisabled();
  // Keep the post-error refetch pending so this proves the rollback itself.
  const refetch = deferred<typeof firstCloseout[]>();
  api.list.mockReturnValue(refetch.promise);
  await act(async () => { request.reject(new Error("Save was refused")); });
  expect(await screen.findByRole("button", { name: "Final Inspection: not done" })).toBeInTheDocument();
  expect(client.getQueryData(["closeouts", null])).toEqual([firstCloseout]);
  expect(await screen.findByText("Save was refused")).toBeInTheDocument();
  await act(async () => { refetch.resolve([firstCloseout]); });
  await waitFor(() => expect(screen.getByRole("button", { name: "Final Inspection: not done" })).toBeEnabled());
});

it("keeps a confirmed current-workspace update and reports its success", async () => {
  const { request } = await beginUpdate();
  const saved = { ...firstCloseout, final_inspection_date: "2026-10-07" };
  api.list.mockResolvedValue([saved]);
  await act(async () => { request.resolve(saved); });
  await waitFor(() => expect(screen.getByRole("button", { name: "Final Inspection: done" })).toBeEnabled());
  expect(client.getQueryData(["closeouts", null])).toEqual([saved]);
  expect(await screen.findByText("Closeout updated")).toBeInTheDocument();
});

it("refreshes the current project's closeout after creating it", async () => {
  api.projectId = "project-a";
  api.list.mockResolvedValueOnce([]).mockResolvedValue([firstCloseout]);
  api.create.mockResolvedValue(firstCloseout);
  openPage();
  fireEvent.click(await screen.findByRole("button", { name: "Start Closeout" }));
  expect(await screen.findByRole("button", { name: "Final Inspection: not done" })).toBeInTheDocument();
  expect(client.getQueryData(["closeouts", "project-a"])).toEqual([firstCloseout]);
  expect(await screen.findByText("Closeout record created")).toBeInTheDocument();
});

it.each(["reject", "resolve"] as const)("does not announce an old account's create when it later %ss", async (outcome) => {
  api.projectId = "project-a";
  api.list.mockResolvedValue([]);
  const request = deferred<typeof firstCloseout>();
  api.create.mockReturnValueOnce(request.promise);
  const view = openPage();
  fireEvent.click(await screen.findByRole("button", { name: "Start Closeout" }));
  await waitFor(() => expect(api.create).toHaveBeenCalledOnce());
  view.unmount();
  setActiveOrgId(null);
  setActiveOrgId("org-b");
  client.clear();
  api.projectId = "project-b";
  api.list.mockResolvedValue([secondCloseout]);
  openPage();
  await screen.findByRole("button", { name: "Lessons Learned" });
  const invalidations = vi.spyOn(client, "invalidateQueries");
  const toastsBeforeCompletion = toast.getHistory().length;
  await act(async () => {
    if (outcome === "reject") request.reject(new Error("Private create rejection"));
    else request.resolve(firstCloseout);
  });
  expect(screen.queryByText(/Private create rejection|Closeout record created/)).not.toBeInTheDocument();
  expect(invalidations).not.toHaveBeenCalled();
  expect(toast.getHistory()).toHaveLength(toastsBeforeCompletion);
});
