// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { OutboxProvider, useOutbox } from "../OutboxContext";
import { loadQueue, makePhotoCreateOp, makeProgressOp, makePunchCreateOp, saveQueue } from "../offlineQueue";
import { setActiveOrgId } from "@/lib/activeOrg";

const mocks = vi.hoisted(() => ({
  auth: { user: { id: "user-a" }, isAuthenticated: true, isLoadingAuth: false, isCheckingMfa: false, mfaRequired: false, mfaStatusDegraded: false, isPasswordRecovery: false },
  org: { currentOrg: { id: "org-a" }, isLoadingOrgs: false },
  punch: vi.fn(), dailyLog: vi.fn(), getTask: vi.fn(), updateTask: vi.fn(),
  upload: vi.fn(), createPhoto: vi.fn(), getBlob: vi.fn(), deleteBlob: vi.fn(),
}));
vi.mock("@/lib/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/components/shared/OrgContext", () => ({ useOrg: () => mocks.org }));
vi.mock("@/api/supabaseClient", () => ({
  entities: {
    PunchlistItem: { create: mocks.punch }, DailyLog: { create: mocks.dailyLog },
    ScheduleTask: { get: mocks.getTask, update: mocks.updateTask }, Photo: { create: mocks.createPhoto },
  },
  integrations: { Core: { UploadFile: mocks.upload } },
}));
vi.mock("@/lib/field/blobStore", () => ({ getPendingPhoto: mocks.getBlob, deletePendingPhoto: mocks.deleteBlob }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/lib/field/replayClient", () => ({ createReplayClient: async () => ({}) }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const owner = { userId: "user-a", orgId: "org-a" };
const punch = (id: string) => ({ ...makePunchCreateOp({ project_id: "shared-project", title: id }, id, 1), owner });
function Probe() {
  const { pending } = useOutbox();
  return <output aria-label="Pending captures">{pending}</output>;
}
function mountOutbox() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidation = vi.spyOn(client, "invalidateQueries");
  const tree = () => <QueryClientProvider client={client}><OutboxProvider><Probe /></OutboxProvider></QueryClientProvider>;
  return { ...render(tree()), redraw: tree, invalidation };
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  Object.assign(mocks.auth, { user: { id: "user-a" }, isAuthenticated: true, isLoadingAuth: false, isCheckingMfa: false, mfaRequired: false, mfaStatusDegraded: false, isPasswordRecovery: false });
  Object.assign(mocks.org, { currentOrg: { id: "org-a" }, isLoadingOrgs: false });
  setActiveOrgId("org-a");
  mocks.punch.mockResolvedValue({ id: "punch" });
  mocks.getTask.mockResolvedValue({ id: "task", status: "Not Started", percent_complete: 0 });
  mocks.updateTask.mockResolvedValue({ id: "task" });
  mocks.getBlob.mockResolvedValue({ blob: new Blob(["photo"], { type: "image/jpeg" }), meta: { name: "photo.jpg" } });
  mocks.upload.mockResolvedValue({ file_url: "org-a/photo.jpg" });
  mocks.createPhoto.mockResolvedValue({ id: "photo" });
  mocks.deleteBlob.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); setActiveOrgId(null); });

describe("outbox identity boundary", () => {
  it.each(["signed out", "auth loading", "MFA checking", "MFA required", "MFA unavailable", "recovery", "workspace loading"])("does not drain while %s", async (state) => {
    saveQueue([punch("a")]);
    if (state === "signed out") mocks.auth.isAuthenticated = false;
    if (state === "auth loading") mocks.auth.isLoadingAuth = true;
    if (state === "MFA checking") mocks.auth.isCheckingMfa = true;
    if (state === "MFA required") mocks.auth.mfaRequired = true;
    if (state === "MFA unavailable") mocks.auth.mfaStatusDegraded = true;
    if (state === "recovery") mocks.auth.isPasswordRecovery = true;
    if (state === "workspace loading") mocks.org.isLoadingOrgs = true;
    mountOutbox();
    await act(async () => { window.dispatchEvent(new Event("online")); });
    expect(mocks.punch).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Pending captures").textContent).toBe("0");
    expect(loadQueue()).toHaveLength(1);
  });

  it("cancels the remaining snapshot on sign-out and does not publish stale effects", async () => {
    const first = deferred<unknown>();
    mocks.punch.mockReturnValueOnce(first.promise);
    saveQueue([punch("a"), punch("b")]);
    const view = mountOutbox();
    await waitFor(() => expect(mocks.punch).toHaveBeenCalledTimes(1));
    act(() => {
      setActiveOrgId(null);
      localStorage.clear(); // AuthContext's synchronous tenant cleanup
      mocks.auth.isAuthenticated = false;
      view.rerender(view.redraw());
    });
    expect(screen.getByLabelText("Pending captures").textContent).toBe("0");
    await act(async () => { first.resolve({ id: "a" }); });
    expect(mocks.punch).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("sbp:field:outbox:v1")).toBeNull();
    expect(view.invalidation).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("lets a new identity drain its queue without an old in-flight replay consuming it", async () => {
    const first = deferred<unknown>();
    const replacement = deferred<unknown>();
    mocks.punch.mockReturnValueOnce(first.promise).mockReturnValueOnce(replacement.promise);
    saveQueue([punch("a"), punch("b")]);
    const view = mountOutbox();
    await waitFor(() => expect(mocks.punch).toHaveBeenCalledTimes(1));
    act(() => {
      setActiveOrgId(null);
      mocks.auth.user = { id: "user-b" };
      saveQueue([{ ...punch("a"), owner: { userId: "user-b", orgId: "org-a" } }]);
      setActiveOrgId("org-a");
      view.rerender(view.redraw());
    });
    await waitFor(() => expect(mocks.punch).toHaveBeenCalledTimes(2));
    await act(async () => { first.resolve({ id: "old" }); });
    expect(mocks.punch).toHaveBeenCalledTimes(2);
    expect(loadQueue()).toHaveLength(1);
    expect(loadQueue()[0].owner.userId).toBe("user-b");
    expect(view.invalidation).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    await act(async () => { replacement.resolve({ id: "new" }); });
    expect(loadQueue()).toEqual([]);
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it("keeps legacy and differently owned captures quarantined, including a shared project", async () => {
    const legacy = makePunchCreateOp({ project_id: "shared-project", title: "legacy" }, "legacy", 1);
    const other = { ...punch("other"), owner: { userId: "user-b", orgId: "org-a" } };
    const workspace = { ...punch("workspace"), owner: { userId: "user-a", orgId: "org-b" } };
    saveQueue([legacy, other, workspace, punch("mine")]);
    mountOutbox();
    await waitFor(() => expect(screen.getByLabelText("Pending captures").textContent).toBe("0"));
    expect(mocks.punch).toHaveBeenCalledTimes(1);
    expect(mocks.punch).toHaveBeenCalledWith(expect.objectContaining({ title: "mine" }), expect.objectContaining({ client: expect.any(Object) }));
    expect(loadQueue()).toEqual([legacy, other, workspace]);
  });

  it("preserves a same-user refresh and drains the remaining operations", async () => {
    const first = deferred<unknown>();
    mocks.punch.mockReturnValueOnce(first.promise);
    saveQueue([punch("a"), punch("b")]);
    const view = mountOutbox();
    await waitFor(() => expect(mocks.punch).toHaveBeenCalledTimes(1));
    mocks.auth.user = { id: "user-a" };
    view.rerender(view.redraw());
    await act(async () => { first.resolve({ id: "a" }); });
    expect(mocks.punch).toHaveBeenCalledTimes(2);
    expect(loadQueue()).toEqual([]);
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it("cancels replay when the authenticated provider unmounts", async () => {
    const first = deferred<unknown>();
    mocks.punch.mockReturnValueOnce(first.promise);
    const queue = [punch("a"), punch("b")];
    saveQueue(queue);
    const view = mountOutbox();
    await waitFor(() => expect(mocks.punch).toHaveBeenCalledTimes(1));
    view.unmount();
    await act(async () => { first.resolve({ id: "a" }); });
    expect(mocks.punch).toHaveBeenCalledTimes(1);
    expect(loadQueue()).toEqual(queue);
    expect(view.invalidation).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it.each(["blob", "upload", "create"])("stops photo replay after the %s await when the workspace changes", async (stage) => {
    const pause = deferred<unknown>();
    const deferredStage = stage === "blob" ? mocks.getBlob : stage === "upload" ? mocks.upload : mocks.createPhoto;
    deferredStage.mockReturnValueOnce(pause.promise);
    saveQueue([{ ...makePhotoCreateOp("photo-op", { project_id: "shared-project" }, 1), owner }]);
    const view = mountOutbox();
    await waitFor(() => expect(deferredStage).toHaveBeenCalledTimes(1));
    act(() => {
      mocks.org.currentOrg = { id: "org-b" };
      setActiveOrgId("org-b");
      view.rerender(view.redraw());
    });
    await act(async () => { pause.resolve(stage === "blob" ? { blob: new Blob(["photo"]), meta: {} } : { file_url: "org-a/photo.jpg" }); });
    if (stage === "blob") expect(mocks.upload).not.toHaveBeenCalled();
    if (stage !== "create") expect(mocks.createPhoto).not.toHaveBeenCalled();
    expect(mocks.deleteBlob).not.toHaveBeenCalled();
    expect(view.invalidation).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(loadQueue()).toHaveLength(1);
  });

  it("does not write schedule progress after a deferred read crosses a workspace generation", async () => {
    const read = deferred<unknown>();
    mocks.getTask.mockReturnValueOnce(read.promise);
    saveQueue([{ ...makeProgressOp("task", 50, 1), owner }]);
    const view = mountOutbox();
    await waitFor(() => expect(mocks.getTask).toHaveBeenCalledTimes(1));
    // Even if the workspace returns to the same id before React renders,
    // the old replay belongs to a superseded session/workspace generation.
    setActiveOrgId(null);
    setActiveOrgId("org-a");
    await act(async () => { read.resolve({ id: "task", status: "Not Started", percent_complete: 0 }); });
    expect(mocks.updateTask).not.toHaveBeenCalled();
    expect(view.invalidation).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(loadQueue()).toHaveLength(1);
  });
});
