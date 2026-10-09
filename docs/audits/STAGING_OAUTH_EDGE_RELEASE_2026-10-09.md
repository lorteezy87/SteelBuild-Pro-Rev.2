# Staging-only OAuth Edge release procedure — 2026-10-09

This amendment permits the existing authenticated Supabase connector as the
execution mechanism for the already requested staging backend release. It
preserves the source, SQL, rollback, JWT and hosted-acceptance requirements in
[the reviewed backend runbook](../runbooks/reviewed-backend-release.md).
It performs no deployment and does not relax or satisfy production approval.

The pending decision about creating and storing a persistent deployment PAT is
a separate credential-management action. No new PAT, OAuth token export,
environment-secret change, permission change, or fallback to the repository-wide
inventory token is part of this staging procedure. The automated GitHub release
workflow still requires its distinct environment credential when that workflow
is used. Its source gates and production reviewer rule remain unchanged.

## Scope and preserved JWT contracts

Only project `ndyfjffsulfbwpmwdmic` and these seven existing staging functions
are in scope. A deployment replaces one named function at a time; no bulk or
all-functions operation is permitted.

| Function | Preserved gateway JWT | Staging version captured before this release | Production version captured for reference only |
| --- | --- | ---: | ---: |
| llm-proxy | false; internal bearer/MFA checks | 46 | 44 |
| project-export | true; handler authorization retained | 35 | 31 |
| stripe-billing | false; webhook signatures and internal action authorization | 32 | 31 |
| email-send | true; handler authorization retained | 32 | 31 |
| command-center-read | false; internal bearer/MFA checks | 15 | 14 |
| command-center-session-handoff | false; internal create/redeem authorization | 16 | 15 |
| account-delete | true; handler authorization retained | 5 | 4 |

No other function, database policy, migration, Storage object, provider setting
or secret is changed by this procedure. In particular, `email-ingest`, `health`,
bootstrap, deprecated and sibling-application functions remain outside scope.

## Evidence already prepared

The release coordinator retained fourteen prior function source bundles and
their metadata/JWT modes, captured at **2026-10-09 14:36:32 UTC**, in
`2026-10-09-reviewed-edge-before.json` under the owner's local
`Documents/Codex/release-evidence` directory. Archive SHA-256:
`ccdeeedc0d95da63a9bda8f369bc3ba4ef06241417a34cd6562d53d6febee0d7`.
Independent local inspection found fourteen unique target/slug records, one
matching entrypoint per bundle, no duplicate file names, no missing relative
imports and no nonliteral dynamic imports. Per-file content hashes were
calculated without printing source payloads or credentials. This proves local
source-closure retention; it is not a restore rehearsal or an offline mirror of
remote dependencies. Recheck live version/JWT immediately before replacement;
if either changed, capture and review the new prior source first.

A separate source inventory was prepared from exact Git blobs at main snapshot
`e69d8cb7d5feaa31e2bb6bf79a2185368312513f`: 33 unique local files across the seven
closures. `command-center-read` includes `src/lib/recordLinks.ts` outside the
function directory, so preserve the complete repository-relative layout.
No applicable Deno JSON/config, import-map or lockfile was present in the checked
root, Supabase, shared function and per-function locations. Several committed
external import specifiers contain ranges or no version; local Git-file hashes
do not lock those remote resolutions. Do not change dependencies during release.

This inventory is preparation, **not the selected release SHA**. Select the
final merged main commit after the pending acceptance changes land, regenerate
all file/closure hashes from that exact Git object and retain the chosen SHA in
every subsequent record. Uncommitted working-tree source is never a payload.

## Staging execution and acceptance

1. Freeze one exact merged main SHA. Verify that all four named jobs succeeded
   together in a completed **push** CI run for that exact SHA: `Lint + Typecheck
   + Test + Build`, `Secret scan (gitleaks)`, `Release Edge Function typecheck`,
   and `Commercial SQL + concurrent PostgreSQL acceptance`. Retain the run/job
   identities. A successful job from another commit or a collection of different
   runs is insufficient. Do not suppress any check.
2. Verify the candidate's installed staging SQL prerequisites using exact
   committed SQL/ledger hashes and the already reviewed boundary rehearsals.
   Include current-membership and MFA helpers, the complete erasure corrections,
   and both atomic Stripe receipts and durable checkout intent migrations before
   their dependent handlers. This step reads evidence; it grants no permission
   to apply SQL, repair a ledger or invoke MCP `apply_migration`.
3. Reconfirm the target is the staging project above, the seven prior versions
   and JWT settings match retained inventory, and the complete rollback source
   can be read locally. Stop on missing files, changed versions, an unexpected
   function or configuration mismatch. Keep a durable copy of the archive.
4. For each named function, call the existing OAuth `deploy_edge_function` with
   the exact selected entrypoint, complete relative-import file collection, fixed
   staging project reference and the table's explicit `verify_jwt` value. Include
   any applicable source-controlled Deno/import-map configuration if the final
   source inventory discovers one. Never create a credential to make this call.
5. Immediately read back the function and metadata through the same connector.
   Verify the expected new version/status, unchanged JWT mode and every uploaded
   local source file hash, including shared dependencies. Record deployment time,
   exact main SHA, before/after version and source parity. Preserve raw bytes;
   if the platform only changes line endings, retain raw and normalized hashes
   and explicitly record the difference rather than calling it byte-identical.
6. Complete real staging authentication and endpoint-specific checks below with
   dedicated synthetic identities and project data. Record expected response
   classes and sanitized results. A deployed version or a configuration-related
   503 alone does not establish authenticated acceptance or provider readiness.
7. Stop the package's promotion on any mismatch or missing acceptance evidence.
   Diagnose and prepare a reviewed forward fix. Redeployment of captured prior
   source remains subject to the runbook's explicit rollback approval and must
   preserve its original JWT setting. Never remove authorization to make a test
   pass. No production action is implied by staging success.

| Boundary | Required staging evidence |
| --- | --- |
| Common authentication | Missing/invalid credentials denied; enrolled AAL1 denied and valid AAL2 reaches its authorized contract; revoked workspace membership and foreign project access denied. |
| llm-proxy | Foreign project and invalid/MFA requests denied before provider spend; body/limit and quota boundaries remain enforced. Do not incur paid AI calls merely for a smoke test. |
| project-export | Authorized synthetic export retains the shared v2 shape and excludes mailbox credentials; inaccessible project and unauthenticated export denied. |
| stripe-billing | Explicit test mode/config required; missing mode fails closed, no live-key fallback, unsigned/malformed webhook denied. Durable checkout/replay/concurrency and provider test-mode acceptance must be recorded. No real charge, refund or cancellation. Missing provider access remains a visible gap. |
| email-send | Recipient/project/workspace authorization and MFA denials occur before delivery. Do not send customer email; authorized-delivery acceptance needs a separately approved synthetic sink if not already configured. |
| command-center-read | Configured staging base URL, caller/project scope, membership/MFA and authenticated read shape are verified without production routing. |
| command-center-session-handoff | Create/redeem authorization, token audience/expiry, one-time redemption and wrong-user/workspace cases are verified with synthetic identities. |
| account-delete | Approved synthetic account/workspace cleanup preserves other member identities and immutable records, with erasure SQL installed and cleanup counts recorded. Never delete a customer identity or workspace. |

## Production checkpoints that this amendment does not waive

The release coordinator must have actual evidence for every checkpoint below;
none is satisfied by selecting a different deployment tool.

| Checkpoint | Evidence required before production |
| --- | --- |
| Exact source | One selected main SHA and the five successful required jobs together, adding `Supabase drift check` to staging's four. |
| Database readiness | Exact prerequisite SQL/ledger hashes and installed authorization/transactional acceptance. Inventory membership alone does not verify SQL bodies. |
| Staging parity | Every selected function deployed and source/JWT verified on staging from that same main SHA, plus its completed hosted acceptance. Repeat staging if the release SHA changes. |
| Production reviewer | The required production reviewer reviews the staging results and approves release. This staging-only document does not replace that reviewer or authorize bypassing a waiting/denied GitHub environment review. |
| Prior production source | Fresh complete production source/JWT backup and no unexpected concurrent version change before replacement. |
| Post-release verification | Actual production version/source/JWT readback and non-destructive authenticated/browser smoke; separate provider configuration and monetization gaps remain visible. |

The ordinary production workflow also requires a successful same-SHA staging
**workflow run** for each function. A manual OAuth staging deployment does not
create that event and must never be represented as one. If production uses the
existing workflow, its current staging-run and environment-review gates still
apply. Any later proposal to use OAuth for production needs its own reviewed
execution record preserving these checkpoints; this amendment covers staging
only. A persistent PAT is an automation-mechanism choice, not evidence that any
of the above checkpoints passed.

Official capability/configuration references:
[Supabase Edge deployment](https://supabase.com/docs/guides/functions/deploy)
and the available connector's named function, file-collection and JWT arguments.
