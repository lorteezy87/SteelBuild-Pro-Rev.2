# MFA backend source port — review candidate, 2026-10-09

This main-based change ports the seven MFA-aware Edge Function bundles and their
shared helper **byte-identically** from the staging-approved source commit
`1f475a4aaf2451b81456d8e3cb1cc2ecdad7a242`. It also ports focused local
MFA tests and adds their database-boundary runner to CI. It applies no SQL,
deploys no function, changes no JWT mode, and publishes no frontend. The staged
bundle source remains unchanged on the full-rebuild branch as of `5bfc210d`.

The persistent staging project `ndyfjffsulfbwpmwdmic` already has the seven
approved SQL migrations and the seven source-verified functions described in
the [staging acceptance record](https://github.com/lorteezy87/SteelBuild-Pro-Rev.2/blob/5bfc210d35aeb00d61e81430700fd693bb6d2eb9/docs/audits/STAGING_ACCEPTANCE_2026-10-07.md). Production project
`kjrwqagyeswwoxpjkcko` retains the older function versions below. Its MFA
boundary migration `20261007073051` and atomic-numbering migration
`20261007112918` are already applied and must **not** be replayed. This port is
source preparation for a separately authorized production backend release,
not authorization or evidence that production is updated.

| Function | Production → staging version at review | Gateway JWT |
| --- | ---: | --- |
| `llm-proxy` | 44 → 46 | false; authenticates bearer internally |
| `email-send` | 31 → 32 | true |
| `stripe-billing` | 31 → 32 | false; verifies webhook signature and authenticates other actions internally |
| `project-export` | 31 → 35 | true |
| `command-center-session-handoff` | 15 → 16 | false; authenticates internally |
| `command-center-read` | 14 → 15 | false; authenticates internally |
| `account-delete` | 4 → 5 | true |

The current production ledger lacks these six **required** migrations. All six
files are already committed on `main`; none is changed by this port. Each
exact SQL blob matched the staging acceptance hash at source review:

| Apply/stamp order | Version | Committed SQL SHA-256 |
| ---: | --- | --- |
| 1 | `20260922015713` | `5e91c05e0d37e2775f11f5d734df7d5cc955b471f1bd2bbed9c84c43f94f1b80` |
| 2 | `20260927150000` | `34500dcf125e3b10432dcfb44c3d10705b77a491263dcd95f155e3c1160550c5` |
| 3 | `20260927160000` | `e67a55a414277691c20599003cedcafc79bad51ccc447b47930ff06d3602215c` |
| 4 | `20261005100745` | `e05b215cc397e96d41bf10d037d491ff1b2078db62fd60762c13b1fdcdd9839d` |
| 5 | `20261007084117` | `870c0bd5e93e6fc042971a49f1814fa0753d41fc0aa836ac92906fa34e3f8c3f` |
| 6 | `20261007090057` | `6f26bbec42ca29e33accb246f38a3fa9ecbf34d1f0b10ec51eda9152015aeb2d` |

`20260927160000` must not be released as a four-file partial package: the
subsequent `20261007084117` protects immutable financial/report records during
Auth erasure, and `20261007090057` corrects a demonstrated concurrency
deadlock. That lock correction acquires possible trigger-toggle relation locks
before organization row locks. The staging candidate contained **104 tables**;
it can briefly block writes across those tables while an erasure runs. Plan a
quiet DDL window and preserve the documented eight-second acquisition budget
and scoped 60-second erasure timeout.

Two staging endpoints still need configured hosted acceptance. `stripe-billing`
returns 503 before its MFA guard without a mode-appropriate test key and
billing configuration; test mode must never fall back to a live key.
`command-center-read` returns 503 before its MFA guard until staging has
`STEELBUILD_BASE_URL` alongside injected Supabase settings. Configure these
only in staging with staging/test values, then prove AAL1 denial, AAL2 permitted
behavior, tenant boundaries, signed webhook rejection, and no unintended
provider spend. Do not copy production secrets into staging.

The existing [reviewed backend release runbook](../runbooks/reviewed-backend-release.md)
requires approval for the exact six production SQL changes and seven named
function bundles. Its manual workflow currently permits only `llm-proxy`,
`project-export`, and `stripe-billing`; the other four need their own reviewed
source/contract deployment path. The workflow also requires the same exact
commit to pass CI, secret scan and Edge typecheck, to be deployed successfully
to staging per function, and to reach production from `main` after the normal
production drift check passes. The earlier staging release at `1f475a4a` is
strong acceptance evidence for unchanged bytes, but it does not satisfy the
workflow's same-commit gate after this port merges. Re-run staging on the
selected release commit, preserving previous source and JWT inventory.

After separate production authorization, apply and stamp each approved SQL
blob atomically by the `CLAUDE.md` procedure, verify the ledger payload hashes,
MFA readiness and drift gate, then deploy approved functions with the captured
JWT settings. Never run `db push`, migration repair or MCP `apply_migration` on
this shared database. Retain deployment versions, source hashes and
non-destructive production smoke results. Frontend rollback cannot undo backend
migrations or function changes.

The full-rebuild draft includes two further commercial and five Drawing
Control required migrations that are **not** part of this backend port and
remain separate release candidates. Merging that draft for this backend source
would keep production drift red even after the six shared versions above land.
