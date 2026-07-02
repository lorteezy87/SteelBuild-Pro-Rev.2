# Incident Response Runbook

**SteelBuild Pro**
Date: 2026-07-01
Finding: [H27] (no incident detection/response process)

Refs:
- Production: `https://steelbuild-pro.com`
- Vercel project: `steelbuildpro-og`
- Supabase project: `kjrwqagyeswwoxpjkcko`
- GitHub repo: `lorteezy87/SteelBuild-Pro-Rev.2`
- Primary on-call / owner: **nickl@shsteelaz.com** (+ SMS)

---

## 1. Detection

Incidents are detected by, in rough priority order:

1. **Uptime monitor** (UptimeRobot / Checkly — see owner-checklist H27) on `https://steelbuild-pro.com` + a health endpoint → alert to email + SMS on failure.
2. **Sentry alerts** (owner-checklist H7): new-issue alert and error-rate-spike alert → email + SMS.
3. **Supabase / Vercel status** (vendor status pages + dashboards).
4. **Stripe dashboard** (payment/webhook failures).
5. **User report** (support@ mailbox — owner-checklist L27).

On any alert: acknowledge, then classify severity (Section 2) and open an incident record (a dated note capturing timeline, actions, and impact).

---

## 2. Severity levels

| Sev | Definition | Examples | Target response |
|---|---|---|---|
| **SEV1** | Prod down or data at risk for **all/most** tenants; or any suspected data breach / cross-tenant leak. | Site 500s for everyone; login broken; Supabase down; cross-tenant data visible; suspected credential/key compromise. | **Immediate.** Owner engaged now. Consider `LLM_KILL_SWITCH` / rollback within minutes. |
| **SEV2** | Major feature broken or degraded for many users; workaround may exist; no data-loss risk. | AI features failing; drawing upload broken; billing checkout failing; one edge function erroring. | Within **1 hour**. |
| **SEV3** | Minor/cosmetic, single-tenant, or low-impact; not time-critical. | One page layout bug; a non-blocking console error; a single user's edge case. | Next business day. |

When in doubt, **round up** one level.

---

## 3. Per-dependency playbooks

### 3.A Vercel — bad deploy / frontend broken
Symptoms: site errors right after a deploy; new JS bundle throwing.
1. Confirm the last deploy time correlates with onset (Vercel dashboard → Deployments).
2. **Instant Rollback**: Vercel dashboard → Deployments → select the last-known-good production deployment → **Promote to Production** (instant, no rebuild). CLI equivalent: `vercel rollback` (or `vercel rollback <deployment-url>`).
3. Because Vercel git auto-deploy is **off** and CI is the sole deploy path, do **not** just re-push — first roll back to restore users, then fix forward on a branch and let CI redeploy.
4. Verify prod loads; capture the bad SHA and root-cause it before re-deploying.

### 3.B Supabase — database / API outage
Symptoms: app loads but all data calls fail; auth fails.
1. Check the **Supabase status page** and project dashboard health.
2. If **vendor outage**: nothing to fix in-app — post status (Section 4), monitor, wait for vendor recovery. The frontend stays up (Vercel) but shows data errors.
3. If **project-specific** (e.g. connection exhaustion, a bad migration, corruption): see `backup-dr.md` (PITR in-place for bad-write/corruption; restore-to-new for project loss).
4. If **connection exhaustion**: review pooler settings / recent query changes; consider the Auth connection-allocation fix (owner-checklist L19).

### 3.C OpenAI — LLM provider outage
Symptoms: AI features (revision diff, email classify, schedule assistant) failing; `llm_telemetry` shows provider errors.
1. Confirm via OpenAI status + `llm_telemetry` failure rows.
2. **AI degrades gracefully to deterministic paths by design** — critical PM workflows have deterministic fallbacks (e.g. email classify → regex fallback). Confirm the app is still usable without AI.
3. Optionally **fail over the provider**: in `llm-proxy` routing (`router.ts`), route model turns to **Anthropic** instead of OpenAI (requires the Anthropic key set in edge secrets). This is a code/secret change — treat as a deliberate SEV2 action.
4. Communicate that AI features are temporarily degraded (Section 4).

### 3.D Stripe — billing / webhook outage
Symptoms: checkout fails; webhooks not arriving; plan changes not reflected.
1. Check the **Stripe status page** and the Stripe dashboard → Developers → Webhooks (delivery attempts/failures).
2. **Entitlements survive an outage**: access is gated on the **`organizations.plan`** anchor in Postgres, changed **only** by the webhook. An outage does not immediately downgrade anyone — existing customers keep working.
3. When Stripe recovers, **replay failed webhook events** from the Stripe dashboard (Developers → Webhooks → select endpoint → resend failed events) so `organizations.plan` catches up.
4. If the webhook endpoint URL is wrong (e.g. after a project rebuild), re-point it to the `/webhook` route inside `stripe-billing`.

### 3.E Cost runaway — LLM spend spike
Symptoms: `llm_telemetry` volume/cost spiking; suspected loop or abuse.
1. **Halt immediately**: set edge secret **`LLM_KILL_SWITCH=1`** (stops ALL LLM calls; takes effect quickly, no redeploy needed for env change).
2. Identify the source (per-user rolling-24h telemetry; which use-case/user/project).
3. Set/tighten the per-user caps: `LLM_DAILY_COST_LIMIT_USD` / `LLM_DAILY_REQUEST_LIMIT` (owner-checklist M50).
4. Once contained, clear the kill switch (`LLM_KILL_SWITCH=0` / unset) and confirm normal calls resume (an `llm_telemetry` success row).

### 3.F Suspected data breach / cross-tenant leak (SEV1)
1. **Contain**: if a specific vector is known (a leaking endpoint/query/RLS gap), disable the path. For LLM data exposure, `LLM_KILL_SWITCH=1`. Rotate any exposed keys/tokens immediately (Vercel token, Supabase keys, provider keys, Stripe keys).
2. **Preserve evidence**: snapshot logs (Sentry, edge logs, `activities` audit trail) before they roll off.
3. **Assess scope**: which tenants, which data, over what window.
4. **Notify**: follow the breach-notification SLA (**72 hours** — see `assurance-pack.md`). Engage counsel; notify affected orgs and any required authorities.
5. Do **not** weaken RLS to "fix" the symptom — RLS is the tenant-isolation boundary.

---

## 4. Communication templates

### Internal ack (on detection)
> `[SEV_] SteelBuild Pro incident opened <UTC time>. Symptom: <what>. Impact: <who/what>. Owner: <name>. Next update in <30/60 min>.`

### Customer / status-page — investigating
> We're investigating an issue affecting <feature/all access> in SteelBuild Pro, starting around <time>. We'll post an update within <interval>. We apologize for the disruption.

### Customer / status-page — degraded (partial)
> <Feature> is currently degraded. <Core project data / login / other features> remain available. We're working on a fix and will update by <time>.

### Customer / status-page — resolved
> The issue affecting <feature> is resolved as of <time>. Root cause: <one line>. No action is needed on your part. / Affected data has been restored. A full postmortem will follow.

### Breach notification (SEV1, within 72h — coordinate with counsel first)
> We are writing to inform you of a security incident affecting your SteelBuild Pro data, identified on <date>. What happened: <summary>. Data involved: <scope>. What we've done: <containment>. What you should do: <actions, e.g. reset password>. Contact: security@<domain>.

---

## 5. Postmortem

- Write a **blameless postmortem within 5 business days** of any SEV1 or SEV2.
- Include: timeline (detection → containment → resolution), root cause, impact (tenants/data/duration), what went well, what didn't, and **action items** (owner + due date) filed into the backlog.
- Feed detection/response gaps back into this runbook and into the monitoring config.
