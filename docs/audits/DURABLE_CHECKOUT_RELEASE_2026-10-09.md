# Durable workspace checkout release candidate

Repeated checkout requests previously created extra payable subscription sessions, and customer-binding write errors were ignored. This follow-up reserves one operation per workspace, confirms customer binding before a session can be created, reuses stable Stripe idempotency keys and returns the existing open session on retry. Existing subscriptions route to **Manage billing**. Missing/unknown bindings and uncertain old provider outcomes fail closed with a concrete support/retry action.

## Source and deployment contract

New migration: `20261009125901_durable_workspace_checkout_intents.sql`.

SHA-256: `845001ac713361bab1d1d00b6d6d770caf32cf017b4249ecd680dc02f9e3b99c`.

The original atomic-event migration `20261008071019` remains byte-identical. Apply/stamp/verify the new exact SQL after that prerequisite and before releasing the dependent `stripe-billing` handler. Its required ownership classification keeps an unapplied candidate visible to the production drift gate. Use the manual file-first release contract; never `db push`, `apply_migration` or ledger repair. This branch has not committed hosted SQL or deployed a function.

The intent table is private with RLS and no direct access for anonymous, authenticated or service roles. Four service-only RPCs lock organization before intent, require a current owner/admin actor, and fence every update by operation/customer/session identity. The actor is the verified Auth user, not request-body input. Organization deletion cascades the intent; late callbacks cannot recreate it. No Auth identity FK is introduced.

The typed `checkout.ts` orchestration freezes the configured price/mode/return base, uses separate operation-derived customer/session idempotency keys and conservatively stops unknown outcomes after 23 hours. A saved session is retrieved and checked against its workspace, customer, operation, mode and expiry. A complete paginated provider subscription read blocks any outstanding/unknown status. Only a provider-confirmed expired session with no remaining subscription releases the reservation. A page cap is unknown evidence and blocks. Server-generated return URLs must match configured allowed origins; browser Origin cannot pick them. Billing authorization is rechecked after provider awaits before returning checkout or portal URLs.

## Executed verification

- Before implementation, both actual-entrypoint regressions failed: paid-workspace requests returned two 200 checkout URLs; failed customer-binding writes still returned payable sessions.
- **108 focused tests** passed across billing handler/mapping, MFA, checkout/portal and required migration classification. These include 31 checkout/portal cases covering synthetic concurrent requests, lost provider responses, failed receipts, subscription status/pagination, expiry, stale access and erasure. Focused ESLint and diff checks passed.
- **27 new PGlite SQL checks** passed against the actual candidate, including service-only grants, private-table denial, frozen operations, binding/session compare-and-set, expiry, uncertainty limits, revoked roles and erasure cascade. The existing 22 atomic billing checks remain unchanged.
- **19 hosted staging checks** passed against the final exact SQL under rollback on `ndyfjffsulfbwpmwdmic`. The installed billing guards/RLS and atomic billing RPC were exercised. The actual audited `hard_delete_organization` erased the synthetic workspace, cascaded the private intent, retained its audit receipt and denied late customer-binding resurrection.
- A separate post-rollback query confirmed zero synthetic users, workspaces, billing receipts, erasure receipts or migration stamps. The candidate table and begin RPC were absent.
- The required commercial PostgreSQL job now includes six additional independent-session checkout cases: simultaneous reservation, differing plans, repeated customer binding, conflicting sessions, concurrent membership revocation and erasure. Inspect exact-head CI for execution results; source presence alone does not establish a pass.

## Remaining hosted/provider acceptance

Real Stripe test-mode customer creation, signed checkout/subscription deliveries and provider idempotency behavior must be validated against the deployed staging function before production release. No real charges, cancellations, refunds or provider configuration changes were performed here. Historical orphan customers or duplicate subscriptions have not been audited or reconciled by these tests.

This candidate prevents new app-driven duplicate checkout operations; it does not establish that the complete app is monetization-ready. Pricing/tax configuration, historical billing reconciliation, backup restore and other release acceptance remain separate work. The SDK/API version is retained to preserve the existing endpoint contract; upgrading it requires its own provider compatibility checks.
