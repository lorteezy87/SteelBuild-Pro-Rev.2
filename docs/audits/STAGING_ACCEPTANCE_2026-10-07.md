# Staging release and hosted acceptance — 2026-10-07

Target: persistent Supabase staging branch `ndyfjffsulfbwpmwdmic`. The owner approved the original five migrations and seven functions in candidate `1f475a4aaf2451b81456d8e3cb1cc2ecdad7a242`, then separately approved the two forward erasure fixes at `44e04ea6d28016feccdfe33b97fb19141d657efa`. Production `kjrwqagyeswwoxpjkcko`, the production frontend, and `main` have not been changed by this staging release.

**The approved staging backend package is applied and source-verified: seven migrations and seven functions.** Both erasure corrections passed hosted regression and overlapping HTTP tests; account-delete v5 passed real MFA denial, ownership denial, journal recovery and disposable-account cleanup. All synthetic accounts, workspaces, projects, Storage objects and temporary test controls were removed. Billing/read-service configuration, production authorization, native delivery and operational acceptance remain open. The current frontend has only been exercised locally against hosted staging; neither frontend Worker was replaced.

## Exact candidate and database application

The complete application job passed on the approved SHA in [run 37592304762, job 112698490561](https://github.com/lorteezy87/SteelBuild-Pro-Rev.2/actions/runs/37592304762/job/112698490561). Secret scan and Edge typecheck also passed. The complete dependency audit and production drift remain failed for the previously documented development dependencies and required production migrations. No gate was weakened.

The separately approved follow-up SHA `44e04ea6` passed the complete application job in [run 37599017686, job 112718815317](https://github.com/lorteezy87/SteelBuild-Pro-Rev.2/actions/runs/37599017686/job/112718815317), plus secret scan and Edge typecheck. Both forward fixes were applied and stamped at 09:20 UTC. These results validate that backend release source; subsequent frontend work has its own verification record.

Before applying changes, the release retained the previous function source/JWT modes, affected database definitions/ACLs, authorship foreign keys, and MFA configuration. A combined rollback rehearsal passed. Each approved migration was then executed and stamped in one staging transaction; the ledger retained the full, exact committed SQL blob and verified its SHA-256 inside that transaction.

| Version | Exact committed SQL / ledger `statements[1]` SHA-256 |
|---|---|
| `20260922015713` | `5e91c05e0d37e2775f11f5d734df7d5cc955b471f1bd2bbed9c84c43f94f1b80` |
| `20260927150000` | `34500dcf125e3b10432dcfb44c3d10705b77a491263dcd95f155e3c1160550c5` |
| `20260927160000` | `e67a55a414277691c20599003cedcafc79bad51ccc447b47930ff06d3602215c` |
| `20261005100745` | `e05b215cc397e96d41bf10d037d491ff1b2078db62fd60762c13b1fdcdd9839d` |
| `20261007073051` | `8354f2ff700eb49b4d3e6580419c07087bc1e6cfbbe6222dec58bc1a52162e9e` |
| `20261007084117` | `870c0bd5e93e6fc042971a49f1814fa0753d41fc0aa836ac92906fa34e3f8c3f` |
| `20261007090057` | `6f26bbec42ca29e33accb246f38a3fa9ecbf34d1f0b10ec51eda9152015aeb2d` |

Post-application inspection confirmed the piece-event primary key and retained piece/time index, no remaining public Auth foreign keys with NO ACTION/RESTRICT, the intended PostgREST MFA hook, and restrictive MFA policies on private Storage and the isolated Realtime probe. The committed MFA readiness query returned zero gaps. The pending-permissions regression passed and rolled back.

## Edge source verification

| Function | Before → staging version | Gateway JWT | Result |
|---|---:|---|---|
| llm-proxy | 45 → 46 | false | Deployed; source verified |
| email-send | 31 → 32 | true | Deployed; source verified |
| stripe-billing | 31 → 32 | false | Deployed; source verified; billing configuration hold |
| project-export | 34 → 35 | true | Deployed; source verified |
| command-center-session-handoff | 15 → 16 | false | Deployed; source verified |
| command-center-read | 14 → 15 | false | Deployed; source verified; service configuration hold |
| account-delete | 4 → 5 | true | Deployed at 09:20:56 UTC; source verified; hosted acceptance passed |

All 47 downloaded file entries across the seven deployed bundles match the approved package exactly, allowing only the tool's differing path root. This includes all seven files in account-delete v5 and the previously verified 40 entries in the other six bundles. JWT modes match the snapshots. `email-ingest`, `health`, and other functions were not deployed.

## Hosted boundary evidence

Validation used three disposable Auth accounts, initially two disposable workspaces and then two additional exact concurrency fixtures, normal workspace/project creation RPCs, actual enrolled factors, and real Auth-issued tokens. No existing account password, provider key, or production data was copied. Credentials and tokens stay out of reports and source control.

- REST project reads, probe writes, and the project-role RPC reject both fresh and pre-enrollment AAL1 tokens after enrollment with HTTP 403 / `MFA_REQUIRED`. AAL2 and unenrolled controls retain their authorized access; a foreign AAL2 account remains denied.
- Private Storage upload, download, replacement, deletion, and signed-URL creation were exercised. Denied replacement/deletion leaves the original content intact, and workspace isolation remains effective.
- Fresh Realtime subscriptions delivered authorized INSERT/UPDATE controls and withheld protected rows from enrolled AAL1 and foreign accounts. Existing-connection downgrade stopped delivery after the server's subscription catalog showed the AAL1 claims; upgrading resumed delivery. The SDK's `setAuth` completion is not a server acknowledgement: an initial 750 ms observation was too early, and the test was corrected to verify server processing. This does not establish instantaneous revocation or filtering of DELETE notifications.
- llm-proxy, email-send, and session-handoff reject enrolled AAL1 with `mfa_required`; AAL2 reaches the expected safe invalid-request response. Project-export rejects AAL1 and returns an authorized AAL2 export. No provider request or outbound message is made.
- Billing and command-center-read return 503 before their MFA guard because staging configuration is unavailable. These are closed configuration failures, **not** successful hosted MFA acceptance for those handlers. Billing needs its mode-appropriate test configuration; read service requires `STEELBUILD_BASE_URL` in addition to injected Supabase settings. No production secret was copied.

## Erasure failures and their verified corrections

The failure evidence below is retained as the pre-fix record. Both forward fixes are now permanently applied only to staging, and the account-delete acceptance and cleanup below have passed.

The repository's older account-deletion fixture required adaptation to the current hosted schema: authorized project creation/archival, valid required fixture values, and bounded authored-record setup. All actual erasure, ownership, authorship, and tenant assertions run with normal application triggers enabled. Setup changes do not waive erasure assertions.

With current valid rows, deleting the synthetic author fails at `enforce_revision_summary_guards`: the Auth foreign key attempts `drawing_revision_summaries.generated_by = NULL`, which the immutable-report guard rejects. The transaction rolled back; a follow-up query confirmed zero regression users/workspaces/projects and normal trigger mode. Review also identified frozen T&M ticket attribution changes as requiring protection against inappropriate recalculation and audit events.

A separate forward correction, `20261007084117_permit_authorship_cleanup_through_immutable_guards.sql`, passed both the focused real-FK regression and the complete hosted rollback test. It permits only the Auth-cascade attribution change, preserves immutable report content and ticket finances, and avoids a false ticket-update event. Direct and nested mixed-content edits remain rejected. Existing signatures, ownership, ACLs and security settings are unchanged. This correction was subsequently applied under the separate `44e04ea6` approval; the five originally approved files and ledger payloads remain unchanged.

The ordinary authenticated timeout control was exercised over HTTP and stopped at 8.108 seconds with `57014`, confirming the eight-second baseline. Early cross-tool attempts did not overlap and correctly failed their minimum-wait assertion; a serialized test is not a concurrency pass. The subsequent single-process HTTP harness observed the active database phase before launching each competitor.

Membership-first passed: erasure waited 5.936 seconds for the six-second membership transaction, then returned empty scope and preserved the now-shared workspace. Erasure-first **failed**: PostgreSQL logged `40P01` in the trigger-toggle path at `2026-10-07T08:52:24.193Z`, with a SHARE ROW EXCLUSIVE relation-lock conflict. The membership test unexpectedly inserted and deliberately raised `P0001`, rolling its fixture write back. The erasure request subsequently returned 200 after 19.352 seconds and erased only the disposable workspace/project. That final 200 does not erase the concurrency failure or establish a clean timeout pass. The separately applied lock-order correction addresses this demonstrated inversion.

The first timing test's temporary schema, trigger and control RPCs were removed after both operations settled. Its original private Storage test object and the three disposable Auth users were retained until the subsequent account-delete acceptance, which recovered and removed that object before deleting the remaining fixtures.

The two exact [forward corrections](ERASURE_FOLLOWUP_CANDIDATE_2026-10-07.md) subsequently passed a combined hosted rollback rehearsal. A private clone of the lock correction, changed only in its qualified function name and exposed through an exact-fixture guard, then passed all four actual overlapping HTTP cases. Membership-first, workspace-creation-first and project-insertion-first waited 5.947, 5.917 and 5.975 seconds, respectively, and preserved the shared workspace. Erasure-first completed in 9.307 seconds, exceeding the ordinary eight-second timer while retaining the scoped 60-second function timeout; the competing membership insert waited 9.028 seconds inside the database and was rejected with `23503`. Only the exact disposable workspace and two projects were erased.

Private sequence counters survived transaction rollback and showed exactly one entry for every delayed operation, ruling out the hidden-retry false pass observed previously. The bounded database-log check returned no `40P01`, `57014` or `55P03` events during these cases. All clone/control functions, sequences, schema and delay triggers were removed afterward. At that rehearsal checkpoint the application RPC and ledger were unchanged. The owner then approved both exact `44e04ea6` payloads; their permanent staging transactions passed full-blob ledger hash checks. The original five approved payloads are unchanged.

## Account-delete v5 acceptance and final cleanup

The already-approved `1f475a4a` account-delete bundle was deployed after both forward fixes, with gateway JWT verification retained. The real function then passed 66 assertions across five staged phases:

| Phase | Checks | Hosted result |
|---|---:|---|
| Enrolled A, fresh AAL1 | 21 | HTTP 403 / `mfa_required`; existing AAL2 proved the full Auth user, workspace, project, A+B roster, photo row and photo bytes unchanged. |
| AAL2 sole owner with teammate | 11 | HTTP 409 / `SOLE_OWNER_WITH_MEMBERS`; project, roster and photo retained. |
| Delete C after prior workspace erasure | 10 | HTTP 200; one Auth user and one real journal-recovered Storage object removed; no workspace left to erase. |
| Delete nonowner B with a separate sole-owned workspace | 15 | HTTP 200; one Auth user and exactly its one sole-owned concurrency workspace removed. A's workspace, project, drawing and ownership survived. Privileged SQL confirmed physical absence of B's workspace, members and projects. |
| Delete A after becoming sole member | 9 | HTTP 200; one Auth user, one workspace and one Storage object removed. |

Safe phase results are retained as `account-{deny-aal1,deny-owner,delete-foreign,delete-plain,delete-mfa}-results.json` in the local staging release journal. The privileged postcheck avoids treating an RLS-empty client response as proof of physical deletion.

The final privileged query found zero remaining validation Auth users, zero of the four exact workspace IDs, zero of the four exact project IDs, and zero Storage objects under the validation run/workspace prefixes. The temporary RPCs, schemas and delay triggers are gone. The MFA probe table and publication membership were removed; the Realtime publication has returned to its original zero-table baseline. The committed MFA readiness query again returned zero gaps. This closes synthetic fixture cleanup; it does not imply that future publication additions automatically receive the required policy.

## Workspace UI and browser acceptance

The shell now presents a labeled Workspace selector beside the project picker on desktop/tablet and in a dedicated phone row. It uses the existing owned cache boundary. Changing workspaces navigates to `/Projects`, clearing the previous project's deep-link query; selecting the current workspace preserves the current route and work. A single membership displays its workspace without a redundant switcher.

The actual local frontend against hosted staging passed six browser checks: password login followed by the real MFA challenge, AAL2 access, selector containment at 390 px, field-photo persistence under the active workspace/project, switching to the second workspace with the first drawing absent, and sign-out followed by an unenrolled user's own scoped cache. Telemetry was deliberately blocked during this synthetic validation. There were no unexpected HTTP or runtime failures in that completed flow.

Testing also corrected stale acceptance assumptions: the landing button is `Log in`, and `/Drawings` redirects to the Detailing Control Center's drawing tab. The set fixture belongs in `Sets & revisions`. Exact response-field, selected-project, rendered-row, and read-only guards remain required. New regressions reject a wrong hub tab and a description-only fixture match. At the workspace-selector checkpoint, all 76 desktop/mobile foundation checks passed locally, alongside 18 focused selector/shell/provider tests, all four type gates, full lint, new-source policy, production build, and unchanged bundle limits (162.8 KB initial / 3,193.4 KB total gzip). Subsequent interface changes have a separate [construction design verification record](CONSTRUCTION_DESIGN_REFINEMENT_2026-10-07.md).

## Security advisor delta

The post-application advisor adds one authenticated SECURITY DEFINER finding for `erase_my_sole_member_workspaces(text)`, the intentionally exposed self-erasure RPC whose caller/ownership paths passed the acceptance above. After all temporary controls were removed, the final advisor counts were seven RLS no-policy findings, 154 authenticated SECURITY DEFINER findings, and one leaked-password-protection warning, unchanged from the post-application inventory. See [Supabase database advisors](https://supabase.com/docs/guides/database/database-advisors) for remediation guidance; an inventory comparison is not a blanket security clearance.

## Remaining release work

The seven approved migrations, seven source-verified function deployments, real account-delete acceptance, synthetic cleanup and final MFA readiness checks are complete for staging. Billing and command-center-read still return closed 503 configuration failures and require their own configured hosted acceptance. The five high development-dependency findings remain unresolved and unwaived; production drift and production authorization remain open. Native build/distribution and operational acceptance, including representative volumes, monitoring, backup restoration and business-owner workflow signoff, remain separate release work. The current frontend candidate is exercised locally against hosted staging; the existing staging Worker has not been replaced.
