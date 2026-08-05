# Owner Execution Evidence Log

**SteelBuild Pro**  
Started: 2026-08-04  
Purpose: Record proof that owner-only enterprise gaps are closed. Code for
these items is already in the repository; this file holds the **evidence** that
dashboard/legal/CLI steps actually ran.

Companion docs:
- [`owner-checklist.md`](./owner-checklist.md) — full step-by-step
- [`tier1-enterprise-status.md`](./tier1-enterprise-status.md) — code vs owner split
- [`backup-dr.md`](./backup-dr.md) — RTO/RPO + restore rehearsal table
- [`storage-backup-setup.md`](./storage-backup-setup.md) — offsite backup setup
- [`stripe-go-live.md`](../stripe-go-live.md) — Stripe test-mode E2E

> Check a box only when evidence is recorded below it. Do not mark done from
> memory of a dashboard click.

---

## 1. Ops / DR

### 1.1 PITR enabled + restore rehearsal — [H24]

- [ ] PITR enabled in Supabase dashboard (Database → Backups)
- [ ] One restore rehearsal completed into **staging** (never prod)
- [ ] Measured RTO / RPO written in [`backup-dr.md`](./backup-dr.md) §4

| Field | Value |
|---|---|
| Date enabled | |
| Rehearsal date | |
| Type (in-place PITR / restore-to-new) | |
| Target timestamp / snapshot | |
| Measured RTO | |
| Measured RPO | |
| Verification 3.C result | |
| Operator | |
| Notes | |

### 1.2 Offsite Storage backup first verified run — [H25]

- [ ] GitHub environment `storage-backup-production` secrets configured
- [ ] Environment deployment policy restricted to `main` only
- [ ] First green workflow run completed
- [ ] Manifest artifact retained; `source.projectRef` = `kjrwqagyeswwoxpjkcko`
- [ ] Staging restore rehearsal for both buckets completed

| Field | Value |
|---|---|
| First green run URL | |
| Manifest timestamp | |
| app-files objects / bytes | |
| email-attachments objects / bytes | |
| Staging restore RTO | |
| Signed-URL open verified? | |
| Operator | |
| Notes | |

---

## 2. Compliance

### 2.1 Legal counsel review — [H12 / H13]

- [ ] Terms of Service reviewed; DRAFT marker removed
- [ ] Privacy Policy reviewed; DRAFT marker removed
- [ ] Subprocessors page reviewed (includes OpenAI, Anthropic)
- [ ] Customer-facing DPA template available
- [ ] Upstream DPAs: Supabase, Vercel, Stripe, Sentry, OpenAI, Anthropic

| Field | Value |
|---|---|
| Counsel / firm | |
| Review date | |
| Effective date on published pages | |
| DPA template location | |
| Notes | |

### 2.2 Stripe Tax + AZ TPT — [H14]

- [ ] Arizona TPT registration complete
- [ ] Stripe Tax enabled in dashboard
- [ ] `stripe-billing` redeployed after Tax enable
- [ ] Test-mode AZ checkout shows separate tax line

| Field | Value |
|---|---|
| TPT registration ID / date | |
| Stripe Tax enabled date | |
| Test checkout session id | |
| Tax line observed? | |
| Operator | |

### 2.3 Stripe end-to-end (test mode) — closes 0 `billing_events` gap

- [ ] Follow [`stripe-go-live.md`](../stripe-go-live.md) with `billing_config.livemode = false`
- [ ] At least one `billing_events` row present after webhook
- [ ] `organizations.plan` updated by webhook for test org

| Field | Value |
|---|---|
| Date | |
| Test org id | |
| billing_events row id / stripe_event_id | |
| Plan after webhook | |
| Operator | |

### 2.4 Account erasure path live — [H11]

- [ ] Migration `20260703170000_hard_erasure_rpcs.sql` applied on prod
- [ ] `account-delete` edge function deployed (JWT verify ON)
- [ ] Feature flag `account_deletion` enabled for owner account only first
- [ ] Throwaway org hard-delete verified (DB + Storage + auth user + audit row)

| Field | Value |
|---|---|
| Deploy date | |
| Flag scope (owner-only / broad) | |
| Throwaway org id erased | |
| account_deletions row id | |
| Operator | |

---

## 3. Governance

### 3.1 Branch protection on `main` — [H6]

- [ ] GitHub Team (or equivalent) plan active
- [ ] Ruleset/protection on `main`: require CI status, no force-push, no deletion

| Field | Value |
|---|---|
| Plan upgrade date | |
| Ruleset name / link | |
| Required check name | Lint + Typecheck + Test + Build |
| Force-push blocked? | |

### 3.2 Delete deprecated edge functions — [H5 / L12]

```bash
export SUPABASE_ACCESS_TOKEN=…
npm run supabase:delete-deprecated-fns          # dry-run first
DRY_RUN=0 npm run supabase:delete-deprecated-fns
```

Targets: `sharepoint-proxy`, `bluebeam-proxy`, `stripe-setup`, `stripe-webhook`, `stripe-worker`

- [ ] Dry-run reviewed
- [ ] Applied with `DRY_RUN=0`
- [ ] `supabase functions list` no longer shows the five names
- [ ] Billing checkout/webhook still works after delete

| Field | Value |
|---|---|
| Date deleted | |
| Operator | |
| Post-delete billing smoke | |

### 3.3 Token / secret hygiene

- [ ] `VERCEL_TOKEN` recreated project-scoped, 90-day expiry
- [ ] `SUPABASE_ACCESS_TOKEN` in GitHub secrets
- [ ] `SENTRY_AUTH_TOKEN` in GitHub secrets (source maps)
- [ ] Calendar reminder for 90-day rotation

---

## 4. Hard blocker — legal only

### 4.1 S&H Steel employment / IP conflict — [CLAUDE.md gate]

CLAUDE.md: *"Employment/IP conflict with S&H Steel is unresolved — do not add
billing, multi-tenant signup, or public marketing copy without being told this
has cleared legal review."*

- [ ] Written legal clearance received
- [ ] Clearance date and counsel recorded below
- [ ] Only after clearance: public marketing, self-serve billing signup, or
      multi-tenant go-to-market copy may proceed

| Field | Value |
|---|---|
| Clearance date | |
| Counsel / firm | |
| Scope of clearance | |
| Notes | |

---

## 5. Reassessment snapshot (2026-08-04)

| Gap area | Code status | Evidence status |
|---|---|---|
| Ops/DR (PITR + Storage) | Complete (scripts + runbooks + workflow) | **Pending owner** |
| Compliance (legal, Tax, erasure) | Complete (pages, hooks, RPCs, edge fn) | **Pending owner / counsel** |
| Governance (branch protection, dead fns, a11y) | Mostly complete (helpers, FormField, DataTable keyboard, contrast tokens) | **Pending owner** for protection + dead-fn delete; a11y continues incrementally |
| Maturity (TS conversion, Stripe E2E) | ~42% TypeScript; Stripe code path complete | **Pending owner** Stripe E2E; TS ongoing |
| S&H IP hard blocker | N/A (legal) | **Pending legal clearance** |

When every section above is checked and filled, re-score enterprise readiness
against [`tier1-enterprise-status.md`](./tier1-enterprise-status.md).
