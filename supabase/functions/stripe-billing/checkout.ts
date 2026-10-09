// Durable checkout orchestration. PostgreSQL owns the current organization
// reservation; Stripe idempotency owns uncertain remote creation outcomes.
interface RpcResult { data: unknown; error: { code?: string; message?: string } | null }
export interface CheckoutDatabase {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
}
interface ProviderSession {
  id: string; customer?: unknown; subscription?: unknown; mode?: string | null;
  metadata?: Record<string, string> | null; livemode: boolean;
  status?: string | null; expires_at: number; url?: string | null;
}
interface CreateSession {
  mode: 'subscription'; customer: string; line_items: Array<{ price: string; quantity: number }>;
  client_reference_id: string; metadata: Record<string, string>; subscription_data: { metadata: Record<string, string> };
  allow_promotion_codes: boolean; automatic_tax: { enabled: boolean }; tax_id_collection: { enabled: boolean };
  billing_address_collection: 'required'; customer_update: { address: 'auto'; name: 'auto' }; success_url: string; cancel_url: string;
}
export interface CheckoutProvider {
  customers: { create(params: { metadata: Record<string, string> }, options: { idempotencyKey: string }): PromiseLike<{ id: string }> };
  subscriptions: { list(params: { customer: string; status: 'all'; limit: number; starting_after?: string }): PromiseLike<{
    data: Array<{ id: string; customer: unknown; status: string }>; has_more: boolean;
  }> };
  checkout: { sessions: {
    create(params: CreateSession, options: { idempotencyKey: string }): PromiseLike<ProviderSession>;
    retrieve(id: string): PromiseLike<ProviderSession>;
  } };
}
interface CheckoutIntent {
  org_id: string; operation_id: string; plan: string; price_id: string; livemode: boolean; return_base: string;
  state: 'pending' | 'open'; customer_id: string | null; session_id: string | null; session_url: string | null;
  session_expires_at: string | null; created_at: string;
}
export interface CheckoutRequest {
  orgId: string; actorId: string; plan: string; priceId: string; livemode: boolean; returnBase: string;
}
export class CheckoutError extends Error {
  constructor(public status: number, public code: string, message: string, public action?: 'portal' | 'support' | 'retry') { super(message); }
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function reference(value: unknown): string | null {
  if (typeof value === 'string' && value) return value;
  return record(value) && typeof value.id === 'string' ? value.id : null;
}
function reconcile(): never {
  throw new CheckoutError(409, 'billing_reconciliation_required', 'Billing needs reconciliation before another checkout. Contact support@steelbuild-pro.com.', 'support');
}
function portal(): never {
  throw new CheckoutError(409, 'billing_portal_required', 'A subscription already exists or is awaiting completion. Use Manage billing to review it.', 'portal');
}
async function rpc(db: CheckoutDatabase, name: string, args: Record<string, unknown>): Promise<unknown> {
  const result = await db.rpc(name, args);
  if (result.error) {
    if (result.error.code === '42501' || result.error.code === 'P0002') {
      throw new CheckoutError(403, 'billing_access_changed', 'Workspace billing access changed. Refresh your workspace before continuing.');
    }
    throw new CheckoutError(503, 'checkout_retry_required', 'Checkout could not be confirmed. Retry the same plan; a new payment attempt has not been authorized.', 'retry');
  }
  return result.data;
}
async function begin(db: CheckoutDatabase, request: CheckoutRequest): Promise<CheckoutIntent> {
  const result = await rpc(db, 'begin_billing_checkout', {
    p_org_id: request.orgId, p_actor_id: request.actorId, p_plan: request.plan, p_price_id: request.priceId,
    p_livemode: request.livemode, p_return_base: request.returnBase,
  });
  if (!record(result)) reconcile();
  if (result.decision === 'portal') portal();
  if (result.decision === 'reconcile') reconcile();
  const intent = result.intent;
  if (result.decision !== 'intent' || !record(intent) || intent.org_id !== request.orgId
    || typeof intent.operation_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(intent.operation_id)
    || typeof intent.plan !== 'string' || !['pro', 'business'].includes(intent.plan)
    || typeof intent.price_id !== 'string' || !intent.price_id || intent.livemode !== request.livemode
    || typeof intent.return_base !== 'string' || intent.return_base !== request.returnBase || !/^https?:\/\/[A-Za-z0-9.-]+(?::[0-9]+)?$/.test(intent.return_base)
    || !['pending', 'open'].includes(String(intent.state)) || typeof intent.created_at !== 'string'
    || !Number.isFinite(Date.parse(intent.created_at))
    || (intent.customer_id !== null && typeof intent.customer_id !== 'string')
    || (intent.session_id !== null && typeof intent.session_id !== 'string')
    || (intent.session_url !== null && typeof intent.session_url !== 'string')
    || (intent.session_expires_at !== null && typeof intent.session_expires_at !== 'string')) reconcile();
  return intent as unknown as CheckoutIntent;
}
function sameOperation(current: CheckoutIntent, expected: CheckoutIntent): void {
  if (current.operation_id !== expected.operation_id || current.price_id !== expected.price_id
    || current.plan !== expected.plan || current.return_base !== expected.return_base
    || current.livemode !== expected.livemode) reconcile();
}
function validateSession(session: ProviderSession, intent: CheckoutIntent): void {
  if (!session || !session.id || reference(session.customer) !== intent.customer_id || session.mode !== 'subscription'
    || session.livemode !== intent.livemode || session.metadata?.org_id !== intent.org_id
    || session.metadata?.checkout_intent !== intent.operation_id
    || !Number.isSafeInteger(session.expires_at) || session.expires_at <= 0
    || (intent.session_id !== null && session.id !== intent.session_id)
    || (intent.session_expires_at !== null && Date.parse(intent.session_expires_at) !== session.expires_at * 1000)) reconcile();
}
function paymentUrl(session: ProviderSession): string {
  if (!session.url) reconcile();
  const url = new URL(session.url);
  if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com' || url.username || url.password || url.port) reconcile();
  return session.url;
}
async function verifyNoSubscription(stripe: CheckoutProvider, customerId: string): Promise<void> {
  let cursor: string | undefined;
  const seen = new Set<string>();
  for (let page = 0; page < 10; page++) {
    const result = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100, ...(cursor ? { starting_after: cursor } : {}) });
    if (!result || !Array.isArray(result.data) || typeof result.has_more !== 'boolean') reconcile();
    for (const subscription of result.data) {
      if (!subscription.id || seen.has(subscription.id) || reference(subscription.customer) !== customerId) reconcile();
      seen.add(subscription.id);
      if (!['canceled', 'incomplete_expired'].includes(subscription.status)) portal();
    }
    if (!result.has_more) return;
    const last = result.data.at(-1)?.id;
    if (!last || last === cursor) reconcile();
    cursor = last;
  }
  reconcile(); // A capped list is not evidence that no payable subscription exists.
}
const scope = (request: CheckoutRequest, intent: CheckoutIntent) => ({ p_org_id: request.orgId, p_actor_id: request.actorId, p_operation_id: intent.operation_id });
export async function createDurableCheckout(db: CheckoutDatabase, stripe: CheckoutProvider, request: CheckoutRequest): Promise<string> {
  let intent = await begin(db, request);
  if (intent.session_id) {
    const session = await stripe.checkout.sessions.retrieve(intent.session_id);
    validateSession(session, intent);
    if (session.status === 'complete') portal();
    if (session.status === 'expired') {
      if (session.expires_at * 1000 > Date.now() || reference(session.subscription)) reconcile();
      await verifyNoSubscription(stripe, intent.customer_id!);
      await rpc(db, 'expire_billing_checkout_intent', { ...scope(request, intent), p_session_id: session.id, p_expires_at: new Date(session.expires_at * 1000).toISOString() });
      intent = await begin(db, request);
    } else if (session.status === 'open' && session.expires_at * 1000 > Date.now()) {
      if (intent.plan !== request.plan) throw new CheckoutError(409, 'checkout_in_progress', 'A checkout for another plan is still open. Finish it or wait for its confirmed expiry.', 'retry');
      await verifyNoSubscription(stripe, intent.customer_id!);
      const fresh = await begin(db, request); // Recheck authority after provider await.
      sameOperation(fresh, intent);
      if (fresh.customer_id !== intent.customer_id || fresh.session_id !== session.id) reconcile();
      return paymentUrl(session);
    } else reconcile();
  }
  if (intent.plan !== request.plan) throw new CheckoutError(409, 'checkout_in_progress', 'Another plan already has an unfinished checkout. Retry that plan or contact support.', 'retry');
  if (Date.parse(intent.created_at) <= Date.now() - 23 * 60 * 60 * 1000) reconcile();
  if (!intent.customer_id) {
    const customer = await stripe.customers.create({ metadata: { org_id: request.orgId } }, { idempotencyKey: `sbp-customer-v1-${intent.operation_id}` });
    if (!customer?.id) reconcile();
    await rpc(db, 'bind_billing_checkout_customer', { ...scope(request, intent), p_customer_id: customer.id });
    const bound = await begin(db, request);
    sameOperation(bound, intent);
    if (bound.customer_id !== customer.id) reconcile();
    intent = bound;
  }
  await verifyNoSubscription(stripe, intent.customer_id!);
  const fresh = await begin(db, request); // Revocation/erasure after provider reads must stop creation.
  sameOperation(fresh, intent);
  if (fresh.customer_id !== intent.customer_id) reconcile();
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription', customer: intent.customer_id!, line_items: [{ price: intent.price_id, quantity: 1 }],
    client_reference_id: request.orgId, metadata: { org_id: request.orgId, checkout_intent: intent.operation_id, plan: intent.plan },
    subscription_data: { metadata: { org_id: request.orgId, plan: intent.plan } },
    allow_promotion_codes: true, automatic_tax: { enabled: true }, tax_id_collection: { enabled: true },
    billing_address_collection: 'required', customer_update: { address: 'auto', name: 'auto' },
    success_url: `${intent.return_base}/Billing?status=success`, cancel_url: `${intent.return_base}/Billing?status=cancel`,
  }, { idempotencyKey: `sbp-checkout-v1-${intent.operation_id}` });
  validateSession(session, intent);
  if (session.status === 'complete') portal();
  if (session.status !== 'open' || session.expires_at * 1000 <= Date.now()) reconcile();
  const url = paymentUrl(session);
  await rpc(db, 'record_billing_checkout_session', { ...scope(request, intent), p_customer_id: intent.customer_id,
    p_session_id: session.id, p_session_url: url, p_expires_at: new Date(session.expires_at * 1000).toISOString() });
  const confirmed = await begin(db, request); // Never publish a URL after access or binding changed.
  sameOperation(confirmed, intent);
  if (confirmed.customer_id !== intent.customer_id || confirmed.session_id !== session.id || confirmed.session_url !== url) reconcile();
  return url;
}
