import { describe, it, expect, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invokeMock(...args) } },
}));

import { startCheckout, openBillingPortal } from "../billingService";

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
