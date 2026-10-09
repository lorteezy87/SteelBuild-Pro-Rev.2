// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const reads = vi.hoisted(() => ({ gate: vi.fn(), scope: vi.fn() }));
vi.mock("../sheetSetEvidence", () => ({
  evaluateDrawingSetGate: reads.gate,
  fetchSelectedSetScope: reads.scope,
}));

import { isDrawingGateSource, isDrawingScopeSource, useSheetSetEvidence } from "../useSheetSetEvidence";

function renderEvidence(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useSheetSetEvidence("project-1", "set-1"), { wrapper });
  return { client, hook };
}

beforeEach(() => {
  reads.gate.mockReset().mockResolvedValue({ ok: true, blockers: [] });
  reads.scope.mockReset().mockResolvedValue({ workPackages: [] });
});

describe("selected drawing-set gate refresh", () => {
  it("watches only release inputs for the selected project", () => {
    expect(isDrawingGateSource(["rfis", "project-1"], "project-1")).toBe(true);
    expect(isDrawingGateSource(["submittals", "project-1"], "project-1")).toBe(true);
    expect(isDrawingGateSource(["drawing-revisions", "project-1"], "project-1")).toBe(true);
    expect(isDrawingGateSource(["drawing-holds", "project-1"], "project-1")).toBe(true);
    expect(isDrawingGateSource(["rfis", "other-project"], "project-1")).toBe(false);
    expect(isDrawingGateSource(["drawing-set-gate", "project-1"], "project-1")).toBe(false);
  });

  it("refetches the authoritative gate when an RFI source changes without reopening the sheet", async () => {
    const { client, hook } = renderEvidence();
    await waitFor(() => expect(reads.gate).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(hook.result.current.gate.isSuccess).toBe(true));

    act(() => { client.setQueryData(["rfis", "project-1"], [{ id: "new-blocker" }]); });
    await waitFor(() => expect(reads.gate).toHaveBeenCalledTimes(2));

    act(() => { client.setQueryData(["rfis", "other-project"], [{ id: "foreign" }]); });
    expect(reads.gate).toHaveBeenCalledTimes(2);
    hook.unmount();
    client.clear();
  });
});

describe("selected drawing-set canonical scope refresh", () => {
  it("watches project-scoped piece relationships and work-package assignments", () => {
    expect(isDrawingScopeSource(["piece-relationships", "project-1"], "project-1")).toBe(true);
    expect(isDrawingScopeSource(["piece-register", "project-1"], "project-1")).toBe(true);
    expect(isDrawingScopeSource(["work-packages", "project-1"], "project-1")).toBe(true);
    expect(isDrawingScopeSource(["piece-relationships", "other-project"], "project-1")).toBe(false);
    expect(isDrawingScopeSource(["drawing-set-canonical-scope", "project-1"], "project-1")).toBe(false);
  });

  it("refetches linked leaf lots after a relationship write invalidates its source", async () => {
    const { client, hook } = renderEvidence();
    await waitFor(() => expect(hook.result.current.scope.isSuccess).toBe(true));
    expect(reads.scope).toHaveBeenCalledTimes(1);

    act(() => { client.setQueryData(["piece-relationships", "project-1"], [{ pieceId: "new-link" }]); });
    await waitFor(() => expect(reads.scope).toHaveBeenCalledTimes(2));

    act(() => { client.setQueryData(["piece-relationships", "other-project"], [{ pieceId: "foreign-link" }]); });
    expect(reads.scope).toHaveBeenCalledTimes(2);
    hook.unmount();
    client.clear();
  });

  it("rechecks cached scope when the operator returns from Piece Register", async () => {
    const { client, hook } = renderEvidence();
    await waitFor(() => expect(hook.result.current.scope.isSuccess).toBe(true));
    expect(reads.scope).toHaveBeenCalledTimes(1);
    hook.unmount();

    const returned = renderEvidence(client).hook;
    await waitFor(() => expect(reads.scope).toHaveBeenCalledTimes(2));
    returned.unmount();
    client.clear();
  });
});
