/**
 * billingService.ts — client calls into the stripe-billing edge function.
 * The function owns the Stripe secret + price ids; the client only passes a plan
 * KEY and gets back a hosted URL to redirect to (Checkout or the billing portal).
 */

import { supabase } from "@/lib/supabase";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function invokeBilling(action: string, payload: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke("stripe-billing", { body: { action, ...payload } });
  if (error) {
    // supabase-js wraps any non-2xx response in a FunctionsHttpError whose
    // .message is the generic "Edge Function returned a non-2xx status code".
    // stripe-billing returns the real reason ("Plan X isn't available", "You
    // don't have permission…", "No billing account yet — start a subscription
    // first") as a non-2xx { error } body, readable only via error.context (the
    // Response). Recover it so the Billing UI shows the actual cause.
    const ctx = (error as { context?: { json?: () => Promise<unknown> } }).context;
    let detail: string | null = null;
    if (ctx?.json) {
      try {
        const body = await ctx.json();
        if (body && typeof body === "object" && (body as { error?: unknown }).error) {
          detail = String((body as { error: unknown }).error);
        }
      } catch { /* body wasn't JSON — fall back to the generic message */ }
    }
    throw new Error(detail || error.message || "Billing request failed");
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

/** Start a Stripe Checkout for a plan; returns the hosted Checkout URL. */
export async function startCheckout(plan: string, orgId: string): Promise<string> {
  const data = await invokeBilling("checkout", { plan, org_id: orgId });
  return data.url as string;
}

/** Open the Stripe billing portal (update card, cancel); returns the portal URL. */
export async function openBillingPortal(orgId: string): Promise<string> {
  const data = await invokeBilling("portal", { org_id: orgId });
  return data.url as string;
}
