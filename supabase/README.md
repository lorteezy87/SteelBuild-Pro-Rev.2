# Supabase — local, branch and production contract

Project: `kjrwqagyeswwoxpjkcko` (production, shared with `SteelBuild-Pro-2026`
and `steelbuild-sheets-web`).

## Required environment variable

`config.toml` reads one value through `env()`. Put it in a `.env` at the **repo
root** (gitignored); the CLI loads it on `supabase start` and on branch config
sync.

```bash
# .env  (repo root, never committed)
SUPABASE_AUTH_SITE_URL=http://127.0.0.1:3000
```

| Environment | Value |
|---|---|
| local | `http://127.0.0.1:3000` |
| staging branch | `https://<branch-ref>.supabase.co` |
| production | `https://steelbuild-pro.com` |

If it is unset the CLI substitutes an empty string, auth redirects break, and
`supabase start` will not sign you in. That is the first thing to check.

> `.env.example` should carry this line too. It is not added there yet.

## Why `site_url` is not committed

`config.toml` is pushed to **every** Supabase branch by the GitHub integration.
A hardcoded `http://127.0.0.1:3000` therefore does not stay on a laptop — it
becomes the redirect base for staging, and would become production's if the
production branch were ever un-protected. Password reset and magic links break
outright when that happens, so the value has to come from the environment.

## Auth values match production deliberately

The branch build log diffs `remote[auth]` against `local[auth]`. Until
2026-09-14 this repo's side was weaker than production on every line that
differed:

| Setting | Production | Repo, before |
|---|---|---|
| `email.enable_confirmations` | `true` | `false` |
| `email.otp_length` | `8` | `6` |
| `email.max_frequency` | `1m0s` | `1s` |
| `mfa.totp.enroll_enabled` | `true` | `false` |
| `mfa.totp.verify_enabled` | `true` | `false` |

Production kept its own values only because its branch is flagged protected —
the build log says `Skipping configuration for protected branch`. Every
*preview* branch, though, got the weak set: no email confirmation, MFA TOTP off,
6-digit OTP, and a 1-second resend throttle that allows both mail-bombing an
address and brute-forcing an OTP.

These are now aligned with production. Local development is unaffected:
`supabase start` routes mail to Inbucket, so email confirmation costs a click in
the local inbox rather than a real delivery.

**Do not weaken them to make a local flow quicker.** A branch is where flows get
demonstrated and signed off; it has to refuse what production refuses.

## Storage buckets

The two production buckets are declared in `config.toml` so a branch or a
local stack comes up with the same storage surface:

| Bucket | Public | Limit | Notes |
|---|---|---|---|
| `app-files` | no | 50 MiB | drawings, models, documents, photos; 31 allowed MIME types |
| `email-attachments` | no | 25 MiB | inbound email intake; no MIME restriction, senders choose |

Before this, a new branch reported `No buckets found` and every upload path
failed there, so drawing and model features could not be exercised on a branch
at all.

## Branch types — use a persistent branch for staging

A **preview** branch is ephemeral and tied to a PR. If its migrations fail it is
reaped, which is exactly what happened to a branch named `staging` created on
2026-09-14: `persistent: false`, `MIGRATIONS_FAILED`, gone within the hour.

A staging environment must be **persistent**:

```bash
supabase --experimental branches create --persistent
supabase --experimental branches list   # copy the BRANCH PROJECT ID
```

Only once it exists can it be configured, because `project_id` has to reference
a live branch:

```toml
[remotes.staging]
project_id = "<branch-ref>"

[remotes.staging.db.seed]
enabled = true
sql_paths = ["./seeds/staging.sql"]
```

That block is **not** in `config.toml` yet — there is no persistent branch to
point it at.

## Migration directories

| Directory | Runs? | Purpose |
|---|---|---|
| `migrations/` | **yes** | the executable set; the CLI and branch runner apply every `<14-digit>_*.sql` here, in order |
| `migrations_quarantine/` | no | migrations that must never be applied — see its README |
| `migrations_external/` | no | recovered SQL already applied to production, kept as evidence |
| `migrations_archive/` | no | pre-timestamp legacy files (`001_…`) |

Only `migrations/` is an executable surface. Neither the CLI nor the branch
runner reads `production-ownership-manifest.json`, so a dangerous file cannot be
neutralised by declaring it — it has to be moved out of that directory.

## A failed branch build can leave a lying ledger

Observed 2026-09-14 on the `staging` branch: `20260705000000_enforce_drawing_set_lock_triggers.sql`
was recorded in `supabase_migrations.schema_migrations`, yet **none** of its five
functions or four triggers existed. Its immediate neighbours applied correctly.
The file had rolled back while its ledger row committed anyway.

The consequence surfaced nine files later:
`20260715235514_restrict_security_definer_execution.sql` is 59 bare
`revoke all on function …` statements, and a bare revoke aborts when its target
is absent. So the build stopped at 33 of 111 migrations.

The migration files are not at fault. The 2026-07-25 build log for
`cursor/unlock-drawing-sets-3d17` shows both files applying cleanly in the same
run -- `20260705000000` with only four "trigger does not exist, skipping"
notices, and `20260715235514` with none at all -- and the run continuing to the
end of the set. So this was an environmental fault during one build, not a
defect in the SQL.

**Do not "fix" this by guarding those revokes.** Every function that file
revokes is created by an earlier migration in this repo, so an absent one means
an upstream migration did not take. The hard failure is the only thing that
surfaced a database whose `drawings` table had no lock guard. Reset or recreate
the branch instead.

(The one revoke guard that *is* correct lives in
`20260914020000_revoke_internal_helper_execute_from_authenticated.sql`, because
`feature_flag_enabled_for` is created by **no** migration here — it exists only
in production, so its absence on a fresh database is permanent and expected.)
