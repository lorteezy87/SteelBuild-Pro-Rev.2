# Drawing staging setup and recovery

Date: 2026-10-16. Status: **WRITTEN DESIGN APPROVED BY THE OWNER**.

Approval: the owner explicitly approved this addendum in this chat and requested its implementation plan, retaining subagent-driven execution. Implementation-plan review and the execution gates below remain separate. The owner's request to publish upon completion is recorded for the final whole-cutover release stage, not as a claim that this foundation is complete or permission to bypass exact shared-database change checks.

Architectural addendum to the approved [drawing backend cutover design](2026-10-15-drawing-backend-cutover-design.md), not an implementation plan, execution authorization or acceptance result. Original constraints and frozen drawing contracts remain unchanged. Production `kjrwqagyeswwoxpjkcko` stays read-only until separate exact-change approval; only persistent staging `ndyfjffsulfbwpmwdmic` is proposed. Drawing Control UX simplification follows the cutover/staging work.

## Purpose and authority

Provide a narrowly bounded synthetic fixture foundation with private recovery, without customer access, provider sends or hidden administrative application writes. The owner separately approved these setup choices before approving this written design:

- Exactly two newly created, receipt-verified staging organizations may change `free` to `pro` after side-effect review. No existing organizations, Stripe, subscriptions, charges or production changes.
- A dedicated local encryption keypair; only its public recipient enters workflows; encrypted recovery artifacts have short, explicit retention.

The setup-secret name is verified in `staging-backend`; its value, project binding and validity remain untested. Approval of this design must precede an implementation plan, exact claims, source review and execution gates.

## Architecture and interfaces

Use two explicit foundation stages: `setup-bootstrap` → independent receipt review/manual entitlement transaction → `setup-complete`. Each stage occupies one protected runner job. Waiting indefinitely inside one job is fragile; automatic SQL application violates the manual boundary; a durable provisioning service adds unnecessary infrastructure. Two stages require an owner-mediated private resume, without a broad GitHub-admin token.

Proposed interfaces:

```ts
validateSetupPlan(raw, expectedDigest, context): SetupPlan
runFoundation(plan, resume, transports, checkpoint): Promise<FoundationReceipt>
encryptRecovery(payload, recipientSpki, context): RecoveryEnvelope
decryptRecovery(envelope, privateKey, expectedContext): PrivateRecoveryPayload
```

Strict context binds version, stage, candidate SHA, run UUID, workflow run/attempt, phase, checkpoint sequence and recipient SPKI SHA-256. Plans contain bounded roster/binding data, never executable scripts, arbitrary routes or SQL. Private payloads are bounded to 1 MiB; oversized inputs fail without truncation.

### Proposed source map — NOT CLAIMED

| Path | Responsibility |
| --- | --- |
| NEW `scripts/drawing-cutover-provision.ts` | Finite state machine; separate admin/caller transports; receipts |
| NEW `scripts/drawing-cutover-recovery.ts` | Network-free Node envelope encryption/decryption |
| NEW `scripts/drawing-cutover-recovery-local.ps1` | Local ACL checks and operator key/decryption wrapper |
| NEW `supabase/tests/drawing-set-revision-transaction/staging-setup-entitlements.sql` | Reviewed, manual exact-two-org transaction |
| `scripts/__tests__/drawingCutoverStaging.test.ts` | Focused behavior, crypto, privacy and failure tests |
| `e2e/drawing-cutover-setup.ts` | Strict setup/receipt/resume validation; preserve acceptance stop |
| `.github/workflows/drawing-cutover-staging.yml` | Explicit stages, encrypted checkpoints and resume binding |
| `docs/audits/DRAWING_BACKEND_STAGING_ACCEPTANCE_2026-10-15.md` | Status and operator/recovery instructions |

No new dependencies, application/Edge changes, migration payload changes, grants, ratchet growth or legacy-bootstrap reuse. Only this design document is currently claimed.

## Finite foundation flow

Seven exact owner-reviewed synthetic addresses map to `admin`, `foreign`, `pm`, `viewer`, `field`, `removed`, `mfa`. No account receives global system-admin authority.

Bootstrap generates strong passwords and uploads the initial encrypted checkpoint before its first write. It creates exactly seven users through `POST /auth/v1/admin/users` with explicit `email_confirm:true`, then authenticates each through password sign-in and exact current-user readback. No invitations, magic links, resets, phone identities or arbitrary metadata. `admin` creates org A and `foreign` creates B through caller-JWT `create_organization`; exact creator/owner readback precedes `AWAITING_ENTITLEMENT_REVIEW`.

Complete requires reviewed bootstrap receipts and actual entitlement readback. Owner JWTs set `member_default_project_role:null`, add the five A members through bounded `organization_members` inserts, create two projects per org through `create_project`, and insert exact A1 `user_projects` roles: PM/viewer/field/field/PM. A2 has no non-owner assignments; B projects belong only to the foreign owner. Check current exact IDs, creators, orgs, roles and expected counts before every write. Never adopt by name/email/editable metadata or use the broad key for ordinary app operations.

TOTP-only enrollment/challenge/verification for `mfa` may follow no-email closure, using its caller JWT and exact returned factor/challenge IDs. Require actual verified factor/AAL2; invalidate cached session assumptions and reacquire intentional AAL1/AAL2 sessions for later probes. No SMS, factor deletion or automatic re-enrollment. Membership removal, archival and drawing-set locking remain timed scenarios, not foundation flags.

Foundation is not acceptance. The existing acceptance mutation-readiness assertion stays unconditionally OFF. Sixteen missing drawing scenario implementations, actual PDFs/pages, lifecycle, MFA denials, stop/recovery and erasure proof remain incomplete. Foundation output cannot satisfy them or make the full Task13 result green.

## Proposed operational key trust model

The transport has one literal TLS origin, `https://ndyfjffsulfbwpmwdmic.supabase.co`, no redirects and finite exact routes/methods/bodies. Independently establish the staging API-key identifier and owner creation attestation; bind the exact credential's reviewed SHA-256 in the private plan and compare in memory before fetch. Accept only the reviewed server-side `sb_secret_` format, not a JWT or deployment PAT. No production/repository-secret fallback.

Prefix and digest are not proof of project ownership: the digest proves equality with the independently reviewed credential, while the attestation supplies its provenance. Supabase's gateway must authenticate that key on the first exact authorized admin-create operation. A rejected or ambiguous response stops without retry or fallback; fixed transport cannot target production even if the supplied key is wrong. This is an explicit operational trust model for owner review, not proven current key validity. It requires no invented canary, customer Auth read, list-all-users or imagined introspection endpoint. Subsequent user readback is limited to exact IDs returned by this run.

## Private custody and envelope

Local private-key directory:
`C:\Users\nlort\AppData\Local\SteelBuildPro\DrawingCutoverRecovery\2026-10-16`.

The future wrapper verifies resolved local ancestors/leaf are outside OneDrive/repositories and not reparse points, symlinks or network shares. Inspect owner SID/DACL; create only the required dedicated directory tree, never recursively alter existing parent ACLs. Protect leaf inheritance and allow only the owner SID and SYSTEM. Refuse unexpected existing files/ACLs. Verify before create-new private-file creation and afterward; never overwrite. Owner-process/administrator compromise remains outside this protection.

Use existing Node crypto: RSA-3072 OAEP-SHA256 wraps a fresh 32-byte AES key; AES-256-GCM uses a fresh 12-byte nonce and 16-byte tag per envelope. Private PKCS8 stays local; only public SPKI PEM/fingerprint enters the workflow. Canonically encoded context is authenticated associated data. Reject unknown formats/recipient/context and authenticate fully before writing private plaintext. Wrong keys, tampering, truncation and substituted context must produce no partial plaintext.

Encryption does not authenticate its sender: anyone possesses the public key. Independently verify repository, workflow, exact source/run/attempt, artifact ID and ciphertext digest before trusting decrypted receipts. Successful decryption or a reviewer string is insufficient.

Upload only the enumerated `.enc.json` file with `retention-days: 1`, using unique immutable checkpoint names, never a directory/glob. Owner downloads before expiry into the protected directory. Local key/ciphertext persist pending explicit closeout; never delete the only recovery copy automatically. No plaintext credentials, TOTP, sessions, emails, payloads, signed URLs or PDFs in shared artifacts/logs/chat.

## Checkpoints and independent resume

Require successful remote initial ciphertext upload containing generated credentials, exact plan and pending roster before any mutation. Atomically persist private intent before each operation and result/readback afterward; re-encrypt locally after results. Upload the final checkpoint on success and best-effort failure/cancellation.

This is not per-write durable external persistence: a killed runner can lose later receipts, and cancellation handlers can themselves be terminated. Missing final artifacts, interrupted intents or lost create responses become `UNKNOWN_COMMIT_STATE`. Never blindly repost, reset credentials, adopt existing accounts or clean up rows/PDFs. Known IDs can be independently inspected after authorization; unknown outcomes require separately scoped operator reconciliation and may remain unrecoverable. Initial passwords enable investigation, not proof of creation.

Owner decrypts locally. Independent review uses a credential-free receipt projection and actual provenance/readback, including entitlement targets. After review, owner manually inserts bounded private `STAGING_DRAWING_SETUP_RESUME` into the environment through GitHub UI. The next stage compares its digest with the independently approved dispatch binding and revalidates exact IDs. No automated secret writer, broad GitHub token or private key in Actions. Resume approval does not approve acceptance.

Runner private directories/files are 0700/0600. Install tooling before injecting secrets; allowlist child environments. Setup consumes environment-only `STAGING_DRAWING_SETUP_SECRET_KEY`/`STAGING_DRAWING_SETUP_PLAN` and bound public configuration. `STAGING_DRAWING_RECOVERY_PUBLIC_KEY` is public and pinned independently. No deployment PAT, auth traces/HAR/video/screenshots or raw error output. Browser/ordinary app processes never inherit the broad key.

## Manual entitlement boundary

Use independently verified staging connection identity—not merely a session ref assertion—and exactly two receipt-bound org/creator UUIDs. READ COMMITTED, ordered NOWAIT locks, local `lock_timeout='2s'` and bounded statement timeout. Assert distinct IDs, matching creators, free plans, owner-only memberships, zero projects/invitations, no unexpected children and null Stripe/subscription/customer/period fields. Unknown schema or side effects stop.

Update only those two plans to pro with old-state predicates; require exactly two returned rows. Keep triggers enabled, verify expected timestamp/audit effects and unchanged billing fields; commit both or roll back both, then read back. Lost commit responses require inspection, not blind rerun. No provider call, fabricated subscription, quota-trigger bypass or automatic free restoration while surviving fixtures exceed limits. Later restoration/erasure requires exact reviewed closeout scope. Workflow never executes SQL.

## Gates and verification

No actual setup until all required scenario source is readied and exact main/SHA/four-source-job gates, immutable same-SHA build, installed compatible package, independent receipt/ownership prerequisites and side-effect closure are satisfied. Preserve main-only environment and all five production gates; production drift is not waived. Source review precedes credential use.

Inspect installed Auth/profile/org/member/project triggers and functions, seeded action/cost-code/handoff descendants, audit/outbox/webhook/cron dependencies and entitlement effects. Empty Auth Hooks UI is insufficient. Reconcile conflicting health signals and the metadata API's `Project not found` response; neither proves branch loss or health.

Observed MFA enrollment/removal notifications are ON. Changing `mailer_notifications_mfa_factor_enrolled_enabled` or `mailer_notifications_mfa_factor_unenrolled_enabled` needs fresh named action-time approval, exact staging verification and restoration plan. Other selected-operation notification/hook effects also require closure; invalid-domain addresses are no no-email guarantee.

Later offline RED/GREEN covers finite positive controls, target/key/fixture refusals before fetch, caller/admin separation, missing prerequisites, crypto tamper/wrong-key cases, stale/forged receipts, cancellation/lost-response stops and privacy. Use focused tests/typechecks, not repeated broad suites during iteration. Manual SQL gets separately reviewed rollback verification. Tests, encryption and foundation success are never hosted drawing acceptance or production approval.
