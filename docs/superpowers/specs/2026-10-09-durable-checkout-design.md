# Durable checkout for a steel subcontractor workspace

The app must not open multiple payable subscriptions when an owner retries a checkout or two administrators act concurrently. This is part of the user's authorized production hardening and monetization work. The root release reviewer approved this design and its refinement before implementation; no new pricing or commercial policy is introduced.

## Selected boundary

A private PostgreSQL row reserves one current operation per organization. Every state change locks the parent organization before the reservation and validates current owner/admin membership using the actor returned by verified Auth, never a client-supplied actor. Only service-role RPCs can read/write reservation state. The organization FK cascades through audited workspace erasure; no identity FK or public-table erasure sweep is required.

Repeated same-plan requests reuse the operation UUID and frozen configured price, billing mode and canonical server redirect base. Different plans fail with a conflict while checkout is unresolved. New customer and Checkout Session writes each use distinct operation-derived Stripe idempotency keys and stable parameters. The handler must confirm the database customer binding before it creates a payable session. Failed writes or unknown provider outcomes remain retryable within a conservative 23-hour window; afterward an unresolved operation requires reconciliation rather than a new idempotency key.

Only `free` local entitlement with no active/incomplete/unknown subscription permits new checkout. A subscription without a customer is inconsistent and requires reconciliation. For a bound customer, a complete paginated provider subscription read rejects any status other than canceled/incomplete_expired. Existing subscribers receive an explicit portal action. Existing session retrieval confirms current customer, mode, operation metadata, status, expiration and URL before returning the same URL. An expired session permits renewal only after provider-confirmed expiry and a complete subscription read; a completed or unknown session never automatically renews.

The handler rechecks current membership and organization existence after provider awaits and before returning a URL. Erasure cannot recreate a binding or publish a URL. Local leases are not authority to issue a second provider operation. If duplicate callers encounter Stripe's concurrent-idempotency conflict they get a retryable response with the same durable operation. Unknown provider errors, malformed results, changed payloads, partial pagination and historical inconsistent bindings fail closed.

Redirects are generated from the configured server base, validated against the exact existing allowed-origin list, with production default `https://www.steelbuild-pro.com`. Request body/Origin cannot choose a payment redirect. The frontend's existing `{url}` success contract remains; conflict messages give a concrete billing-portal or support action. Existing JWT verification, enrolled MFA and billing membership checks remain.

## Alternatives considered

- Disabling the UI button cannot govern concurrent clients or retries and leaves customer/session side effects unprotected.
- A per-request provider idempotency key only deduplicates that one request; a fresh client key still creates another payable subscription.
- The selected organization reservation plus provider idempotency governs both local concurrency and uncertain remote outcomes. It deliberately blocks unresolved old operations rather than guessing a charge did not occur.

## Verification and release

First reproduce duplicate paid sessions and ignored customer-binding failures using the actual entrypoint. Cover durable reuse, differing plan conflicts, provider timeouts after creation, idempotency parameter stability, expired/complete/unknown sessions, missing/foreign customers, full pagination, MFA/current membership and erasure races. Execute migration permissions and state transitions in PGlite, independent PostgreSQL connections for reservation races, and staging rollback with installed RLS/guards. Stage the exact new SQL before the dependent function; retain the prior atomic-billing migration byte-for-byte.

No real charges, cancellations or refunds are authorized by these tests. Historical orphan customers/duplicate subscriptions require a separate provider audit. Real Stripe test-mode delivery and hosted session acceptance are required before claiming payment readiness. Existing Stripe SDK/API versions remain pinned to the working webhook contract during this repair; an API upgrade is a separate compatibility change.

Sources checked October 9, 2026: [idempotency](https://docs.stripe.com/api/idempotent_requests), [Checkout Session creation](https://docs.stripe.com/api/checkout/sessions/create), [retrieval](https://docs.stripe.com/api/checkout/sessions/retrieve), [subscription listing](https://docs.stripe.com/api/subscriptions/list).
