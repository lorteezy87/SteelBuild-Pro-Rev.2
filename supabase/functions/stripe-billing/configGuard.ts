export type BillingReadiness = { ok: true; key: string } | { ok: false; error: string };

/** Test-mode configuration must never fall back to the live payment key. */
export function billingReadiness(args: { livemode: boolean; liveKey?: string; testKey?: string; webhook: boolean; webhookSecret?: string }): BillingReadiness {
  const key = (args.livemode ? args.liveKey : args.testKey)?.trim();
  if (!key) return { ok: false, error: 'Billing is not configured' };
  if (args.webhook && !args.webhookSecret?.trim()) return { ok: false, error: 'Billing webhook is not configured' };
  return { ok: true, key };
}
