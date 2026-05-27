# Enterprise-readiness hand-off — owner-only items (2026-05-26)

These are the remaining enterprise-readiness items that **require the project
owner's dashboard / secret access** — an agent can't toggle a Supabase Auth
setting, mint a Sentry token, or change a GitHub repo rule. Each section is
click-by-click. Project refs:

- Supabase project: `kjrwqagyeswwoxpjkcko` → https://supabase.com/dashboard/project/kjrwqagyeswwoxpjkcko
- Vercel project: `steelbuildpro-og` (team `lorteezy87's projects`) → production `steelbuild-pro.com`
- GitHub repo: `lorteezy87/SteelBuild-Pro-Rev.2`, deploy/default branch `main`

---

## 1. Supabase — enable leaked-password protection (≈30 sec)

This is the **one** remaining auth security-advisor WARN
(`auth_leaked_password_protection`). It makes Supabase Auth reject passwords
known to be compromised (checked against HaveIBeenPwned).

1. Open https://supabase.com/dashboard/project/kjrwqagyeswwoxpjkcko/auth/protection
   (Authentication → **Attack Protection**).
2. Turn **on** "Leaked password protection".
3. Save.

Docs / remediation: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

> **Note on "anonymous sign-ins":** the older audit flagged ~86
> anonymous-access policy findings. As of 2026-05-26 the security advisor **no
> longer reports any** of them, so there's nothing to clear there. If you want
> belt-and-suspenders, confirm anonymous sign-in is **off** under Authentication
> → Sign In / Providers (the app uses email/password only) — but it's not an
> open finding.

After toggling, re-check: Supabase dashboard → Advisors → Security should show
0 WARNs except the accepted SECURITY DEFINER items (see §4).

---

## 2. Sentry — un-minified stack traces (source-map upload)

Today `src/instrument.js` captures errors, but production stack traces are
minified (bundled JS). Uploading source maps at build time makes them readable.
`@sentry/react` is already installed; this adds the build-time upload.

**Code wiring — DONE (committed).** `@sentry/vite-plugin` is installed and wired
into `vite.config.js`: it's gated on `SENTRY_AUTH_TOKEN` (local/CI builds without
it are untouched — verified), emits hidden source maps, deletes the `.map` files
after upload, and swallows upload errors so a misconfigured token can never fail
a production deploy. Nothing is hardcoded — `org`/`project`/`authToken` are read
from env at build time.

**You provide (3 Vercel build env vars):** project `steelbuildpro-og` → Settings
→ **Environment Variables** (Production + Preview). The slugs below were resolved
from the Sentry API, so these are the exact values:

| Name | Value | Notes |
| --- | --- | --- |
| `SENTRY_ORG` | `steelbuild-pro` | org slug |
| `SENTRY_PROJECT` | `javascript-react` | project slug (id `4511458819375104`, matches the DSN) |
| `SENTRY_AUTH_TOKEN` | *(your token)* | mark **Sensitive**; needs scopes `project:releases` + `org:read` |

Redeploy after setting them; the next production build uploads maps and Sentry
will symbolicate traces. Until then, error capture + masked replay already work —
only stack-frame readability is affected, so this is **nice-to-have**.

> Security: rotate the auth token in Sentry once you've confirmed symbolication
> works, since it was shared in chat. The repo never stores it (env-only).

---

## 3. GitHub — branch protection for CI (read the tradeoff first)

`.github/workflows/ci.yml` already runs blocking lint + typecheck (TS & JS) +
Vitest + production build on every push and PR. The job's status-check name is:

> **`Lint + Typecheck + Test + Build`**

**The catch:** GitHub's "Require status checks to pass" only gates **pull-request
merges** — it does **not** block direct pushes. This repo currently deploys by
**pushing directly** to `main` (that's the auto-deploy
cadence we've been using). So:

- A plain "require status checks" rule on `main` would
  **do nothing** for the direct-push flow.
- Making it actually gate deploys means **also** enabling "Require a pull request
  before merging" + "Restrict who can push" — which **switches the deploy branch
  to a PR-based flow** and ends the direct-push auto-deploy convenience.

Pick one:

- **(A) Keep direct-push deploys (status quo).** CI still runs on every push and
  gives red/green signal; it just isn't a hard gate. Lowest friction.
- **(B) Gate the deploy branch.** GitHub → repo **Settings → Rules → Rulesets**
  (or Settings → Branches → *Add rule*) → target `main` →
  enable **Require a pull request before merging** + **Require status checks to
  pass** → search and select **`Lint + Typecheck + Test + Build`** → optionally
  **Require branches to be up to date**. From then on, land work via PR, not
  direct push.
- **(C) Defer to the `main` rename.** When the deploy branch is renamed to
  `main` (see the deferred item), set the ruleset up on `main` at the same time
  so the convention starts clean.

Recommended: **(A) for now**, move to **(B)/(C)** when the team is ready to adopt
PR-based deploys.

---

## 4. Context — security-advisor items that are *accepted* (no action)

So these don't get chased as if they were open bugs:

- **12 × `authenticated_security_definer_function_executable` (WARN).** These are
  the RLS helper functions (`user_has_project_access`, `user_has_project_role`,
  `user_has_project_role_at_least`, `user_is_project_admin`, `user_is_system_admin`,
  `get_my_project_role`) plus the intentional app RPCs (`create_project`,
  `delete_drawing_set`, `get_next_sequence_number`, `set_for_drawing_is_locked`,
  `set_for_zone_is_locked`). They **must** be `SECURITY DEFINER` (the helpers are
  called inside RLS policies; the RPCs perform privileged work after their own
  authz checks — guards + `search_path` were hardened in migration
  `20260525074300`). Revoking EXECUTE would break RLS. **Accepted.**
- **1 × `rls_enabled_no_policy` (INFO) on `bluebeam_oauth_states`.** Intentional:
  the table is written only by the bluebeam edge function via the service-role
  key (which bypasses RLS), and no client should read it. "No policy" = no
  client access, which is the desired lockdown. **Accepted.**

---

## Done elsewhere this pass (for reference)

- RLS `multiple_permissive_policies`: **143 → 0** (migrations `20260526190000`,
  `20260526200000`, `20260526210000`) — incl. closing a `user_projects`
  self-insert privilege-escalation hole.
- Unused-index review + 5 safe drops (`20260526180000`,
  `docs/unused-index-review-2026-05-26.md`).
- `sharepoint-proxy` org-browse admin gate deployed live (edge fn v6).
- Per-project-role UI gating.
