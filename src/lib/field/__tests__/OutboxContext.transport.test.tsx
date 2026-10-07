// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OutboxProvider, useOutbox } from "../OutboxContext";
import { loadQueue, makeDailyLogCreateOp, makePhotoCreateOp, makePunchCreateOp, saveQueue } from "../offlineQueue";
import { setActiveOrgId } from "@/lib/activeOrg";
import { createReplayClient } from "../replayClient";
import { entities } from "@/api/client/entities";
import { UploadFile } from "@/api/client/uploads";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

const mocks = vi.hoisted(() => ({
  auth: { user: { id: "user-a" }, isAuthenticated: true },
  org: { currentOrg: { id: "org-a" }, isLoadingOrgs: false },
  getSession: vi.fn(), transport: vi.fn(),
  getBlob: vi.fn(), deleteBlob: vi.fn(),
}));
vi.mock("@/lib/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/components/shared/OrgContext", () => ({ useOrg: () => mocks.org }));
vi.mock("@/lib/field/blobStore", () => ({ getPendingPhoto: mocks.getBlob, deletePendingPhoto: mocks.deleteBlob }));
vi.mock("@/lib/supabase", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient("https://ci-placeholder.supabase.co", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: mocks.transport },
  });
  vi.spyOn(client.auth, "getSession").mockImplementation(mocks.getSession);
  return { supabase: client };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

beforeEach(() => {
  mocks.auth.user = { id: "user-a" };
  mocks.org.currentOrg = { id: "org-a" };
  mocks.getBlob.mockReset().mockResolvedValue({ blob: new Blob(["photo"], { type: "image/jpeg" }), meta: { name: "photo.jpg" } });
  mocks.deleteBlob.mockReset().mockResolvedValue(undefined);
  mocks.getSession.mockReset().mockResolvedValue({ data: { session: { access_token: "original-token-a", user: { id: "user-a" } } }, error: null });
  mocks.transport.mockReset().mockImplementation(async () => new Response(JSON.stringify({ id: "record", Key: "photo.jpg" }), { headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", mocks.transport);
});
afterEach(() => { cleanup(); setActiveOrgId(null); localStorage.clear(); vi.unstubAllGlobals(); });

it("does not dispatch a write when the real SDK resolves its auth lock with a replacement user", async () => {
  let resolveSession!: (value: unknown) => void;
  mocks.getSession.mockReturnValue(new Promise((resolve) => { resolveSession = resolve; }));
  mocks.transport.mockResolvedValue(new Response(JSON.stringify({ id: "punch-a" }), { headers: { "Content-Type": "application/json" } }));
  setActiveOrgId("org-a");
  saveQueue([{ ...makePunchCreateOp({ title: "A private draft", project_id: "shared-project" }, "capture-a", 1), owner: { userId: "user-a", orgId: "org-a" } }]);
  const client = new QueryClient();
  const tree = () => <QueryClientProvider client={client}><OutboxProvider><span>App</span></OutboxProvider></QueryClientProvider>;
  const view = render(tree());
  await waitFor(() => expect(mocks.getSession).toHaveBeenCalledTimes(1));
  act(() => {
    setActiveOrgId(null);
    mocks.auth.user = { id: "user-b" };
    localStorage.clear();
    setActiveOrgId("org-a");
    view.rerender(tree());
  });
  await act(async () => { resolveSession({ data: { session: { access_token: "replacement-token-b", user: { id: "user-b" } } }, error: null }); });
  expect(mocks.transport).not.toHaveBeenCalled();
});

type BoundClient = SupabaseClient<Database>;
const captureId = "22222222-2222-4222-8222-222222222222";
const operations: Record<string, (client: BoundClient) => Promise<unknown>> = {
  punch: (client) => entities.PunchlistItem.create({ description: "Punch", project_id: "shared-project", photos: '[{"file_url":"photo.jpg"}]', client_op_id: captureId }, { client }),
  dailyLog: (client) => entities.DailyLog.create({ project_id: "shared-project", date: "2026-10-07", client_op_id: captureId }, { client }),
  photo: (client) => entities.Photo.create({ project_id: "shared-project", file_url: "photo.jpg", client_op_id: captureId }, { client }),
  scheduleRead: (client) => entities.ScheduleTask.get("task", { client }),
  scheduleUpdate: (client) => entities.ScheduleTask.update("task", { percent_complete: 50 }, { client }),
  upload: (client) => UploadFile({ file: new File(["photo"], "photo.jpg", { type: "image/jpeg" }), client }),
};

it.each(Object.keys(operations))("aborts %s at the real SDK transport boundary after token resolution begins", async (operation) => {
  setActiveOrgId("11111111-1111-4111-8111-111111111111");
  const controller = new AbortController();
  const bound = await createReplayClient("user-a", () => {}, controller.signal);
  // A shared client would now read B; the bound client must also respect an
  // abort that happens while its own async accessToken callback yields.
  mocks.getSession.mockResolvedValue({ data: { session: { access_token: "replacement-token-b", user: { id: "user-b" } } }, error: null });
  const request = operations[operation](bound);
  controller.abort();
  await request.catch((): undefined => undefined);
  expect(mocks.transport).not.toHaveBeenCalled();
});

it.each(Object.keys(operations))("keeps %s bound to its captured caller token and existing entity normalization", async (operation) => {
  setActiveOrgId("11111111-1111-4111-8111-111111111111");
  const bound = await createReplayClient("user-a", () => {}, new AbortController().signal);
  mocks.getSession.mockResolvedValue({ data: { session: { access_token: "replacement-token-b", user: { id: "user-b" } } }, error: null });
  await operations[operation](bound);
  expect(mocks.transport).toHaveBeenCalledTimes(1);
  const request = mocks.transport.mock.calls[0][1] as RequestInit;
  expect(new Headers(request.headers).get("Authorization")).toBe("Bearer original-token-a");
  if (["punch", "dailyLog", "photo"].includes(operation)) expect(JSON.parse(String(request.body)).client_op_id).toBe(captureId);
  if (operation === "punch") expect(JSON.parse(String(request.body)).photos).toEqual([{ file_url: "photo.jpg" }]);
  if (operation === "scheduleUpdate") expect(JSON.parse(String(request.body))).toMatchObject({ percent_complete: 50, status: "In Progress" });
});

it.each(["punch", "dailyLog", "photo"])("deduplicates %s replay after the server commits but its first response is lost", async (operation) => {
  const orgId = "11111111-1111-4111-8111-111111111111";
  mocks.org.currentOrg = { id: orgId };
  setActiveOrgId(orgId);
  const committed = new Set<string>();
  const insertBodies: Record<string, unknown>[] = [];
  mocks.transport.mockImplementation(async (input: string | URL | Request, init: RequestInit) => {
    if (String(input).includes("/storage/v1/")) {
      return new Response(JSON.stringify({ Key: "app-files/photo.jpg" }), { headers: { "Content-Type": "application/json" } });
    }
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    insertBodies.push(body);
    const key = String(body.client_op_id);
    if (committed.has(key)) {
      return new Response(JSON.stringify({ code: "23505", message: "duplicate key violates unique constraint on client_op_id" }), {
        status: 409, headers: { "Content-Type": "application/json" },
      });
    }
    committed.add(key);
    throw new TypeError("Failed to fetch");
  });
  let outbox!: ReturnType<typeof useOutbox>;
  function Probe(): null { outbox = useOutbox(); return null; }
  const queryClient = new QueryClient();
  render(<QueryClientProvider client={queryClient}><OutboxProvider><Probe /></OutboxProvider></QueryClientProvider>);
  const record = { id: "discarded-form-id", project_id: "shared-project", client_op_id: captureId };
  const op = operation === "punch"
    ? makePunchCreateOp({ ...record, description: "Loose bolt" }, captureId, 1)
    : operation === "dailyLog"
      ? makeDailyLogCreateOp({ ...record, date: "2026-10-07" }, captureId, 1)
      : makePhotoCreateOp(captureId, { project_id: "shared-project" }, 1);
  act(() => { outbox.enqueue(op); });
  await act(async () => { await outbox.flush(); });
  expect(loadQueue()).toHaveLength(1);
  expect(committed.size).toBe(1);
  if (operation === "photo") expect(mocks.deleteBlob).not.toHaveBeenCalled();

  await act(async () => { await outbox.flush(); });
  expect(insertBodies).toHaveLength(2);
  expect(insertBodies.every(body => body.client_op_id === captureId && !("id" in body))).toBe(true);
  expect(committed.size).toBe(1);
  expect(loadQueue()).toEqual([]);
  if (operation === "photo") expect(mocks.deleteBlob).toHaveBeenCalledExactlyOnceWith(captureId);
});
