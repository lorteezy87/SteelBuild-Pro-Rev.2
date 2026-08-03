// @vitest-environment jsdom
import { StrictMode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type DeferredReplay = { resolve: () => void; reject: (error: Error) => void };
const mocks = vi.hoisted(() => {
  const deferred = new Map<string, DeferredReplay>();
  const operations = new Map<string, Array<{ id: string }>>();
  const state = { userId: "user-1", organizationId: "org-1" };
  const reset = () => {
    deferred.clear();
    operations.clear();
    state.userId = "user-1";
    state.organizationId = "org-1";
  };
  return {
    state,
    reset,
    operations,
    clearPlannerTenantState: vi.fn(async () => undefined),
    loadPlannerOutbox: vi.fn(async (scope: { organizationId: string }) => operations.get(scope.organizationId) ?? []),
    replayPlannerOutbox: vi.fn((entries: Array<{ id: string }>) => new Promise<{ synced: string[]; remaining: []; state: "complete"; error: null }>((resolve, reject) => {
      const id = entries[0]?.id ?? "none";
      deferred.set(id, { resolve: () => resolve({ synced: entries.map((entry) => entry.id), remaining: [], state: "complete", error: null }), reject });
    })),
    removePlannerOutboxOperation: vi.fn(async (scope: { organizationId: string }, id: string) => {
      operations.set(scope.organizationId, (operations.get(scope.organizationId) ?? []).filter((entry) => entry.id !== id));
    }),
    resolveReplay: (id: string) => deferred.get(id)?.resolve(),
    rejectReplay: (id: string, error: Error) => deferred.get(id)?.reject(error),
  };
});

vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { id: mocks.state.userId } }) }));
vi.mock("@/components/shared/OrgContext", () => ({ useOrg: () => ({ currentOrg: { id: mocks.state.organizationId } }) }));
vi.mock("@/lib/query-client", () => ({ queryClientInstance: { removeQueries: vi.fn() } }));
vi.mock("../plannerSnapshots", () => ({ clearPlannerTenantState: mocks.clearPlannerTenantState, loadPlannerSnapshot: vi.fn(async () => null), savePlannerSnapshot: vi.fn(async () => undefined) }));
vi.mock("../plannerOutbox", () => ({
  executePlannerOutboxOperation: vi.fn(async () => undefined),
  enqueuePlannerOutboxOperation: vi.fn(async () => undefined),
  loadPlannerOutbox: mocks.loadPlannerOutbox,
  removePlannerOutboxOperation: mocks.removePlannerOutboxOperation,
  replayPlannerOutbox: mocks.replayPlannerOutbox,
}));

import PlannerOfflineProvider, { usePlannerOffline } from "../PlannerOfflineProvider";

function ProviderState() {
  const { pendingCount } = usePlannerOffline();
  return <output aria-label="pending-count">{pendingCount}</output>;
}

describe("PlannerOfflineProvider initial online replay", () => {
  beforeEach(() => {
    mocks.reset();
    mocks.loadPlannerOutbox.mockClear();
    mocks.replayPlannerOutbox.mockClear();
    mocks.removePlannerOutboxOperation.mockClear();
    mocks.clearPlannerTenantState.mockClear();
    mocks.operations.set("org-1", [{ id: "op-org-1" }]);
  });

  it("starts one replay for a persisted outbox and shares it with an overlapping online event", async () => {
    render(<PlannerOfflineProvider><ProviderState /></PlannerOfflineProvider>);

    await waitFor(() => expect(mocks.replayPlannerOutbox).toHaveBeenCalledTimes(1));
    act(() => window.dispatchEvent(new Event("online")));
    expect(mocks.replayPlannerOutbox).toHaveBeenCalledTimes(1);
    await act(async () => mocks.resolveReplay("op-org-1"));
    await waitFor(() => expect(mocks.removePlannerOutboxOperation).toHaveBeenCalledWith(
      { userId: "user-1", organizationId: "org-1" }, "op-org-1",
    ));
  });

  it("does not mark the connection verified after an empty online replay", async () => {
    mocks.operations.set("org-1", []);
    render(<PlannerOfflineProvider><ProviderState /></PlannerOfflineProvider>);

    act(() => window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(mocks.replayPlannerOutbox).toHaveBeenCalledWith([], expect.any(Function)));
    await act(async () => mocks.resolveReplay("none"));

    await waitFor(() => expect(screen.getByText("Connection available—verifying")).toBeInTheDocument());
    expect(screen.queryByText("Online")).not.toBeInTheDocument();
  });

  it("keeps B authoritative while unresolved A finishes after a scope switch", async () => {
    const view = render(<PlannerOfflineProvider><ProviderState /></PlannerOfflineProvider>);
    await waitFor(() => expect(mocks.replayPlannerOutbox).toHaveBeenCalledTimes(1));

    mocks.state.organizationId = "org-2";
    mocks.operations.set("org-2", [{ id: "op-org-2" }]);
    view.rerender(<PlannerOfflineProvider><ProviderState /></PlannerOfflineProvider>);
    await waitFor(() => expect(mocks.replayPlannerOutbox).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mocks.clearPlannerTenantState).toHaveBeenCalledWith("user-1", "org-1"));
    expect(screen.getByLabelText("pending-count")).toHaveTextContent("1");
    expect(screen.getByText("Syncing 1 change")).toBeInTheDocument();

    await act(async () => mocks.rejectReplay("op-org-1", new Error("A failed after departure")));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Syncing 1 change")).toBeInTheDocument();
    act(() => window.dispatchEvent(new Event("online")));
    expect(mocks.replayPlannerOutbox).toHaveBeenCalledTimes(2);

    await act(async () => mocks.resolveReplay("op-org-2"));
    await waitFor(() => expect(mocks.removePlannerOutboxOperation).toHaveBeenCalledWith(
      { userId: "user-1", organizationId: "org-2" }, "op-org-2",
    ));
    await waitFor(() => expect(screen.getByLabelText("pending-count")).toHaveTextContent("0"));
    await waitFor(() => expect(screen.getByText("Online")).toBeInTheDocument());
  });

  it("keeps B authoritative when departed A resolves after a scope switch", async () => {
    const view = render(<PlannerOfflineProvider><ProviderState /></PlannerOfflineProvider>);
    await waitFor(() => expect(mocks.replayPlannerOutbox).toHaveBeenCalledTimes(1));

    mocks.state.organizationId = "org-2";
    mocks.operations.set("org-2", [{ id: "op-org-2" }]);
    view.rerender(<PlannerOfflineProvider><ProviderState /></PlannerOfflineProvider>);
    await waitFor(() => expect(mocks.replayPlannerOutbox).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("pending-count")).toHaveTextContent("1");
    expect(screen.getByText("Syncing 1 change")).toBeInTheDocument();

    await act(async () => mocks.resolveReplay("op-org-1"));
    expect(screen.getByLabelText("pending-count")).toHaveTextContent("1");
    expect(screen.getByText("Syncing 1 change")).toBeInTheDocument();
    act(() => window.dispatchEvent(new Event("online")));
    expect(mocks.replayPlannerOutbox).toHaveBeenCalledTimes(2);

    await act(async () => mocks.resolveReplay("op-org-2"));
    await waitFor(() => expect(mocks.removePlannerOutboxOperation).toHaveBeenCalledWith(
      { userId: "user-1", organizationId: "org-2" }, "op-org-2",
    ));
    await waitFor(() => expect(screen.getByLabelText("pending-count")).toHaveTextContent("0"));
    await waitFor(() => expect(screen.getByText("Online")).toBeInTheDocument());
  });

  it("does not purge or duplicate a persisted replay during a StrictMode probe", async () => {
    render(<StrictMode><PlannerOfflineProvider><ProviderState /></PlannerOfflineProvider></StrictMode>);

    await waitFor(() => expect(mocks.replayPlannerOutbox).toHaveBeenCalledTimes(1));
    await act(async () => { await Promise.resolve(); });
    expect(mocks.clearPlannerTenantState).not.toHaveBeenCalled();
    await act(async () => mocks.resolveReplay("op-org-1"));
    expect(screen.getByLabelText("pending-count")).toBeInTheDocument();
  });
});
