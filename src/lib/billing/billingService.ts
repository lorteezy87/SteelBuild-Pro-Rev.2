/**
 * billingService.ts — client calls into the stripe-billing edge function.
 * The function owns the Stripe secret + price ids; the client only passes a plan
 * KEY and gets back a hosted URL to redirect to (Checkout or the billing portal).
 */

import { supabase } from "@/lib/supabase";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function invokeBilling(action: string, payload: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke("stripe-billing", { body: { action, ...payload } });
  if (error) throw new Error(error.message || "Billing request failed");
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
