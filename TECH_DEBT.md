# Technical Debt

Living list of known issues, follow-ups, and "we'll fix it later" items.
Each entry has a clear remediation path so future contributors know
exactly what's needed.

---

## Current security audit and hardening register

**Updated 2026-10-09 (America/Phoenix; original live observations 2026-10-08 UTC).** This is the authoritative current security register. Older dated sections below retain historical context; their original priorities, counts and deployment claims do not override this section. Evidence, exact source references, prerequisites and historical-ID crosswalks are in [the consolidated audit](docs/audits/SECURITY_AUDIT_REGISTER_2026-10-07.md). The [October 9 completion package](docs/audits/SECURITY_COMPLETION_2026-10-09.md) records the continued implementation, retirement and outstanding release prerequisites. The [October 8 remediation report](docs/audits/SECURITY_REMEDIATION_2026-10-08.md) records the requested crane/IFC improvements, severe source corrections, regression evidence and remaining release conditions.

Original audit code: `33abb703df9ea2366134c82ba999c853d67bf345`, including security implementation `219aa4f3e2afebab9984aca69d713d27e908952e`; `742cee35` adds only the documentation claim. Coverage includes identity, tenant/project permissions, all public table/function catalogs, Storage, all nine owned production Edge Function entrypoints, browser/mobile/offline data, CI, dependencies, recovery, telemetry and module boundaries. Live reads were metadata-only. October 8 follow-up provenance and validation are recorded in the remediation report. No production writes, customer-data export, deployment or migration application occurred.

**Status:** **Open** = observed gap; **Ready** = source correction prepared, release/acceptance outstanding; **Partial** = named controls verified with a specific remainder; **Unverified** = evidence still needed, not a demonstrated vulnerability; **Design** = required before the proposed feature ships. **P1** means before sensitive release or tenant expansion; **P2** next hardening tranche; **P3** maintenance. Priorities are remediation order, not a count of exploitable vulnerabilities. Owners below are accountable roles to assign, not assertions that a person has accepted the work.

**Final October 9 refresh:** this branch is a draft source review requiring reconciliation with concurrently advanced main and its active claims; see [integration handoff](docs/audits/SECURITY_INTEGRATION_2026-10-09.md). A read-only production ledger refresh at 23:59 UTC confirms eight selected prerequisite payloads, including MFA, erasure/authorship and atomic billing, now match local SQL. This supersedes their older absence statements below. Membership and this continuation's ten new candidates remain absent. [Exact metadata and scope](docs/audits/SECURITY_LEDGER_REFRESH_2026-10-09.json). No hosted mutation was performed by this continuation. Source-ready status does not imply merge-ready, deployed or accepted.

### Prepared hardening and release gates

| ID / mapping | Priority / status | Owner | Evidence and remaining work | Closure evidence required |
|---|---|---|---|---|
| SBSEC-01; AUTH-11 server boundary | P1 / Ready; live gap | Backend + release | Removed workspace members can retain authority through explicit project-role rows in live SQL. Migration `20261008032524_require_current_workspace_membership_for_project_roles.sql` fixes all three role resolvers; absent from live ledger. | Review exact SQL/payload, apply through the documented manual process after staged negative/positive cases; removed roles denied, current role precedence and legitimate archived administration preserved. Prior isolated SQL regression: 36 checks passed. |
| SBSEC-02; email-send caller boundary | P1 / Ready | Edge + release | Caller-JWT active-project and PM-floor checks now precede privileged mail work; existing shared MFA check retained. Implementation `219aa4f3` has 18 handler tests. Exact deployed revision not verified. | Deploy reviewed artifact only through release process; removed/foreign/viewer/archived requests denied before provider work, valid PM accepted, authorization lookup errors fail closed. Coordinate SBSEC-01. |
| SBSEC-03; AUTH-6 Closeout slice | P1 / Ready | Client + release | Closeout owner-generation checks suppress stale mutation/cache/toast effects; 11 real component tests passed previously. Other active callers remain under AUTH-6. | Reviewed client artifact plus delayed account/org/project-switch acceptance; keep legitimate rollback. This cannot cancel an HTTP request already started or pin its bearer token retroactively. |
| AUTH-2; H23 | P1 / SQL payload present; source and enrollment acceptance open | Identity + backend | Browser MFA race corrected; all five remaining browser Edge entrypoints use verified-user MFA guards (the two desktop endpoints are retired in source). The October 9 23:59 UTC refresh confirms `20261007073051` has an exact matching production ledger payload; the original missing-hook observation is historical. | Verify effective DB request/Storage/Realtime hooks and enrolled AAL1 denied/AAL2 allowed across REST/RPC/Storage/Realtime/Edge, including refresh/recovery/revocation. Exact deployed Edge guards remain separate. Decide privileged-user enrollment policy; SQL enforces enrolled factors. |
| EDGE-5; B41-P1-002/003 | P1 / SQL payloads present; handler acceptance open | Backend + release | Transactional sole-owner erasure, archived census and fail-closed Storage cleanup prepared. October 9 ledger refresh confirms exact erasure/authorship prerequisite payloads including `20260927150000` / `20260927160000`; original absence is superseded. | Verify current deployed definitions, exact handler, staging schema and erasure fixtures; archive/census/erase succeed for authorized owner, other tenant/current member rights preserved, incomplete file cleanup fails closed. EDGE-6 requires coordinated current-main integration and Edge release. |

### Identity and shared-device data

| ID | Priority / status | Owner | Finding and remediation | Closure evidence required |
|---|---|---|---|---|
| AUTH-4 | P1 / Ready, source verified; persistence limitation | Identity | Recovery is captured before React, restored across reload and held until SDK-confirmed sign-out. Cancel ends the session; password updates and failed sign-out cannot release the gate. Per-lifecycle keys prevent stale tabs from overwriting/deleting newer holds; nonce-only cookies cover failed storage writes. MFA remains first where required. [Evidence and limits](docs/audits/SECURITY_REMEDIATION_2026-10-08.md). | Stage actual web/native callback, reload, two-tab, MFA and sign-out failure cases. Client workflow containment does not restrict a valid JWT's direct API privileges. If both storage and cookies cannot persist, current-tab memory/URL cannot guarantee new-tab containment. AUTH-5/8 remain separate. |
| AUTH-5 | P1 / Ready, source; hosted acceptance open | Identity | Web and native callbacks use PKCE. Unsolicited bearer/token fragments, malformed callbacks, missing verifier and replay fail closed; callback URLs are scrubbed before telemetry. Actual installed SDK tests cover verifier consumption and recovery events. | Verify real browser/native provider redirects, cross-device expectations, expired links and recovery/MFA/sign-out on the exact release. |
| AUTH-6 | P1 / Ready for named remaining slices | Client | Calculator rates/history are owner-scoped; Schedule, Field Today and Production Notes reject stale rollback/Undo/follow-ups. Exports pin the original bearer, stop paging after identity changes and suppress stale download/native sharing. Actual component/transport regressions cover these paths. | Run staged identity/workspace-switch and native-device acceptance. Already-started server writes and an OS share sheet already open cannot be recalled; no claim that every application transport is pinned. |
| AUTH-7 | P1 / Retired in source; hosted retirement open | Identity + release | Owner discontinued the companion on October 9. Removed dedicated login, credential export, crypto/callback code and active discovery. Old deep links show an inert notice. Both Edge indices return 410; manifest rejects their presence. Candidate 20261009221740 revokes runtime handoff RPCs. | Apply/stamp retirement SQL, remove both hosted slugs and verify denial. Previously transferred refresh sessions need separately reviewed Auth revocation; old protocol shared browser sessions. See supabase/tests/desktop-retirement/README.md. |
| AUTH-8 | P1 / Open; provider settings unverified | Identity | Sensitive password changes, MFA removal and account/workspace erasure lack explicit fresh proof. Define recent reauthentication plus enrolled-MFA requirements and verify secure-password-change settings. | Old session or missing/expired nonce denied at the authoritative action; recent proof succeeds. Current enrolled-MFA validation alone does not establish authentication freshness. |
| AUTH-9 | P2 / Open, source provenance | Identity + privacy | Signup mints terms timestamps/version in user-editable metadata. Record versioned acceptance with a server timestamp and immutable audit provenance; do not describe client metadata as independent proof. | Direct API and later metadata edits cannot fabricate or rewrite the authoritative acceptance event; required onboarding policy enforced. This is evidence integrity, not an auth bypass or legal conclusion. |
| AUTH-11 UI tail | P2 / Partial | Client + backend | Role-cache invalidation remains an acceptance requirement after membership changes. The historical assertion that revocation is *only* a UI delay was false; server gap is SBSEC-01. | Open screens, fresh REST/RPC, Realtime, offline replay and signed-link behavior tested after removal; clearly distinguish pre-issued URL lifetime from new authorization. |
| SBSEC-11; Auth configuration | P1 / Unverified | Identity + operations | Leaked-password protection, CAPTCHA/abuse limits, password policy, JWT/OTP lifetimes, signup/provider/redirect rules, privileged enrollment and dashboard access not read. Advisor silence does not prove configuration. | Record non-secret effective settings, rationale and controlled positive/negative tests, plus ownership/rotation for privileged access. No blanket claim that these controls are disabled. |

### Database, company/project isolation and files

| ID | Priority / status | Owner | Finding and remediation | Closure evidence required |
|---|---|---|---|---|
| RLS-2 | P2 / Partial, live | Backend | Eleven historical business-table write floors now exist; PMA audit INSERT is closed. `activities` still permits member-level insertion with caller actor pinned. Define authoritatively generated events versus allowed user activity. | Viewer cannot fabricate protected lifecycle/signoff events; legitimate permitted activity works with pinned actor. SBSEC-07 covers the separate submittal RPC. |
| RLS-3 | P1 / Isolated SQL verified; integration required | Backend + billing | Candidate 20261008201934 restricts raw organization/project inserts and enforces this branch's plan caps through creation/reactivation/move paths. Main now has a separate capacity candidate with newer creation fields and restore lock handling. The two triggers cannot ship together as-is. | Consolidate one admission strategy preserving payloads, membership checks, raw-insert restrictions and safe restore/erasure lock order; rerun both suites and real PostgreSQL races, then exact manual apply/stamp. See integration handoff. |
| RLS-4 | P2 / Ready, SQL verified; undeployed | Backend | Candidate 20261009001555 requires an active-project writer for arbitrary number reservation. Private transactional CR allocation preserves the approved viewer change-request workflow, rollback and digits beyond 999. | Apply membership dependency first; stage simultaneous allocation, real CR guards and numbering beyond 999. No client-generated official numbers. |
| RLS-5 | P1 / Ready; reconciliation and release open | Backend + files | Two app-files candidates add authoritative project paths and a reviewed legacy-object registry, then restrictive current-membership/project-role policies. All active shared upload callers provide explicit project identity. Missing reviewed object dispositions abort enforcement. | Review every existing object, shared-bucket callers and required quarantine decisions; staged real Storage read/write/upsert/move/delete/revocation matrix before coordinated cutover. See supabase/tests/app-files/README.md. |
| RLS-6 | P2 / Partial, live | Backend | Historical guarded routines fixed; four low-impact identifier oracles remain: `set_for_drawing_is_locked`, `set_for_zone_is_locked`, `users_share_org`, `founding_org_id`. Restrict access/output to intended scope. | Foreign/unknown IDs do not reveal unauthorized relationships/state; authorized workflow results remain correct. No broad row leak asserted. |
| RLS-7 | P2 / Ready, SQL verified; undeployed | Backend | Candidate 20261009001532 limits raw email override maps to existing platform admins. auth.uid-bound effective projection returns only flag keys/booleans; client and admin UI use guarded RPCs. Case-variant override removal preserves peer entries. | Coordinate SQL/client refresh and verify ordinary REST denial plus platform-admin positive control. Feature flags do not replace authorization. |
| RLS-9 | P2 / Open, live defaults | Backend | Creator default privileges can expose future functions to authenticated roles, and `supabase_admin` defaults include anon. Revoke broad future defaults and explicitly grant reviewed APIs with sibling ownership coordination. | Functions created under each actual migration owner are inaccessible until deliberately granted; published APIs and triggers still work. Current anonymous definer execution is zero. |
| RLS-10 | P1 / Branch-local commands verified; integration and wider coverage open | Backend | Candidate 20261009003246 guards 23 canonical implementations, with 68 SQL checks and this branch's latest-definition inventory. Main has since added serialized drawing-set link/unlink bodies and a replacement RPC; rebase the guards onto those bodies and include the new RPC. Preserve main's split wrapper and release helpers. | Regenerate reviewed candidate hashes after reconciliation; exercise real wrapper split inheritance and archived replacement denial, multi-connection archive/link/release races, full release/model/erasure and wider direct-write/pay-app/GC-link coverage. See integration handoff and supabase/tests/flags-sequences/README.md. |
| DB-7 | P3 / Open hardening | Backend | Anonymous invoker/trigger EXECUTE residue, storage initplan review and `pg_net` public placement need least-privilege disposition. Advisor warnings are not exploit counts. | Reviewed grants/namespace plan, safe positive controls and denied unwanted entrypoints; document accepted exceptions. |
| DB-8 | P2 / Partial | Backend + realtime | Seventeen live publication tables inventoried; reproducible publication ownership and session-revocation behavior not fully proven. | Replay produces the intended publication; two-user sockets and AAL1/AAL2 tests verify subscribe/change/delete payloads and role-removal behavior without foreign data. |
| DB-9 | P1 / Ready; provider release open | Backend + integrations | Candidate 20261008201945 moves credentials into service-only private storage and restricts mailbox administration. New handlers resolve independently verified provider/account/project/workspace bindings. No historical mailbox is automatically trusted. | Review shared/OAuth consumers and exact provider scopes; apply SQL before coordinated handler/client release. Verify REST/RPC/export denial and provider delivery; assess rotation of previously exposed tokens. |
| DB-10; M21 | P2 / Open audit/retention | Backend + privacy | No org-member role/removal audit trigger; only admin client-event prune routine found and no retention pg_cron job. Add server-stamped immutable membership events and an approved retention/legal-hold schedule. | Actor/org/old-new role/outcome preserved, cross-org reads denied, scheduled retention proven on fixtures with holds and required signoff/erasure evidence retained. External schedulers unknown. |
| DB-11 | P1 / Open recovery assurance | Backend + release | Schema/ACL/ownership drift persists; version presence is not exact SQL equivalence. At the original live check, `20260921080604` was present despite stale manifest prose and nine later candidates were absent. October 8 adds the pending atomic Stripe candidate. Historical 171/219 function counts are not current measurements. | Coordinated sibling-aware rebuild plus live catalog comparison of definitions, policies, grants, triggers and publications; exact payload/hash ledger evidence. Never use bulk push, migration repair or permissive manifest overrides. |
| SBSEC-07; submittal event provenance | P1 / Ready, SQL verified; undeployed | Backend | Candidate 20261008201944 derives project from the parent submittal and actor from auth.uid, requires current active-project PM authority and revokes direct protected event writes. Legitimate transmit/response/attachment callers are covered. | Stage exact deployed callers and parent/actor/role negatives. Arbitrary event text is not independent proof that a business transition occurred. |

### Edge Functions, providers and billing

| ID | Priority / status | Owner | Finding and remediation | Closure evidence required |
|---|---|---|---|---|
| EDGE-2 residual | P2 / Ready, source + SQL; undeployed | Edge | Private operation scopes separate caller LLM accounting from trusted inbound classification. Caller useCase labels no longer select trusted classifier counters. | Apply quota candidate and stage caller-label pollution, authorization and configured quota acceptance. |
| EDGE-6 | P1 / Ready, source verified; undeployed | Identity + backend | Workspace mode now preserves every Auth identity, including caller and zero-membership users; `users_deleted: 0`. Only explicit account mode deletes `callerId`. Actual-handler regression covers a join during file cleanup, later self-deletion and mode-correct failure guidance. [Evidence](docs/audits/SECURITY_REMEDIATION_2026-10-08.md). | Stage exact handler with existing erasure prerequisites; verify owner/journal/file failure behavior and preserved logins in all workspaces. No new SQL for this fix. Fresh proof remains AUTH-8; deleted-workspace file recovery still requires support or explicit self-account deletion. |
| EDGE-7 | P2 / Ready, source verified | Edge | Account deletion now reflects only exact configured browser origins; ingestion grants no browser CORS. Request-scoped wrapping preserves allowed-origin headers on successes and failures. | Stage allowed/denied/missing-origin and preflight behavior. CORS does not replace bearer/shared-header authorization. |
| EDGE-8 | P2 / Ready source; desktop removal open | Release + backend | legacy-app-files-copy is now an inert 410 entrypoint and deprecated manifest slug. Discontinued desktop read/handoff are also inert/deprecated; tests reject their hosted presence. Historical maintenance implementation is not packaged. | Verify retired slugs absent after reviewed release; desktop slugs were present in the October 8 snapshot. Do not reinterpret source retirement as hosted deletion. |
| EDGE-9 | P1 / Ready, SQL + handler verified; undeployed | Edge + backend | Candidate 20261008235532 uses private atomic reservations, rolling limits, durable operation keys and content fingerprints. Ambiguous provider completion retains charges and cannot automatically redispatch. Client retries retain keys. LLM caps default to disabled. | Set reviewed nonzero limits, apply/stamp SQL before coordinated clients/handlers, test real concurrent connections/provider reconciliation and retention scheduling. No exactly-once external delivery claim. |
| EDGE-10 | P2 / Partial, source improved | Edge | Mail/LLM/classifier and ledger fetches now have bounded response/body deadlines. Stable operation reservations prevent blind resend after unknown completion. Other provider/checkout idempotency and hosted reconciliation remain separate acceptance. | Exercise real provider timeout/lost response and retry; verify no duplicate sends or understated spend. Conservative LLM reservation is not a provider-wide spending cap. |
| EDGE-11 | P2 / Ready, source; mode unverified | Edge | Untrusted inbound flag mode skips paid AI classification and attachment publication; reject mode remains denied. Mailbox trust comes from verified bindings rather than editable addresses. | Record effective mode/trusted-domain/provider configuration and stage synthetic trusted/rejected/flagged messages without publishing active attachments. |
| EDGE-13 | P2 / Ready for active owned entrypoints | Edge | Incoming streaming bodies are bounded before materialization across mail, LLM, billing, export and account deletion. Oversized, false/absent Content-Length and stalled work have boundary tests. Retired desktop endpoints do not parse bodies. | Stage valid size limits and chunked oversize requests through actual gateways. Source limits cannot prove upstream edge infrastructure behavior. |
| EDGE-14 | P2 / Ready for reviewed handlers; hosted acceptance open | Edge + observability | Unexpected provider/database/body failures return stable public errors without raw payloads. Actionable safe errors remain; Edge reporting emits generated correlation IDs with allowlisted metadata. | Verify injected markers remain absent through hosted gateway responses/logs and that monitoring correlation reaches operators. |
| EDGE-15 | P2 / Ready, source; monitor acceptance open | Edge + operations | Health accepts only intended methods; cheap liveness does no database work, readiness has a three-second deadline, in-flight coalescing and short per-isolate cache. Errors return safe 503 and responses are no-store. | Verify monitor uses readiness where needed, alert delivery and fleet-level throttling. Per-isolate coalescing is not a global rate limit. |
| EDGE-16 residual | P2 / Partial; imports/logging corrected | Edge + privacy | Owned Edge imports are exact-version/frozen-lock checked. Sender/reference/payload logs and raw failure text are removed from reviewed handlers; discontinued command-center code is inert. Sender/reply-field robustness and provider acceptance remain. | Verify actual deployed dependency artifacts, provider field contracts and historical/platform logging retention. JSON header fields are not a proven SMTP injection. |
| SBSEC-04; mailbox authority | P1 / Ready; provider-dependent acceptance open | Integrations + backend | Verified bindings lock exact mailbox, provider generation, organization and project to independently reviewed authority. Changed/revoked/unverified/inactive mailboxes fail before provider work; ordinary project metadata cannot grant send rights. | Operator verifies provider consent/scopes and binds each intended mailbox; set matching connection IDs and stage delivery/denial. Zero automatic trusted bindings are created. |
| SBSEC-05; Stripe write acknowledgement | P1 / SQL payload present; integrated handler release open | Billing + backend | Returned lookup/RPC errors fail for retry. `20261008071019` atomically updates one organization, revision and event receipt; marker failure rolls back. October 9 ledger refresh confirms its exact production payload. Exact 23505 receipt verification replaces message matching. | Preserve main's newer durable checkout while integrating the handler; verify deployed signed retries, concurrent connections and constraints. Ledger evidence alone is not handler acceptance. Historical falsely acknowledged receipts require deliberate reconciliation, not bulk deletion. |
| SBSEC-06; Stripe event ordering | P1 / SQL payload present; integrated handler release open | Billing | Both event types retrieve fresh provider state after a revision snapshot and use configured-price/status entitlement rules. Canceled/unknown states cannot grant paid; stale workers retry; old subscription events cannot replace a newer binding. Strictly newer checkout remains supported, ambiguous same-second order fails. | Integrate main's durable checkout reservation and tests, then stage checkout-after-cancel, concurrent old/new delivery, customer mismatch, unknown price/status and legitimate upgrade. Preserve past_due grace and signature validation. Current provider behavior is not proven by applied SQL. |

### Browser content, exports and mobile

| ID | Priority / status | Owner | Finding and remediation | Closure evidence required |
|---|---|---|---|---|
| SEC-1 | P2 / Ready, source verified | Client | Active RFI/agenda/fab/action/status/risk CSV exporters share formula-safe serialization and preserve real numbers. Real exporter tests cover formula prefixes and CSV escaping. | Confirm representative exports in supported spreadsheet software; local tests do not execute spreadsheet formulas. |
| SEC-2 | P2 / Ready, source verified | Client + files | Daily Logs and Punchlist now render photos through scoped trusted signing, rejecting unsupported URLs and failed signing without raw fallback. | Stage actual private file delivery and identity switching; short-lived bearer links remain usable until server expiry. |
| SEC-3 | P2 / Ready, browser verified locally | Client | Email HTML is rebuilt through an inert element/attribute allowlist, restrictive in-frame CSP and remote-image opt-in per message. Attachment labels are inert text. Local browser checks observed no default external requests. | Verify intended production email rendering and delivered parent/frame policies. No claim that prior behavior was demonstrated script execution. |
| SEC-4; EDGE-12 | P2 / Partial; source admission ready | Files + Edge | Server attachment admission rejects active HTML/SVG/XML and mismatched signatures, derives passive MIME and supplies attachment disposition. Office formats retain valid octet-stream admission. | Inspect deployed bucket policies, actual delivery headers and historical objects; preserve normal construction documents. No claim of a malware scanner or hosted header enforcement. |
| SEC-5 | P2 / Ready, source verified | Client + files | IFC output is capped at 128 MiB with a 30-second deadline; selection/persistence share the limit. Signed links expire in five minutes; mounted cache reauthorizes before expiry and on owner changes. | Stage large legitimate models, cancellation and signed-link expiry/revocation. Previously issued links may retain their former expiry and downloaded bytes cannot be recalled. |
| WEB-1 | P2 / Ready, source verified | Client | Service worker admits only successful same-origin HTML app shells with expected root/script markers. Error, challenge, binary and redirect responses cannot replace the fallback shell. | Exercise actual host online/offline/update behavior and old-cache upgrade; worker never caches cross-origin tenant APIs. |
| WEB-2 | P2 / Partial; source and real IFC load verified | Client | IFC wasm is emitted with a content hash and initialized through the installed loader handler; obsolete unversioned wasm cache entries are not reused. Real local IFC4 geometry loaded successfully. | Run two deployed builds with populated old cache to prove loader/wasm upgrade compatibility. |
| WEB-3 | P3 / Ready, source verified | Client | Firefox stale-chunk errors now enter the existing one-shot reload recovery; retry guard is preserved. | Verify browser-native stale-asset recovery after a real two-build upgrade. |
| WEB-4 | P1 / Ready policy; hosted compatibility open | Client + release | Prepared enforcing CSP now includes the exact owned Supabase signed-file iframe origin. Email frames add a separate default-deny policy. Current hosted enforcing state remains unverified. | Stage drawing/file fallback, email and native flows, then verify exact deployed enforcing response headers. |
| WEB-5 | P3 / Partial, availability | Client + release | Historical delivery-header/cache observations require host-specific review; existing HSTS/DENY/nosniff/referrer/permissions controls verified. Do not classify optional preload/COOP as automatic vulnerabilities. | Correct HTML revalidation/assets caching and preview indexing/privacy behavior tested on actual hosting without breaking integrations. |
| MOB-1 | P2 / Unverified target | Mobile | Android target absent from reviewed tree; no Play Console/store-state conclusion. Establish target-specific acceptance if Android is shipped. | Signed artifact, auth/files/offline/privacy tests and release ownership for that target. |
| MOB-2–MOB-10 | P2 / Partial, source | Mobile + release | iOS project/plugins, native exports, privacy manifest, version tags, native pricing gate and key plist/config fixes now exist. Universal Links provisioning, compiled-device behavior, late transfer identity guards and privacy/store metadata remain unverified. | Signed iPhone/iPad build checks camera/share/reset/background/offline/session cleanup, SDK privacy aggregation and store disclosures. Individual MOB-2 through MOB-10 dispositions are in the audit; do not repeat the old “no iOS/plugin call sites” claim. |

### Release, recovery, privacy and assurance

| ID | Priority / status | Owner | Finding and remediation | Closure evidence required |
|---|---|---|---|---|
| CI-2 | P1 / Source ready; live settings unverified | Release + security | Production/staging/preview jobs name separate environments. Preview uses a separate Worker config and staging backend with separate publishing secret names. Source no longer targets the production preview Worker. | Move credentials into correctly restricted environments/accounts and verify branch/fork denial. YAML names cannot prove effective hosted secret isolation. |
| CI-3; B41-P1-005 | P1 / Partial, live | Repository admin | Main ruleset is active with PR requirement, no force/delete and one strict CI context; zero approving reviews. Another rule has empty include and concatenated context. Local deploy script guarded. Reconcile exact required check names, scope and review policy. | Effective main rules require intended checks/review; controlled failing PR cannot merge/publish; intended release path works. Old “blocked by repository plan” status is obsolete. |
| CI-5 | P2 / Partial; source verification gate ready | Release | Build metadata and bounded deployed revision/entry-asset/backend checks replace the HTTP-200-only probe. Wrong revision, missing entry and failed readiness fail checks; staging adds browser acceptance. | Run exact hosted artifacts and recorded rollback acceptance. Fetching a JS entry alone is not proof of browser boot. |
| CI-6; B41-P1-004 | P1 / Partial; fail-closed promotion source | QA + release | Production now depends on exact-revision staging auth/fabrication/piece acceptance. Tests consume releases, so reused fixed fixtures are invalid; freshness preflight and reviewed per-run attestation are required. | Provide fresh reviewed isolated fixtures for each revision/run/attempt, execute real hosted workflow and retain results plus teardown proof. Automatic full fixture provisioning is not implemented. |
| CI-7 | P2 / Source ready; audit currently blocks release | Release | All workflow actions use resolved immutable SHAs. Edge imports use exact versions and a frozen Deno lock. Dependency audit is required by web/preview/staging, reviewed backend and iOS release gates. | Verify hosted gates and credential settings. Complete dependency tree still has unpatched Braces tooling advisory; no waiver or forced major upgrade was introduced. |
| CI-9 | P1 / Partial; retirement blind spot fixed in source | Backend + release | Retired legacy-copy and discontinued desktop slugs are deprecated and fail inventory if present. Every new SQL candidate remains required/pending apply. Drift still does not compare every deployed body/policy/grant. | Exact ledger payload/catalog parity and sibling-aware recovery remain DB-11; no drift suppression or ledger repair is allowed. |
| CI-10 | P1 / Unverified publishers | Release + operations | Historical Netlify/Workers Builds publisher observations require current connection/hostname/credential inventory. No fresh external publisher settings read. | Only approved gated path can publish production hostnames; document or disable residual integrations and verify branch previews remain isolated. |
| OBS-1 | P1 / Unverified | Operations | Uptime and Sentry alert configuration/delivery not observed. Repo checklist gaps do not prove monitoring absent. | Controlled liveness/error signal reaches the responsible recipient with documented triage/escalation; record monitor coverage and drill date. |
| OBS-2 | P2 / Ready source controls; hosted privacy open | Client + Edge + privacy | Browser events/spans are sanitized; Replay, automatic session attribution and INP collection are disabled. Edge reporting rebuilds metadata-only events with bounded reporting time. Actual SDK envelope review exposed separate transport channels and tests now cover them. | Verify final emitted envelopes contain no synthetic markers, useful release/correlation remains, and deployed/platform logs, prior recordings and retention are reviewed. Local redaction cannot erase historical telemetry. |
| DR-1 | P1 / Unverified | Operations + backend | Current PITR/database backup settings and full isolated restore not verified. Code migration replay is not recovery proof. | Record approved RPO/RTO, restore database plus files into isolated target, validate permissions/attachments and measure recovery; document rollback and cleanup. |
| DR-2; B41-P1-006 | P1 / Partial, live run | Operations | Scheduled Storage backup run `37645251418` succeeded with nonexpired manifest artifact; activation gap closed. Full contents/retention/restore and other bucket ownership remain unverified. | Correlate database recovery point and file manifests, restore sampled and complete required scope, verify alerting/retention and explicitly assign retired/shared bucket ownership. |
| DR-3 | P2 / Open capacity/restore evidence | Operations | Runner's 9 GB cap can halt future backups. The current runbook describes native B2 versions and per-bucket restoreAt correctly; capacity planning and demonstrated recovery remain. | Capacity forecast/threshold alerts and proven retention/restore under overwrite/delete without weakening history preservation. |
| SBSEC-10; backup ref guard | P1 / Source ready; environment unverified | Release + operations | Workflow permits only main + schedule/manual dispatch; runner rejects other Actions contexts before credentials or remote work. Ten real-process guard cases and the surrounding backup checks pass. Runbook explains independent environment policy. [Evidence](docs/audits/SECURITY_REMEDIATION_2026-10-08.md). | Verify effective main-only environment policy and environment-only credential placement, then non-main denial and scheduled/main success. A branch can edit source guards; this code alone does not prove credentials are isolated. No hosted settings or backup run changed. |
| DEP-1 | P2 / Open tooling advisory | Client + release | Fresh npm audit: production 0; complete tree 5 high entries from Braces/tooling chain. Older blanket “cleared” statement superseded. | Reviewed compatible remediation, full audit evidence and affected build/tests; no forced broad major upgrades. [Dependency report](docs/audits/DEPENDENCY_TOOLCHAIN_2026-10-07.md). |
| COMP-1 | P2 / Partial | Privacy + product + operations | Processor list corrected but legal pages remain DRAFT; actual retention/regions/agreements/export-erasure coverage unverified. AUTH-9/DB-10 cover evidence and retention mechanics. | Review actual deployed processing/disclosures, agreements and rights workflows; save bounded evidence without claiming certification from drafted pages. |
| HYG-1 | P2 / Open classification | Repository admin + privacy | Tracked snapshots/workbooks need authorized data classification. Filenames alone do not prove customer leakage. | Review contents/access/history, remove unnecessary artifacts appropriately, scan safely and document any exposure response; no unapproved history rewrite. |
| TEST-2 | P1 / Partial assurance; branch CI verified | QA + security + backend | October 9 `ba781739` CI passes 8,448 tests / 850 files, all 76 foundation browser cases, lint/type/no-new-JS gates, required SQL packages, build/budgets, secret scan, 11 Edge typechecks and commercial PostgreSQL acceptance. Dependency and production-drift gates remain failed; publishers skipped. [Exact evidence and integration limits](docs/audits/SECURITY_COMPLETION_2026-10-09.md). Prior October 8 results remain historical. | Reconcile current main, then rerun the combined tree and traced direct-API matrix across two tenants, revoked users, archives, MFA, files, Realtime, billing/quota concurrency and native/offline behavior. Branch CI and ledger payloads cannot establish hosted acceptance or close unrelated findings. |

### Fabrication/erection configuration security requirements

| ID | Priority / status | Owner | Required design | Closure evidence required before launch |
|---|---|---|---|---|
| SBSEC-08; company capabilities | P1 / Design | Product + backend + client | Support fabrication-and-erection and erection-only companies through explicit server-owned capabilities. Existing UI module flags are display gates. Define who may configure modules, retained data/export access, role permissions and dependencies. | Erection-only accounts cannot invoke disabled fab actions through REST/RPC/Edge/deep links/imports/offline jobs; approved mode changes are audited and preserve data; mixed-mode and intended shared modules work. Hiding navigation does not prove enforcement. |
| SBSEC-09; supplier collaboration | P1 / Design | Product + backend | An erection-only customer may receive another fabricator's drawings/status. Use explicit project/package sharing with minimal fields, revocation and audit; do not expand org-wide access implicitly. | Fabricator, erector and third-company fixtures prove only deliberately shared records/files/actions are accessible; revoked collaboration blocks future requests and offline replay; signed-link lifetime is documented. |

### Verified controls and disposition of older IDs

- **Live verified:** AUTH-1, AUTH-3, RLS-1 and RLS-8 owner/invitation/audit/immutable-membership protections; all 143 public tables have RLS, all four buckets private, invoker view configured, all 227 definers pin search path and none grant anon EXECUTE. These are bounded controls, not proof of every table policy or function body. B41-P1-001 remains closed; direct number-sequence writes and PMA audit INSERT are closed live.
- **Source verified, exact deployed revision separate:** EDGE-1 token bounds, EDGE-3 export actor, EDGE-4 Stripe signature/config failure behavior, EDGE-16 token redaction/prototype-key checks; CI-1 publisher secret/drift gates, CI-4 real no-new-JS base check, CI-8 released-Edge typecheck and DR-4 Cloudflare rollback documentation. Do not reopen these as absent because adjacent findings remain.
- **Historical-only or consolidated:** EDGE-12 maps to SEC-4; AUTH-11 server defect to SBSEC-01 and cache acceptance above; AUTH-10 is functional invite-onboarding debt, not a newly demonstrated security defect. DB-1 through DB-6 are schema/data/replay items in the September report; this pass does not re-certify their functional status. Security implications of relational consistency and replay remain DB-11/TEST-2. HYG-2 documentation drift is addressed here only for security assertions; unrelated product/performance items remain below.
- **Production acceptance still required:** nine candidates were absent in the original live audit; atomic billing and this continuation add further required candidates, including desktop RPC retirement. The complete current candidate list/hash inventory is in the October 9 completion package. Exact Edge/browser artifact parity remains unverified, and the original audit found MFA hooks absent and CSP Report-Only. No hosted state was changed by this follow-up, and no item is closed merely by this documentation update.

### Execution and closure order

1. Complete staged acceptance and coordinated release of prepared membership, email authorization, MFA, erasure, identity-preservation and recovery corrections. Include atomic billing SQL before its handler and verify the backup environment policy. Preserve the manual SQL/payload protocol and shared-database ownership.
2. Stage and release the prepared credential isolation, project-file policies, mailbox bindings, atomic quotas, creation caps and submittal provenance corrections. Reconcile existing files and mailbox authority before cutover; preserve the exact SQL/handler/client dependency order. Finish the remaining recent-authentication policy and immutable acceptance/membership evidence separately.
3. Validate the prepared identity/recovery/async client boundaries and CSP on direct APIs and shared devices. Complete hosted desktop retirement and review existing session revocation. Implement capability-mode authorization alongside the product feature.
4. Bind release checks/credentials, obtain effective Auth/monitoring settings and execute a database-plus-files restore. Finish P2 content, supply-chain, retention and mobile acceptance in parallel where independent.

For closure, append implementation SHA, exact migration/artifact identifier, test fixture/results, live acceptance date and remaining limitation to the canonical row or its linked evidence. Assign a named owner before scheduling. No recurring automation or production change is implied by this register.

---


## Phase 0 closure status (historical snapshot)

> Current security priorities and deployment status are in the register above. The following describes the earlier Phase 0 checks, not a current production-security verdict.

The Phase 0 release-candidate baseline is reconciled through Batch 40 on
`agent/handoff-cleanup`. The local closure gates passed without a production
deployment or migration application. Remaining items below are intentionally
classified instead of hidden behind a green local report:

- **P0 release blockers:** none found in the local source, test, lint, typecheck,
  build, dependency-audit, or date/timezone checks.
- **P1 required before production:** owner verification of staging database
  state and migrations, Edge Function deployment/configuration, staging smoke
  coverage, and required CI/branch-protection enforcement.
- **P2 recommended stabilization:** nonblocking Playwright fixture coverage,
  large-bundle follow-up, CSP enforcement review, and incremental date/type/
  dependency hygiene.
- **P3 post-release improvement:** historical handoff-document cleanup and
  reduction of static-analysis false positives after the active workflows are
  stable.

`command_ui` is retired as a runtime presentation flag. The typed catalog and
Supabase `feature_flags` table document only the remaining operational flags;
See [`docs/PHASE_0_FINAL.md`](docs/PHASE_0_FINAL.md), which contains the
consolidated feature-flag and dead-path disposition record.

## Batch 41 P1 finding status

The original Batch 40/41 observations are reconciled against the October 7 audit:

- **B41-P1-001 — legacy flat Storage isolation:** **resolved live**, independently rechecked in this audit. UUID org-prefix/current-member policies exclude legacy `uploads/` paths. The retained historical objects are rollback material, not a reopened access path. See the closure evidence below; RLS-5 is a separate project-scope issue.
- **B41-P1-002 — database/migration alignment:** **release acceptance open**. Nine reviewed candidate versions are absent from the live ledger; `20260921080604` is present. Current migration ownership/payload evidence, not historical local CLI availability, controls this status. See SBSEC-01, AUTH-2, EDGE-5 and DB-11.
- **B41-P1-003 — Edge deployment/configuration:** **unverified exact parity**. Nine production entrypoints are in scope. Source review does not prove hosted revisions, provider permissions, caps or kill-switch settings. See SBSEC-02 and the Edge register.
- **B41-P1-004 — staging acceptance:** **partial**. Persistent isolated staging exists; critical mutation/security acceptance needs recorded fixtures, results and artifact IDs. The old claim that no staging environment exists is obsolete. See CI-6/TEST-2.
- **B41-P1-005 — branch protection:** **partial, live protection confirmed**. Main has an active PR/strict-CI ruleset; exact checks/review/environment policy still need reconciliation. This is no longer blocked by the previously reported repository-plan error. See CI-2/CI-3.
- **B41-P1-006 — backup/recovery:** **partial**. Scheduled Storage run `37645251418` and its manifest artifact succeeded. Complete database-plus-files recovery, measured RPO/RTO and current PITR/retention remain unverified. Cloudflare is the active host. See DR-1/2/3 and SBSEC-10.

~~The local Node 24 versus CI Node 20 difference remains a P2 environment
deviation.~~ **Closed 2026-09-22** — every job in `.github/workflows/ci.yml`
pins `node-version: "24"`, matching local. (`storage-backup.yml` runs Node 22;
it builds nothing.) The P1 findings remain visible in the release checklist and
are not counted as resolved by documentation alone.

## Storage isolation — B41-P1-001 closure

**Status: resolved in production 2026-07-21. Verified against the live database
2026-09-19.**

B41-P1-001 was carried as open for roughly two months after it was fixed. The
remediation ran on 2026-07-20/21 and is recorded in
[`docs/app-files-tenant-isolation-plan.md`](docs/app-files-tenant-isolation-plan.md),
but neither the Batch 41 entry, the Batch 42 acceptance, nor
[`docs/audits/WORKFLOW_AUDIT_2026-07-26.md`](docs/audits/WORKFLOW_AUDIT_2026-07-26.md)
(item 1, written five days *after* the cutover) was updated. The audit and the
runbook then said opposite things about the same finding, which is why it kept
being re-raised.

Live evidence, re-verified 2026-09-19 against project `kjrwqagyeswwoxpjkcko`:

| Check | Result |
|---|---|
| `auth_read` policy on `storage.objects` | Requires path segment 1 to be a UUID **and** `user_is_org_member()`. The `uploads/` grandfather branch is gone. |
| `auth_upload` policy | Same UUID + org-member predicate. |
| Migrations `20260721030200`, `20260721031557`, `20260721031606` | All three present in `supabase_migrations.schema_migrations`. |
| `private.maintenance_jobs` completion marker | `completed_at` 2026-07-21, `grandfather_policy_closed: true`, `legacy_database_references: 0`, 706 ETag + 69 SHA-256 verified, `verification_failed: 0`. |
| `app-files` bucket | `public = false`. |
| Object census | 775 legacy flat, 1,597 org-scoped, 0 other prefixes. |

The 775 flat `uploads/...` objects are **still present and that is correct** —
they are retained rollback material (`originals_deleted: 0`). They are
unreachable: `storage.foldername(name)[1]` is `'uploads'`, which fails the UUID
regex, so `auth_read` denies them to every authenticated session.

Do not re-raise B41-P1-001 without first re-running the checks above. If a
future audit reports it open from a source-only search, that search cannot see
remote policy state and is not evidence.

### Resolved: `sheets-files` decommissioned (2026-09-19)

Distinct from B41-P1-001, **not** covered by the cutover above, and newer than
every audit that discusses Storage isolation. Found 2026-09-19.

- Bucket created 2026-09-01 with `public = true`, declared deliberately in
  [`supabase/config.toml`](supabase/config.toml) and
  [`supabase/README.md`](supabase/README.md) as "the only public bucket".
- Holds **435 PDFs / 730 MB** of drawing content across 7 prefixes.
- **No RLS policies exist on it at all.** Reads are unauthenticated by URL,
  with no expiry and no revocation path short of moving the object.
- Paths are `job_<nanoid>/files/<uuid>.pdf` — **neither org- nor
  project-scoped**. This is structurally the same flat, tenant-blind namespace
  that B41-P1-001 was about, reintroduced in a new bucket.
- Nothing under `src/` references this bucket, and neither does the 2026 app —
  both use `app-files` with signed URLs. The writer is the **`sheets-api` Edge
  Function**, a passcode-gated gateway for a separate prototype ("SteelBuild
  Sheets") that keeps its whole state in the single `sheets_doc` row. That
  function uploads with the service role and returns only a `relativePath`, and
  it has **no read route at all** — which is why the bucket had to be public
  for the prototype's client to display anything.

Enumeration is blocked (no anonymous list policy, UUID filenames), so each URL
behaves as an unexpiring capability token rather than an open directory. The
exposure is that any leaked URL — forwarded mail, browser history, referrer
header, proxy log — grants permanent unauthenticated access to that sheet.

**Resolved the same day by removing the app, not by re-architecting it.** The
owner confirmed the Sheets app was a prototype that had been abandoned (last
write 2026-09-05), so none of the three hardening options was worth building.

Done:

- `storage.buckets.public` set to **false** for `sheets-files`. With no RLS
  policies on the bucket, only the service role can now reach those objects.
  This is what closed the exposure, and it is reversible.
- `sheets-files` removed from the backup contract — `REQUIRED_BUCKETS`
  (`scripts/lib/storageBackup.mjs`) and the arity guard in
  `scripts/lib/b2Backup.mjs`, which hard-required all three buckets and would
  have failed the nightly job the moment the bucket was deleted — plus
  `supabase/config.toml`, `supabase/README.md` and the backup runbook.
- A current snapshot of `sheets_doc` (rev 220, 132 kB) was written to
  `sheets_doc_backup` first. The pre-existing backup row there was rev 33 from
  2026-09-02, i.e. 187 revisions stale — do not treat that table as a live
  safety net.

Still owed, and needs the Supabase dashboard or CLI (no MCP tool deletes
storage objects, buckets or Edge Functions). Re-checked against live production
2026-09-22:

- ~~Delete the `sheets-api` Edge Function.~~ **Done.** The owner confirmed the
  retirement on 2026-09-21 and the live function inventory no longer lists it.
  Its manifest entry is now `lifecycle: deprecated`, so absence passes the drift
  gate and any reappearance fails it — see
  `docs/runbooks/supabase-production-ownership.md#sheets-api-retirement`.
  Removing the stale `required` entry is what unblocked #462.
- **Still owed:** delete the 435 objects and the `sheets-files` bucket.
- **Still owed:** drop `sheets_doc`, `sheets_config`, `sheets_doc_backup` — all
  three are still live (1, 1 and 2 rows respectively on 2026-09-22).

The ordering note below is now historical: `sheets-api`'s `DELETE /file` route
was the tidy way to remove the objects and it authenticated against the passcode
in `sheets_config`, but the function is deleted, so the bucket must be emptied
from the Supabase dashboard or the Storage API instead. Dropping the three
tables is now unblocked — nothing reads them. The last B2 backup covering these
files ran 2026-09-18 and is the recovery window.

## Active items

> Historical Tier 1 and July status notes described the source at those dates. Current security work includes both implementation gaps and operational verification; it is not limited to owner settings. RLS being enabled does not prove every role/tenant boundary. See the current register above. Historical context remains in [the Tier 1 runbook](docs/runbooks/tier1-enterprise-status.md) and [PR hygiene guidance](.claude/agent-memory/construction-pm-dev/pr-supersede-hygiene.md).

### Production-readiness audit (2026-09-21) — historical cross-reference

The [September report](docs/audits/PRODUCTION_READINESS_AUDIT_2026-09-21.md) was taken at `ada5426` and reconciled against `main@7227d32`. Its counts, P0/P1 labels, source paths and remote settings are dated observations, not a current aggregate vulnerability count. The October security register above supersedes its security disposition and keeps the same IDs.

Do not re-open verified owner/invite/RPC controls, direct number-counter writes, PMA audit INSERT, retired endpoints or corrected source MFA/cache/iOS mechanisms from old descriptions. Do not mark prepared membership/MFA/erasure fixes deployed: the current audit records the remaining live gaps. Branch protection and scheduled Storage backup activation are now positively evidenced; PITR, alerts, publisher settings, complete restore and store artifacts still require current operational proof.

Non-security functional/performance work from that report remains independently tracked: DATA-1/4/5, LOGIC-2/3/4/5/6/12, and PERF-1 through PERF-10 need their own current-source reconciliation. Historical closure of DATA-2/DATA-3 (PR #480), LOGIC-1 (PR #477) and PERF-11 is not reversed by this security documentation. AUTH-10 is functional invite onboarding; DB-1 through DB-6 retain historical schema/data follow-ups without a new closure claim here.

Mobile source now includes an iOS project, native plugin calls, exports, privacy manifest and release tags. MOB-1 still has no Android target in the reviewed tree; compiled-device/store acceptance is unverified. See the individual MOB-1 through MOB-10 crosswalk in the [current audit](docs/audits/SECURITY_AUDIT_REGISTER_2026-10-07.md) and [submission runbook](docs/app-store/SUBMISSION.md).

The retired `legacy-app-files-copy` function now uses `deprecated`, with an inert 410 index and a negative drift test. The owner-discontinued desktop endpoints have the same source retirement guard; their hosted removal remains pending. Exact deployed definition/payload comparison remains EDGE-8/CI-9/DB-11.

### Detailing Control Center — audit remainder (2026-09-07)

From the `/DrawingSubmittalHub` truthfulness audit. Twelve findings were fixed in
`0d88e7b7`, `e40711b8`, `3e0320de`, `df1d885e` (see the ARCHITECTURE.md decision
log). These are what is left.

- **Decide which drawing register ships.** `DrawingRegisterPanel` declares ten
  props and forwards two — its own comment says *"Props retained for hub
  call-site compatibility"*. Because `onRevisionUploaded` / `onOpenSummary` are
  the only producers of `summaryCard`, the entire Revision Summary feature is
  unreachable **app-wide**: `RevisionSummaryCard`, the AI deep-dive modal, and
  `openRfiFromSummary → createRfiAndLink` can never render.
  `drawing_revision_summaries` holds 2 rows and has stopped accumulating.
  `drawingRegisterTable.tsx` (494 lines) and `drawingRegister.derive.ts` (+155
  lines of passing tests) are imported only by their own test files, and a
  `revision-summaries` query is fetched on every project load with zero
  consumers. **Either** delete the dead register, the eight dead props,
  `handleRevisionUploaded`, `currentRevByDrawingId` and that query, **or** add a
  revision-upload affordance to `DrawingRegisterGridPanel` and forward the two
  callbacks. This is a product call, not a bug fix.

- **Register "RFIs" / "WPs" columns read a link model nothing writes.**
  `drawing_register_view` counts via `drawing_links` subqueries, but the app
  links RFIs through `drawings.linked_rfi_ids` (CSV of numbers) and work packages
  through `work_packages.linked_drawing_ids`. Live: `drawing_links` has **0
  rows** while **74 work packages** carry `linked_drawing_ids`, so every one of
  those sheets renders a muted "0". Needs a **production view migration** to
  union the two models — the schema already does the same
  `unnest(string_to_array(...))` join in two other places — or the columns should
  be dropped rather than render a zero that means "not tracked here".

- **Lower-severity remainder (§15–§29 of the audit).** Verified but unfixed:
  tab badge counts sets while the tab lists sheets; the hero chip reads "No
  overdue sets" while overdue *unlinked submittals* exist; two tiles both labelled
  "Needs Action" with different denominators; KPI strip renders definitive zeros
  while still loading; "Detailing %" can never reach 100 (denominator includes two
  post-fab erection states); R&R ranks above BFA in `DETAILING_STATE_ORDER` so a
  rejected package clears the "Not approved" milestone; `revisionImpacted` /
  `fullySuperseded` are structurally dead (`buildSetPackages` strips superseded
  sheets before readiness sees them); working-day due chips use the calendar "d"
  suffix; the register table is unvirtualized with an O(sets×rows) scan per
  keystroke; the four inline write controls have no `can()` gate (RLS still
  blocks, but viewers get enabled controls); matrix rows expand on mouse only;
  vivid `--cmd-*` fill hues used as 9px text fail contrast on the light skin;
  Radix Dialog is imported in two files (CLAUDE.md forbids it — the shared
  `ui/dialog` primitive has 17 importers, so this is a repo-wide decision); and
  "Run AI deep-dive →" renders unconditionally while its handler is flag-gated.

### Scheduling module — audit remainder, Batch 5 (2026-09-15)

From `docs/audits/SCHEDULE_MODULE_AUDIT_2026-09-08.md` §8. Batches 1–4 are
merged — Batch 1 `#311`, Batch 2 `#316`, Batch 3 `#319`, Batch 4 `#322` (the
audit itself is `#308`); §8 items 19–26 are what is left.
Verified against `origin/main@d6d2d79b` on 2026-09-15 — the audit's own wording
is a week old and some of it has already moved.

**Before starting any of this, re-measure.** The audit's census was 427
`schedule_tasks` rows. The table now holds **28 rows across 4 projects, all
created on or after 2026-09-08** — it was repopulated during the week's drift
repair, so every row-count in the audit is stale and none of the "N production
rows" evidence can be quoted as current.

- **Re-importing a schedule duplicates it (§5.1, item 19).** The only item here
  that corrupts data. `commitImportedScheduleTasks`
  (`src/pages/schedule/commitImportedTasks.ts`) calls `ScheduleTask.create` for
  every parsed row unconditionally; its `existingTasks` argument feeds only the
  running WBS snapshot, never a match. Import the same MPP/CSV twice and the
  project carries two of everything, with the second copy's `uid → id` map
  silently rewiring the dependency links. This is the same shape as the model
  roster importer already called out in CLAUDE.md (fixed `0d88e7b7`). Needs
  match-on-`uid`/`wbs_code`, update-instead-of-insert, and a preview showing
  create/update/skip counts.

- **CSV import can bind a baseline date as the live date (§5.2, item 20).**
  `COLUMN_ALIASES` in `src/lib/importScheduleCsv.ts` lists `"baseline start"`
  among the `start_date` aliases and `"baseline finish"` among the finish
  aliases, and the binder takes the **first alias hit in column order** with no
  exact-match-first pass. A P6 export carrying both `Start` and `Baseline Start`
  binds whichever appears first. Needs exact-match binding before the alias
  fallback.

- **`buildTreeOrder` has no cycle guard (§2.8, item 25).** Still no `visited`
  set in `src/components/schedule/scheduleTree.js`. A parent cycle in
  `parent_task_id` hangs the render. `20260626041744_prevent_schedule_task_cycle.sql`
  guards the database, so this is defence-in-depth against imported or
  hand-edited data, not a live hang.

- **URL state is half-wired (§3.3, item 23).** `?phase=` is read
  (`Schedule.tsx:38`, via `normalizeSchedulePhase`), but `?view=` is not, so the
  tab a user shares in a link is lost. `ViewTabs.tsx` still has no `role="tab"`
  or `aria-selected` — the tab strip is unreachable by keyboard semantics.

- **IA consolidation needs re-scoping before it is worth doing (§3.1/§3.2,
  items 21–22).** The audit asked for one SCHEDULE nav entry with Crew
  Scheduling as a Hub tab, but "Crew Scheduling" has since become
  `src/pages/ResourceScheduling.tsx`, so the finding's wording no longer matches
  the app. The standalone `src/pages/LookAheadSchedule.jsx` does still exist
  alongside the Schedule page's own lookahead view. Re-survey the nav before
  acting on the audit's text.

- **Dead-code sweep is partly moot (§6.2, item 24).** The delivery overlay is
  already gone; `expandedTask` and `void view` each survive in one file. Small,
  and worth folding into whichever batch-5 PR touches those files rather than
  doing alone.

- **Item 26 (regenerate `src/types/supabase.ts`) is done** — regenerated
  2026-09-14, the same day as the newest migration. It goes stale on every
  schema change, so re-check rather than assume.

### Historical production-function rebuild gap (2026-09-15)

> The following 219-of-351 inventory is a September snapshot. Current recovery ownership and catalog reconciliation remain DB-11; this audit did not recalculate that historical drift count.

Found while trying to capture the four functions the Supabase drift runbook names
as undocumented. The gap is far wider than four, and it includes the fab-release
gate — the P0 path.

**Captured, not guessed.** `supabase/_capture/production-public-functions-2026-09-15.sql`
now holds all 171 definitions verbatim, pulled through the Supabase MCP with
`pg_get_functiondef()` and verified byte-for-byte against md5s computed by the
database itself. It is a **reference dump, not a replayable migration** — ordered
by oid, never replayed against an empty Postgres. See `supabase/_capture/README.md`.

**The counts, verified rather than sampled:**

| | count |
|---|---|
| Live in `public`, extension-owned excluded | **351** (350 distinct names; `add_updated_at_trigger` is the one overload) |
| **Defined by no migration anywhere in the repo** (captured) | **171** |
| └ of those, `SECURITY DEFINER` | 86 |
| └ of those, wired to a live trigger | 65 |
| **Defined by a migration, but production's body differs from every repo version** (not captured) | **48** |
| Defined by a migration and production matches | 132 |
| Defined in a migration but missing from production | 0 |

So the repo reproduces **132 of 351** function bodies, not 180. Two revisions of
this entry were wrong before this one: "~86" came from a 140-function sample and
is really the `SECURITY DEFINER` subset; "171" counted only the functions no
migration *defines by name* and missed the 48 that a migration defines while
production runs something else.

**The 48 are the worse half.** A missing function announces itself; a drifted one
does not. They include the core RLS helpers — `user_has_project_access`,
`user_has_project_role_at_least`, `user_is_system_admin`, `user_is_org_admin`,
`user_org_role_at_least`, `get_my_project_role` — and the P0 fab-release path:
`enforce_fab_release_gate`, `evaluate_release_gate`,
`piece_control_drawing_is_approved`. Replaying the repo over production would
silently *revert* all 48. They are listed in
`supabase/_capture/DRIFTED-FUNCTIONS-2026-09-15.md`.

**Mostly they are the sibling app's.** `SteelBuild-Pro-2026` shares this
production Supabase project, so its migrations land in the same database and
Rev.2's history never records them. `20260914120000_adopt_production_soft_delete_project.sql`
says so outright — production ran the sibling's definition from *its* ledger entry
`20260909014620` — and is the worked example of clearing one: copy the sibling
file byte for byte, confirm the body md5 matches production, adopt. That migration
is why this count is 48 and not the 49 first measured. So the question behind most
of these is not "who edited production" but "which repo owns this function", which
CLAUDE.md records as still undecided.

**Measure this with line endings normalised.** Production stores some bodies with
CRLF and the repo's `* text=auto` rewrites the checked-in copy to LF, so a raw
md5 comparison reports drift where the SQL is identical. That is not theoretical:
it is why `work_packages_soft_delete_unassign_pieces` was recorded as diverged in
the ownership manifest for a day — the two bodies differ by exactly 55 CR bytes
and nothing else. Compare `md5(replace(prosrc, chr(13), ''))` against a
CR-stripped repo body. The same `* text=auto` rule silently corrupted the capture
file on its first commit, which is why `supabase/_capture/** -text` exists.

**A reset does not merely drift — it fails.** Two migrations `ALTER` a function
that no migration `CREATE`s:

- `20260911062832_pin_workflow_helper_search_paths.sql` → `submittal_derived_stage`
- `20260914020000_revoke_internal_helper_execute_from_authenticated.sql` → `erase_my_account`

**Why it matters.** These are not helpers. The list includes `create_rfi`,
`answer_rfi`, `close_rfi`, `void_rfi`, `create_submittal`, `create_change_order`,
`create_work_package`, `generate_pay_application`, `release_package_for_fabrication`,
`ops_snapshot`, and the whole fab-release gate chain. Production is fine; what
cannot be done today is rebuild a staging or preview environment that behaves
like it, or review a change to a function whose current text lives only in the
database.

**The gate's chain, as an example of the shape.** Each layer pulls in another
missing leaf:

```
evaluate_release_gate                 (missing)
  └─ work_package_drawing_set_reports (missing)
       └─ evaluate_fab_release_set    (missing)
            ├─ user_has_project_access    ✓ defined
            ├─ fab_release_blocking_rfis  ✓ defined
            └─ submittal_derived_stage (missing)
                 └─ submittal_bic_class (missing)
piece_control_drawing_is_approved     (missing)
  └─ evaluate_fab_release_set         (missing)
```

**Do not close this by hand-writing migrations from memory.** The bodies contain
Postgres regex word boundaries (`\m`, `\M` in `submittal_bic_class`), dollar-quoted
blocks and CRLF line endings (the piece-control `*_impl` functions), so
transcription risks a character-level error that produces a function which looks
correct and behaves differently. On the fab-release path that is the worst
possible failure mode. Promote from the capture file, which is byte-exact.

**What is left to do**, cheapest first:

1. **Promote in small batches** — leaf helpers with no dependencies first
   (`submittal_bic_class`, `risk_severity`, `risk_transition_allowed`,
   `submittal_derived_stage`), then their callers. Delete each promoted
   definition from the capture in the same PR, so the file always answers "what
   is still unreproducible". Promotion is what actually closes this item; the
   capture only makes it reviewable.
2. **Delete `_tmp_timeout_probe()`** — a live leftover diagnostic that sleeps 3
   seconds. It is in the capture because it is in production, not because it
   should be kept.
3. **Keep it current.** A scheduled re-capture (the MCP path needs no database
   password) would stop the repo from diverging silently again; the README
   carries the one query that detects divergence.

Until promotion happens, the migrations directory is not a reproducible
description of this database, and the drift check's "inventory green" — which its
own header already disclaims, since it compares versions and slugs rather than
SQL — is the only assurance there is.

**The drift check was deliberately red on one entry, and now is not.**
`20260801013000` and `20260913090000` were settled on 2026-09-15 by checking
each file against production. `20260727232000` stayed unresolved past that,
because the owner had recorded and documented the fab-release gate's divergence
on 2026-09-14 without yet deciding whether to port the sibling app's stricter
gate into Rev.2 — freezing it before that decision would have turned a standing
reminder into silence. The owner made that call on 2026-09-15 ("adopt the
sibling app's logic as Rev.2's own"), and `20260915120000_adopt_2026_fab_release_gate.sql`
is the port: it tracks the current live `evaluate_release_gate` /
`evaluate_fab_release_set` / `work_package_drawing_set_reports` /
`piece_control_drawing_is_approved`. `20260727232000` itself still must never be
applied — its embedded bodies are the old, superseded ones — so it freezes
rather than becoming required; the test that pins its evidence now checks for
that resolution instead of pinning it red.

### Monetization / go-to-market

- **Legal pages** — the self-serve signup needs ToS / privacy / a basic DPA to
  link to. The wording needs a lawyer; the pages can be scaffolded.
- **Stripe go-live** — the billing **code path is complete + correct** but has
  never run end-to-end (1 internal `enterprise` org, 0 `billing_events`). Owner
  steps (create prices, set the 4 `stripe-billing` secrets, wire the webhook, run
  a test-mode checkout) are in [`docs/stripe-go-live.md`](docs/stripe-go-live.md).
  ✅ **Update (verified 2026-06-17):** the orphan **Supabase Stripe Sync Engine**
  functions (`stripe-setup`/`stripe-worker`/`stripe-webhook`/`stripe-diagnostics`)
  are **gone** — only the active edge functions remain (`llm-proxy`,
  `email-ingest`, `email-send`, `stripe-billing`,
  `project-export`, plus deprecated `sharepoint-proxy`/`bluebeam-proxy`). The 29-table `stripe`
  schema decision remains. ✅ **`org.plan` anchor path confirmed (code-verified
  2026-06-17):** there is no separate `stripe-webhook` function — the webhook is a
  `/webhook` route INSIDE the deployed `stripe-billing` function (CLAUDE.md §16 is
  stale on this). It signature-verifies against `billing_config.stripe_webhook_secret`,
  is idempotent via `billing_events`, and writes `organizations.plan` /
  `subscription_status` via the service-role client on `checkout.session.completed`
  + `customer.subscription.updated/deleted`. Still unverified: the **live
  Stripe-dashboard endpoint wiring + an end-to-end test** (0 `billing_events`; 1
  internal `enterprise` org) — same gap as the "Stripe go-live" item above.
- **Storage backfill (app-files cross-project read residual)** — ✅ **DONE in
  production (2026-07-20):** all 775 legacy `uploads/…` objects were copied under
  the founding-org prefix, DB references rewritten, and the legacy storage RLS
  branch closed. Originals are retained as rollback material; deleting them is a
  separate owner decision (see `docs/app-files-tenant-isolation-plan.md`).
- **Org → project access model — ✅ RESOLVED 2026-08-19** (migration
  `20260819001000_org_member_default_project_access`): org members implicitly
  hold a workspace-configurable default role (`viewer` by default) on every
  org project when they have no explicit `user_projects` row, so a new
  teammate's first session shows the org's projects instead of an empty app.
  An explicit `user_projects` row always wins (grant more or restrict below
  the default); org admins can switch the default (Viewer/Field/PM) or turn
  it off (invite-only) from Team → "Default project access for members".
- **Deprecated edge functions** — `sharepoint-proxy` / `bluebeam-proxy` /
  orphan Stripe Sync functions may still be deployed remotely. Owner-run helper:
  `npm run supabase:delete-deprecated-fns` (dry-run by default; `DRY_RUN=0` to
  apply). CI opt-in drift job flags them when `SUPABASE_DRIFT_ENABLED=true`.
- **Stale generated types** — org/billing tables were patched into
  `src/types/supabase.ts` (2026-07-27). Full regen via `npm run types:db` still
  needed for remaining gaps (`vendors.org_id`, `*.client_op_id`, etc.).

### Platform maturity (longer-running)

- **TypeScript conversion (in progress)** — `src/services/` is fully typed and
  the deterministic Production Control scoring boundary is now
  `src/utils/pccEngine.ts`, with explicit source-record, normalized-item,
  scoring, rollup, forecast-window, owner-load, briefing, and release-action
  result types. Continue incrementally, shared-infra-first; do not mass-rename
  UI modules whose shapes are still implicit. Base `strict:false`, while
  **strictNullChecks + noImplicitAny are CI-enforced ratchets**, and
  `check:no-new-js` blocks new `.js/.jsx` files under `src`.
- **Large-component decomposition (in progress)** — the biggest components are
  being thinned by extracting their pure logic into named, unit-tested modules
  (behavior-preserving, validated against the full suite at each slice). Done so
  far: `ScheduleGantt.jsx` 2,812 → 2,280 (helpers module + `useColumnResize` /
  `useGanttLayout` / `useTaskBarDrag` hooks + presentational toolbar/legend);
  `PortfolioView.jsx` roll-ups → `portfolioDerive.js`; the two drawing-upload
  modals → shared `lib/drawingUploadUtils.js`; the hub's Approval Matrix builders
  → `drawingSubmittalHub/format.ts`. The thinned containers are still large and
  still JS/JSX — converting them to `.tsx` is the follow-up.
- **`command_ui` dual-render debt — RESOLVED in Phase 0 Batches 14–39.** The
  presentation flag and its runtime branches were retired route by route. The
  remaining operational flags are server-backed and are not presentation-shell
  selectors. Specialist registers and detailed workflows remain intentionally
  supported secondary surfaces.
- **alert() — DONE.** No `window.alert()` left in `src` (the last 4 validation/
  save sites use sonner `toast.error`).
- **Playwright E2E coverage** — read-only smoke and mutation-aware fab-release
  specs exist, but remain opt-in/nonblocking until a dedicated test user, test
  organization, and fixture project are provisioned against staging.
- **A11y audit + mobile/iPad polish** on core workflows; **large-project
  performance** (virtualization, server-side filtering, narrow invalidation).
  Phase 0 tablet kit is landed; Phases 1-4 domain migrations remain pending.
- **Dependency vulnerabilities — updated 2026-10-07:** fresh production-only audit has zero advisories; the complete dependency tree has five high entries from the Braces build-tool chain. See DEP-1 and [the dependency/toolchain report](docs/audits/DEPENDENCY_TOOLCHAIN_2026-10-07.md). Remediate with compatible, tested changes and verify the security gate; do not use `npm audit fix --force`. The June zero-advisory result and old major-version shopping list are historical, not current advice.

### Database / migrations

- **Historical baseline cutover, not current production parity:** the June 20 squash established three baseline files and a local replay at that time; [the cutover record](docs/db-baseline-cutover.md) preserves that history. Later live definitions/policies/grants and shared ownership differ. DB-11 tracks a faithful rebuild and exact-payload evidence. **Current migration rules in CLAUDE.md govern: no `supabase db push`, MCP `apply_migration`, or ledger repair; manually reviewed application/stamping with a matching committed file and verified payload.** Older workflow suggestions are superseded.

- **CI publisher gates and governance:** current production/preview Cloudflare publisher jobs depend on `ci`, `secret-scan`, `supabase-drift`, `edge-typecheck` and `commercial-postgres`; staging has its own scoped dependencies. Main has an active PR/CI ruleset. Environment-scoped credentials, exact required check coverage, advisory dependency policy and external publisher connections remain CI-2/3/7/10. A workflow `needs` graph alone is not proof that every possible publisher is governed. Vercel is retired.

- **Code hygiene (low priority):** `formatCurrency` is still redefined in a few
  places (`hooks/useFinancials.ts`, `components/dashboard/ProjectPulse.jsx`, plus
  the canonical `components/shared/formatters.jsx`) — consolidate onto
  `formatters.jsx`. (`src/dev/mockData.js` was deleted and `package.json` now
  carries an `engines` pin — both previously listed here are resolved.)
  **Repo hygiene (2026-07-01):** the committed `.claude/worktrees/` snapshot
  (~967 files, ~26 MB) + three junk root artifacts were untracked and
  `.claude/worktrees/` was added to `.gitignore`.

### From the 2026-05-26 enterprise-readiness audit (still open)

- **Historical dashboard/secret handoff:** [the May handoff](docs/enterprise-readiness-handoff-2026-05-26.md) remains historical context. Current Auth leaked-password/abuse settings require explicit non-secret evidence (SBSEC-11); absence of an advisor warning does not prove the setting enabled. Main rulesets are now present (CI-3). Monitoring/alert delivery, environment restrictions and exact release artifacts remain separate assurance work. Prior Sentry source-map evidence does not prove alert delivery.

- **Unused-index review (perf, low priority) — REVIEWED, drops queued:** the
  `unused_index` advisor findings were reviewed against live `pg_stat_user_indexes`
  + query patterns; full verdict in
  [`docs/unused-index-review-2026-05-26.md`](docs/unused-index-review-2026-05-26.md).
  Of 170 `idx_scan = 0` indexes, 125 are constraint- or FK-backing (keep — "unused"
  is a low-volume artifact, not dead weight). 5 high-confidence drops (one redundant
  single-col + 4 GIN array/jsonb indexes with no containment query) were **applied
  live 2026-05-26** (migration `20260526180000_drop_unused_indexes.sql`; reversible).
  The rest are low-value either way; revisit with a real traffic window. Do NOT
  bulk-drop.

- **Historical Vercel metadata:** the June `.vercel/project.json` check described the retired host. Cloudflare Workers is the current production path; do not reuse that entry as a live hosting assertion.

### Edge-function security follow-ups — reconciled 2026-10-07

June's hardening/deployment observations remain dated history. The current audit reviews all nine owned production entrypoints and preserves EDGE-1 through EDGE-16 dispositions. Deprecated SharePoint/Bluebeam/Stripe/sheets/legacy-copy slugs are absent from the current owned production inventory; do not repeat July's “still deployed” count or old client protocol-3 instructions. EDGE-8/CI-9 prevent retired code from returning.

Remaining work is explicit in the current register: staged exact-source/configuration parity; authorization/MFA/erasure release acceptance; safe identity cleanup; private atomic mail/LLM accounting; verified mailbox bindings; Stripe failure/event-order handling; bounded bodies/deadlines; attachment/rendering controls; redacted errors/telemetry; and controlled provider integration tests. Historical `ALLOWED_ORIGINS=*` or unset-spend-cap observations are not assertions of current secret configuration. Read only non-secret effective settings and record evidence when validating them.

---

## Detailing Control Center audit — 2026-09-19

Three defects found and fixed (PR #433); each was proven by executing the code,
not by reading it. Recorded here because the two latent ones are masked by
current data, not by the code.

**Fixed**

- **`Released` toned neutral grey** in the Drawing Register's Status chip. The
  tone came from a regex whose first alternative tested `"Released for
  Fabrication"` and `"Approved"` — SUBMITTAL statuses that
  `effectiveDetailingState` never returns — so `"Released"` matched nothing and
  fell through to the same grey as `"Not Started"`, beside a GREEN Released
  column. Live at the time on sets `Anchor Bolts` and `Embeds`. Replaced with
  the exhaustive `registerStatusTone`.
- **Released column vs Released KPI** used different predicates
  (`isClosedPackage` vs `isPackageReleasedForFab`) under comments claiming they
  were the same. Split into `done` (released claim) and `terminal` (triage /
  late suppression).
- **`atRiskCount` counted closed packages** — the only `buildTriage` tally not
  derived from `openItems`. A Void-only set derives to `"Not Started"` and so
  reported CRITICAL schedule risk forever.

**Open — noted, not fixed**

- **`DetailingKpis.overdue` is dead.** `DrawingSubmittalHub.tsx` sets it to
  `triage.overdueDrawingSets` only, while every reader uses `totalOverdue()`
  (drawing sets + unlinked submittals). Harmless today because nothing reads the
  field; it is an under-count waiting for the first consumer. *Remediation:*
  delete the field, or set it to `totalOverdue`-equivalent and have the KPI cell
  read it.
- **`TriageItem.kind` is `string`, not a union.** `overdueDrawingSets` and
  `overdueUnlinkedSubmittals` both filter on exact string literals and are
  summed as if exhaustive — which they are today, because `buildTriage` emits
  only `"Drawing Set"` and `"Unlinked Submittal"`. A third kind added later
  would silently under-count the Overdue tile with no type error.
  *Remediation:* `kind: "Drawing Set" | "Unlinked Submittal"` in
  `drawingSubmittalHub/types.ts`.
- **Deprecated `drawing_sets.set_approval_status` still carries data.** 3 of 15
  live sets (`Anchor Bolts`, `Embeds`, `Deck`) carry `"approved"`. It is masked
  today because each also has a governing submittal, which outranks the legacy
  flag in `isClosedPackage`. Deleting any of those submittals surfaces the
  legacy path. *Remediation:* a migration to clear the column once the
  submittal-governed state is confirmed authoritative for those sets.

**Not audited in that pass** — Holds panel, Transmittals tab, 3D tab, and the
board components' rendering paths. Audited 2026-09-19 (below).

## Detailing Control Center — remainder audit, 2026-09-19

The four areas the pass above deferred. Live counts taken the same day:
`drawing_holds` 0, `drawing_transmittals` 24 / items 135, `model_elements`
6,498, `drawings` 226, `drawing_links` 0.

**Fixed**

- **The Holds picker read an unloaded register as "every sheet is held".**
  `HoldsPanel` guards only the *holds* query; the *register* query is a second,
  separate read whose `data` defaulted to `[]`. `holdableSheets([])` is also
  `[]`, so the sheet picker rendered the literal claim *"Every sheet already has
  an active hold."* while the register was still in flight — or permanently if
  that read failed. With `drawing_holds` empty live, the holds query always wins
  the race, making the false claim the **default first paint** of the Place-hold
  picker. Message now derives from the register's query state via
  `holdPickerEmptyMessage` (unread / failed / genuinely all-held are three
  different strings). Proven by rendering the real component; the render test
  fails on the pre-fix code.

**Open — verified, not fixed**

- **The transmittal log surfaces its own truncation flag** (was open; fixed
  2026-09-19). `useTransmittals` had flagged a capped read since it was written
  and documented the stakes — both reads are newest-first, so a cap drops the
  OLDEST rows and *a set sent only on them would otherwise look never sent*.
  `approvalMatrix.derive.ts` consumed the flag; `TransmittalLogPanel`
  destructured only `data` and ignored it. The flag is now split into which read
  capped, because the two fail differently: `headers` means whole transmittals
  are absent, `items` means every transmittal is listed but its attachment list
  and count are lower bounds. `possiblyTruncated` is unchanged as the OR of the
  two, so the Approval Matrix's contract is untouched. Latent at 24 headers /
  135 items.
  - The notice is driven by the flag, never by `transmittals.length`: the count
    is taken on the RAW reads before soft-deleted headers are dropped, so a
    truncated log can be far shorter than the cap. A test renders the notice on
    a **one-row** log to pin that — `ListTruncationNotice count={rows.length}`
    could not have fired there.
  - The panel MIRRORS the cap and the truncation accessor rather than importing
    them, for the reason `useTransmittals` already documents about
    `@/api/supabaseClient`: page tests mock the module, and reading a named
    export the mock does not define throws. Importing them broke
    `TransmittalLogPanel.test` immediately; a test pins the mirror to
    `DEFAULT_LIST_CAP`.

- **Two dead board components removed** (was open; done 2026-09-19).
  `drawingSubmittalHub/revisionImpactBoard.tsx` (256 lines, whole file) and the
  `TriageBoard` orchestrator in `triageBoard.tsx`, plus the helpers only it used
  (`TriageBoardProps`, `TriageList(+Props)`, `TriageItemRow`,
  `PipelinePanel(+Props)`, `REV_SEVERITY_TONE`, the local `LoadingSkeleton` cast
  and `AnyProps`) and their two `components.tsx` re-exports. 688 lines net. No
  test covered any of it — the suite total was unchanged at 6,504, which is the
  proof.
  - `RevisionImpactBoard` was also a *divergent* second renderer of
    `affectedPieces`: a bare `—` where the live `RevisionImpactPanel`
    distinguishes "no piece resolves to this set" from "roster not loaded".
    Reviving it would have reintroduced that ambiguity.
  - `triageBoard.tsx` was NOT deleted. `ModelMappingSection`,
    `SequenceReadinessSection`, `RevisionImpactSection` and `ReadinessPanel`
    are live via `ControlBoardPanel` and stay (948 → 521 lines).
  - **Do not confuse `src/lib/revisionImpactBoard.ts` with the deleted
    `src/pages/drawingSubmittalHub/revisionImpactBoard.tsx`.** The lib module
    exports `buildRevisionImpactRows` and is live — `DrawingSubmittalHub.tsx`
    and `src/lib/revisionSummary.js` both import it.
  - A shared block belonging to `ModelMappingSection` (`ELEMENT_BUCKET_ORDER`,
    `DRILLDOWN_ROW_CAP`, `FabStatusKey`, `OpenBucket`) sits physically BETWEEN
    where the dead orchestrator was and the live sections. Deleting by line
    range took it too; `tsc` caught it. Cut this file by symbol and re-run
    `tsc`, never by range.

- **`tabCounts` — the one badgeable tab was badged; two are deliberately not**
  (was open; resolved 2026-09-19). `revimpact` now badges `revisionImpact.length`,
  which the hub already computes for the tab itself, so it is free.
  `transmittals` and `validation` stay unbadged **on purpose**, and the reason is
  now a comment at the call site: `useTransmittals` is gated to
  `activeTab === "matrix"` because it is a three-table read, and
  `runDetailingValidation` is `enabled: false` behind an explicit "Run
  validation" button. Badging either would force its query eager on every page
  load — and for validation, a `0` would claim a clean report nobody ran. The
  strip renders no badge at 0, so omitting them asserts nothing. Adding a count
  to either is a performance decision first, not a display one.

**Verified correct — no action**

- **3D tab gating.** `Model3DGateLoading` / `Model3DGateError` /
  `Model3DGateNotice` keep "flags still loading", "couldn't check" and "viewer is
  off" as three distinct states, with a retry on the error path. The flag gates
  the tab body, never its link, so a `?hub_tab=model3d` deep link always lands on
  the 3D tab rather than silently showing the Control Board.
- **Model roster laziness.** `countModelElements` (HEAD, zero rows) answers "does
  a roster exist" and is always enabled; the 6,498-row roster itself pages and
  loads only on the 3D tab or on explicit request. `ModelMappingSection` receives
  `rosterCount`, `rosterCountLoading` and `rosterLoading` separately and is
  covered by tests over `rosterCount` null / 0 / 16771.
- **`affectedPieces` unknown-handling.** `buildRevisionImpactRows` types it
  `number | null` and leaves it null when the roster is unloaded;
  `RevisionImpactPanel` renders `—` and names which of the two causes applies.
- **Holds header badge.** `activeHolds` is `null` until the query is ready and
  `DetailingCommandHeader` hides the badge on null — it never shows "No holds"
  before the query answers.
- **`useTransmittals` lookups.** Revisions and GC drawings are read with
  `filterAll` (paged) precisely because they are id-keyed lookups; a capped read
  there would render a blank sheet number indistinguishable from a deleted row.

## Recently-resolved (last 30 days, kept here for context)

- 2026-09-13 **Bulk-edit approval gate enforcement:** added stage transition and submittal-link checks to `handleBulkEdit` in `pages/drawings/useDrawingsPageController.ts` to prevent bypassing the fabrication-release gate during bulk updates.
- 2026-06-20 **Security batch (audit #5/#6/#7/#11/#12 + #21/#14):** edge-function
  hardening — quota fail-closed + `LLM_KILL_SWITCH`, email-classify per-project cap,
  inbound-attachment count/size/extension guards + filename sanitize, CORS opt-in
  allowlist, Stripe redirect-origin validation — written, committed, and deployed via
  the Supabase CLI. Plus frontend: `src/lib/uploadValidation.ts` central upload guard
  enforced at the `UploadFile` chokepoint (#21) and `ProjectScopedRoute` route-level
  deep-link guard (#14), both unit-tested. Commits `6c6686e6`, `4dff88e5`, `e968f48d`.
  Residual follow-ups under Active items → "Edge-function security follow-ups".

- 2026-06-17 **DB perf/security hardening (tech-debt Phase 1):** applied live via
  MCP, advisor-confirmed. `20260617000000` — 9 `auth_rls_initplan` policy wraps
  (`(select auth.uid())`), dropped duplicate index `idx_drawing_markups_project_id`,
  pinned `search_path` on 3 `stripe.*` functions (guarded with `to_regprocedure` so
  it's replay-safe). `20260617000100` — 14 covering indexes for unindexed FKs
  (backcharges, pay_applications, organizations, drawing-revision tables, vendors,
  fab_releases). Perf advisor: 9 init-plan + 1 dup + 14 unindexed-FK → 0 (the lone
  remaining FK is the excluded `stripe._managed_webhooks` wrapper table);
  `unused_index` rose 164→177 (the new FK indexes — benign, 0-scan until queried).

- 2026-06-17 **`publish_drawing_revision` privilege fix (Phase 2, `20260617000200`):**
  the SECURITY DEFINER RPC that promotes/supersedes a drawing revision was gated only
  by `user_has_project_access` (any member, incl read-only `viewer`), while the UI
  Release control is "PM+ only" (display-only). Tightened the server to require
  `>= pm`, closing the display-only-vs-enforced gap. The rest of the definer surface
  was reviewed body-by-body and is correctly gated (`delete_drawing_set`=admin,
  `accept_invitation`=token+email-match+plan, `create_project`=org-membership+plan;
  the `set_for_*_is_locked` functions are read-only RLS helpers, not mutators).

- 2026-06-16 **Money-path test net + contract-value fix:** pinned the two
  untested financial modules (`budgetCalculations`, `utils/projectKpis`) and
  fixed a real divergence — `calcContractValue` matched approved COs with an
  exact `=== "Approved"` while canonical `computeRevisedContractValue` trims the
  status, so a whitespace-status CO showed a different contract value on the
  Projects KPI vs Financials. `calcContractValue` now delegates to the single
  source of truth.

- 2026-06-16 **Per-tenant data export:** the Settings "Export Data" button was a
  stub (downloaded only a list of table names). Now a real per-tenant JSON backup
  of every accessible project via the RLS-scoped, audited `project-export` Edge
  Function (deployed) + client bundling (`src/lib/workspaceExport.ts`).

- 2026-06-16 **Multi-tenant data isolation (Tier-0):** wired the org boundary
  into RLS — `user_has_project_access` now requires org membership (the chokepoint
  for ~70 tables), `create_project` rejects a foreign `org_id` (closed a
  privilege-escalation hole), `projects.org_id` set NOT NULL, and `vendors` /
  `user_profiles` / `app-files` storage are org-scoped (migrations
  `20260615000000`–`20260616000000`). Verified 0 cross-tenant reads; advisors 0-error.

- 2026-06-16 **Plan-limit enforcement + self-serve signup + onboarding:** plan
  limits (Free/Pro/Business) enforced server-side in `create_project` /
  `accept_invitation`; signup wired into the landing page; a brand-new workspace
  is routed into the first-run Onboarding wizard (+ a 0-project dashboard welcome).

- 2026-06-13 **Multi-tenant SaaS layer + Stripe billing:** `organizations` /
  `organization_members` / `organization_invitations`, `OrgProvider` + onboarding
  + OrgMembers, and Stripe subscription billing with a tamper-proof `org.plan`
  anchor (`stripe-billing` Edge Function).

- 2026-06 **Self-hosted 3D IFC viewer + AI Revision Intelligence:** replaced the
  removed `@thatopen` stack with a lazy-loaded `web-ifc` + `three` viewer
  (`viewer_3d` flag) with per-piece fab status from `model_elements`; shipped the
  AI revision-diff line (`revisionSnapshotDiff` → `drawing_revision_deltas`,
  Revision Impact Report, Create-RFI-from-delta; `revision_ai_diff` flag).

- 2026-06-03 `vendor-xlsx` (~683 kB / ~179 kB gzip) bundle audit — **already
  async-only; no code change needed.** Follow-up to the PR #55–#59 enterprise
  perf-hardening line (PDF view/export chunk splits). Audited every `xlsx`
  reference: the only real consumers are `src/pages/SOV.jsx`,
  `src/pages/Onboarding.jsx`, `src/pages/DataExchange.jsx`, and
  `src/lib/importPsrSpreadsheet.ts` (used by `JobStatusReport` via
  `PsrSpreadsheetImportModal`) — all four load the library with
  `await import("xlsx")` inside explicit import handlers (`handleImportFile` /
  `handleImportClick`), never at module top-level or on mount. The remaining
  ~14 `xlsx` matches are file-extension strings / MIME types, not library
  imports. Production build evidence: `vendor-xlsx-*.js` is referenced **only**
  via `import("./vendor-xlsx-*.js")` (dynamic) in exactly the 4 consumer route
  chunks; zero static `import … from "./vendor-xlsx-*.js"`; the entry
  (`index-*.js`) and router (`AppRoutes-*.js`) chunks never reference it. So
  xlsx is fetched on-demand only when a user invokes a spreadsheet
  import/export action and stays out of every common route's initial load.
  Per CLAUDE.md §1 (smallest complete change), no source edit was made.

- 2026-05-26 deploy/default branch renamed `codex/base44-deploy-nick` → `main`
  (GitHub-native rename: commits preserved, default branch + open PRs updated,
  old name redirects during the grace period). The stale prototype `main`
  (6 abandoned commits) was archived to `archive/old-main-prototype` then
  deleted before the rename. The project owner switched the Vercel Production
  Branch to `main` (the Branch Tracking panel now reads "pushed to the `main`
  branch"). The living docs + CI (`ci.yml`, `CLAUDE.md`, `README`,
  `ARCHITECTURE`, `AGENTS`) were updated to the new name.

- 2026-05-26 RLS multiple_permissive_policies consolidation (143 -> 0): collapsed
  overlapping permissive policies into one per (table, role, action), table-by-
  table, verifying access byte-identical against pg_policies before/after.
  Batch 1 (`20260526190000`): dropped the redundant FOR ALL `project_member_access`
  on 32 standard project-owned tables (fully replicated by the four per-command
  `project_*` policies), the generic `project_*` duplicates on `drawings` /
  `drawing_sets` (domain `drawings_*` / `drawing_sets_*` retained, incl. the
  lock-aware update + admin-only delete), and a duplicate FOR ALL on
  `drawing_zone_activity`. Batch 2 (`20260526200000`): merged the two `projects`
  SELECT policies into one, and split the admin FOR ALL on `default_cost_codes` /
  `feature_flags` into write-only commands (public read already covered SELECT).
  `user_projects` (`20260526210000`): merged the two SELECT policies AND, while
  reviewing it, found + fixed a privilege-escalation hole — the re-introduced
  `users_insert_own_membership` (self-insert with no project/role constraint, no
  INSERT trigger) let any authenticated user grant themselves `owner` on any
  project; dropped it (re-applying migration 082's intent; onboarding is handled
  by the SECURITY DEFINER `create_project()`, member management is admin-only).

- 2026-05-26 sharepoint-proxy org-browse gate deployed live: the
  `userIsSystemAdmin` gate on the org-level browse actions
  (`list_sites`/`list_drives`/`list_children`/`get_file_meta`) — committed in
  `a8ef505c` but only on the Vercel frontend branch — was deployed to the live
  edge function via the Supabase MCP (`sharepoint-proxy` v6, `verify_jwt` true).
  Verified the live function body now contains the gate; behavior for
  per-project actions (`sync_folder`) is unchanged.

- 2026-05-26 per-project-role UI gating: `usePermissions().can()` now resolves
  the effective role from the user's role in the ACTIVE project
  (`useProjectRole`/`useProjectId`) instead of only the global account role, with
  a global-admin override and a global-role fallback when no project is active.
  Display-only — RLS + `workflowEngine.validateTransition` remain authoritative
  (commit `89d8c302`).

- 2026-05-26 feature + enterprise pass: scheduling ("Update Scheduled Dates"
  sync button + drag-to-resize Gantt bars); SOV import hardening (XLSX + steel
  cost-code auto-mapping + pre-import review modal; migration `20260526140000`
  adds `cost_code`/`cost_code_name` to `sov_items`); CO workflow (convert
  cost-impact RFIs → change orders + SOV-line link; migration `20260526150000`
  adds `source_rfi_id`/`sov_line_item_id`/`sov_line_number` to `change_orders`);
  DB scale pass (migration `20260526160000` = 43 covering indexes for unindexed
  FKs + 4 duplicate-index drops; `20260526170000` = 4 `auth_rls_initplan` policy
  wraps); Sentry error monitoring (`src/instrument.js`, masked replay); module
  trim (removed Project Control Center, Portfolio Schedule, Drawing Analysis,
  Meetings, Mitigations, 3D Model Viewer; relocated Onboarding/Data Exchange/
  Integrations/User Management/Feature Flags/Tutorial into Settings); re-landed
  the previously-unpushed financial-correctness fix (signed deductive-CO amount +
  CSV "closed" → neutral status).

- RBAC Phase C project-member management resolved: migration
  `20260516012000_resolve_project_members_phase_c.sql` adds the
  `member_activity` audit table, logs `user_projects` membership adds,
  role changes, and removals from a database trigger, aligns
  `user_projects` RLS with both system-admin and per-project-admin
  management, and gives system admins project-picker read access. The
  Project Members page now allows system admins and per-project admins
  through the page-level gate, supports bulk role updates, shows recent
  member activity, and continues to add only existing `user_profiles`
  users until email invite infrastructure exists.

- `permissions.js` silent-deny resolved in RBAC Phase B: `fetchUserRole`
  now looks up `user_profiles.id` instead of the nonexistent
  `user_profiles.user_id`, so `usePermissions.can()` no longer falls
  through to `"viewer"` for every authenticated user.

- Bypass-able localStorage admin gating resolved in RBAC Phase B:
  `src/hooks/useProjectRole.ts` reads per-project roles through the
  SECURITY DEFINER `get_my_project_role(uuid)` RPC; RLS on protected
  drawing workflows uses `user_has_project_role_at_least(project_id,
  'admin')`; and `'owner'` remains a level-3 synonym for `'admin'`.
  LocalStorage roles remain only as a legacy fallback for screens with no
  active project.

- AI extraction reconciler scheduling resolved: migration
  `20260516003546_enable_ai_extraction_pg_cron.sql` installs
  `pg_cron` and schedules `public.reconcile_stuck_extractions()` every
  5 minutes. Production verification found 0 stale `Extracting` rows
  before enabling the schedule.

- Existing `pdf_page=1` rows after the thumbnail bug are now classified
  as a known data-reupload cleanup, not active code debt. The product
  fix remains in place for new uploads, the manual `PDF Page` editor
  remains available, and production still has candidate legacy rows
  that require reupload or explicit sheet-by-sheet correction rather
  than an unsafe guessed backfill.

- Main worktree hygiene items resolved: the nested
  `C:\dev\SteelBuild-Pro-Rev.2\SteelBuild-Pro-Rev.2\` directory is no
  longer present, and no active locked-window issue reproduced during
  the current cleanup pass.

- Drawings schema/stage cleanup resolved: migration
  `20260516001543_resolve_drawings_tech_debt.sql` drops the dead
  `drawings.annotations` column, backfills pre-077 analysis-stage
  values to canonical stages, tightens the `drawing_analyses`
  stage CHECK, and adds a `NOT VALID` check so new `drawings` rows
  must carry `drawing_set_id`.

- Legacy workflow-stage aliases resolved: active UI/tool references now
  use the canonical `Not Started -> IFA -> OFA -> BFA -> OFS -> IFC ->
  Released` flow, and `src/lib/drawingEnums.js` /
  `src/lib/importAnalyzedDrawings.js` no longer coerce pre-077 stage
  strings.

- Submittal pipeline rollup duplication resolved:
  `src/pages/dashboard/projectMetrics.js` now exposes only the canonical
  `submittalPipelineRollupFromSubmittals` path; the legacy mixed
  drawings/submittals rollup was removed after confirming no live
  callers remained.

- Retired schedule chat assistant removed from the application and
  repository runtime. Historical `pma_*` / `ai_audit_log`
  schema objects remain in migrations and generated types only.

- Supabase generated types / typecheck drift resolved: `npm run typecheck`
  and `npm run typecheck:js` are passing, and CI treats both checks as
  blocking.

- 3D viewer camera snap-back during zoom fixed via component-level refs,
  `infinityDolly` disabled, and `workPackages` staleTime increased.

- Drawings stage workflow corrected in migration 077:
  `Not Started -> IFA -> OFA -> BFA -> OFS -> IFC -> Released`.

- Thumbnail bug fixed: multi-sheet PDFs now correctly assign `pdf_page`
  per drawing.

- Submittal-driven workflow source of truth resolved: KPIs, Stage
  Pipeline, and group headers all read from submittals instead of
  `drawings.stage`.

- Auto-lock trigger re-pointed from `set_approval_status` to submittal
  terminal-approved status.

- Lock, sign-off, and markup status resolved in migrations 071/072/073.

- Component-rendering test infrastructure added: React Testing Library
  and jsdom are wired in. Smoke tests for Layout, Drawings, and
  Submittals live in `src/__tests__/components/`. Default vitest env
  stays `node` for pure-helper suites; component tests opt into jsdom
  with `// @vitest-environment jsdom`. See `ARCHITECTURE.md` Testing.

## Batch 42 accepted staging disposition

- **B41-P1-001 legacy flat Storage isolation:** ~~accepted for the current
  single-tenant staging candidate because the available evidence does not show
  an active leak. This is not a resolution. Storage policy/object verification
  remains required before organization #2 and is paired with the legal-review
  gate.~~ **Superseded — resolved in production 2026-07-21.** The cutover this
  acceptance was deferring happened; see
  [Storage isolation — B41-P1-001 closure](#storage-isolation--b41-p1-001-closure).
  The "before organization #2" condition is discharged for `app-files`, but
  **not** for the `sheets-files` bucket created afterwards — see the open item
  in that section.
- **B41-P1-002 through B41-P1-006:** remain staging or owner-controlled gates
  for migration alignment, Edge Function deployment/configuration, critical
  smoke coverage, branch protection, and backup/rollback readiness.
- Batch 42 adds execution plans and evidence requirements only. It does not
  deploy, apply migrations, modify remote configuration, or change application
  behavior.
## Batch 44A staging remediation status

- The staging-only Security DEFINER ACL remediation is applied as migration
  `20260715235514_restrict_security_definer_execution`. Anonymous execution of
  internal maintenance and trigger-only functions is closed; reviewed
  authenticated browser/RLS RPC grants remain intentional.
- The exact candidate was deployed only to the isolated Vercel staging project.
  The protected bundle targets the staging Supabase ref and does not contain the
  placeholder or production ref.
- **P1 requires staging:** authenticated tenant isolation, Storage isolation,
  authenticated project export, fabrication-release safety, and protected
  browser console/route smoke still need owner-provisioned fixtures and session
  evidence.
- **P1 requires external verification:** scheduled maintenance-job ownership
  could not be inspected with the available staging SQL role. Supabase advisor
  informational notices for `billing_config` and `billing_events` remain open.
- The frozen `account-delete` function and disabled integrations were not
  invoked, redeployed, or modified. No production action occurred.
