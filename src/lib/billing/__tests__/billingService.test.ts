import { describe, it, expect, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();
const countQuery = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), or: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invokeMock(...args) }, from: countQuery.from },
}));

import { startCheckout, openBillingPortal, getWorkspaceProjectCount } from "../billingService";

describe("workspace project count", () => {
  beforeEach(() => {
    Object.values(countQuery).forEach(mock => mock.mockReset());
    countQuery.from.mockReturnValue(countQuery); countQuery.select.mockReturnValue(countQuery); countQuery.eq.mockReturnValue(countQuery);
  });
  it("requests an exact head count for one org including legacy nondeleted nulls", async () => {
    countQuery.or.mockResolvedValue({ count: 2001, error: null });
    await expect(getWorkspaceProjectCount("org-a")).resolves.toBe(2001);
    expect(countQuery.from).toHaveBeenCalledExactlyOnceWith("projects");
    expect(countQuery.select).toHaveBeenCalledWith("id", { head: true, count: "exact" });
    expect(countQuery.eq).toHaveBeenCalledExactlyOnceWith("org_id", "org-a");
    expect(countQuery.or).toHaveBeenCalledWith("is_deleted.is.null,is_deleted.eq.false");
  });
  it("does not query without a workspace", async () => {
    await expect(getWorkspaceProjectCount("")).rejects.toThrow("Select a workspace"); expect(countQuery.from).not.toHaveBeenCalled();
  });
  it.each([null, undefined, -1, 1.5, NaN])("does not turn a missing or invalid count into zero: %s", async (count) => {
    countQuery.or.mockResolvedValue({ count, error: null });
    await expect(getWorkspaceProjectCount("org-a")).rejects.toThrow("unavailable");
  });
  it("preserves zero when confirmed and propagates read failures", async () => {
    countQuery.or.mockResolvedValueOnce({ count: 0, error: null }).mockResolvedValueOnce({ count: null, error: new Error("denied") });
    await expect(getWorkspaceProjectCount("org-a")).resolves.toBe(0);
    await expect(getWorkspaceProjectCount("org-a")).rejects.toThrow("denied");
  });
});

describe("billingService", () => {
  beforeEach(() => invokeMock.mockReset());

  it("startCheckout returns the hosted Checkout URL and passes plan + org", async () => {
    invokeMock.mockResolvedValueOnce({ data: { url: "https://checkout.stripe.com/c/x" }, error: null });
    await expect(startCheckout("pro", "org1")).resolves.toBe("https://checkout.stripe.com/c/x");
    expect(invokeMock).toHaveBeenCalledWith("stripe-billing", { body: { action: "checkout", plan: "pro", org_id: "org1" } });
  });

  it("openBillingPortal returns the portal URL", async () => {
    invokeMock.mockResolvedValueOnce({ data: { url: "https://billing.stripe.com/p/y" }, error: null });
    await expect(openBillingPortal("org1")).resolves.toBe("https://billing.stripe.com/p/y");
    expect(invokeMock).toHaveBeenCalledWith("stripe-billing", { body: { action: "portal", org_id: "org1" } });
  });

  it("recovers the real reason from a non-2xx FunctionsHttpError (e.g. 403)", async () => {
    // supabase-js delivers a non-2xx as { data: null, error } with a generic
    // message; the true reason is in error.context (the Response) body.
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: "Edge Function returned a non-2xx status code",
        context: { json: async () => ({ error: "You don't have permission to manage this workspace's billing" }) },
      },
    });
    await expect(startCheckout("pro", "org1")).rejects.toThrow(
      "You don't have permission to manage this workspace's billing",
    );
  });

  it("falls back to the generic message when the error body isn't JSON", async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: "Edge Function returned a non-2xx status code",
        context: { json: async () => { throw new Error("not json"); } },
      },
    });
    await expect(openBillingPortal("org1")).rejects.toThrow("Edge Function returned a non-2xx status code");
  });

  it("honors a 2xx body-level { error } too", async () => {
    invokeMock.mockResolvedValueOnce({ data: { error: "boom" }, error: null });
    await expect(startCheckout("pro", "org1")).rejects.toThrow("boom");
  });
});
