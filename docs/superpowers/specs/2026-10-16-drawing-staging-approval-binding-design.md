# Drawing staging approval binding amendment

Date: 2026-10-16. Status: **WRITTEN AMENDMENT APPROVED BY THE OWNER**.

The owner selected manual staging approval with post-creation fingerprints in this chat, including its effect on other jobs using `staging-backend`, then explicitly approved this written amendment and requested the updated implementation plan with continued subagent-driven work. Written-spec review is complete; updated implementation-plan review still precedes implementation and settings changes. Completed setup/recovery Tasks 1–3 are not restarted. Production stays untouched until staging acceptance and all required release checks pass; the exact shared-database release boundaries below also remain in force.

This supplements the approved [setup and recovery design](2026-10-16-drawing-staging-setup-recovery-design.md) and its [implementation plan](../plans/2026-10-16-drawing-staging-setup-recovery.md). It replaces only the setup dispatch-digest timing/channel and related workflow/operator requirements. The foundation remains separate from authenticated drawing acceptance. Production stays untouched during this work.

## Approval timing

The exact compact `SetupPlan` contains the actual GitHub run ID and attempt. `SetupResume` also contains its new execution context and plan digest. Those full-byte fingerprints cannot be supplied before GitHub creates that run. Rewriting the document afterward invalidates its original fingerprint; a rerun changes the attempt without replacing dispatch inputs.

Keep the existing schemas and exact raw-byte SHA-256 checks. After run creation, the owner independently reviews the exact execution-specific documents, supplies their fingerprints through the protected environment, and approves the waiting job. The runner compares those separately approved values; it never computes an expected approval fingerprint from an untrusted input and treats that as approval. No subset hash, placeholder run ID, relaxed context comparison or new approval-template schema is introduced.

Environment secrets are read when their referencing job starts, which permits this post-creation delivery behind a genuine approval barrier. Use environment secrets rather than assuming equivalent timing for variables. [GitHub secrets reference](https://docs.github.com/en/actions/reference/security/secrets)

## Staging protection policy

Change only `lorteezy87/SteelBuild-Pro-Rev.2` → `staging-backend`:

- Require the repository owner `lorteezy87` as the manual reviewer.
- Disallow administrator bypass of the configured protection rules.
- Preserve the existing single allowed deployment policy: branch `main`, not tags or a wildcard. Preserve all other unrelated environment settings.
- Permit the owner to approve a run they initiated. This is an explicit owner release gate, not a claim of two-person human approval. Independent source and receipt reviews remain required separately.

The 2026-10-16 readback has only the branch policy, allows administrator bypass, and has no required reviewer. Read the effective policy again immediately before making the authorized change, and verify the exact result afterward. If feature availability, permission, concurrent configuration changes or readback prevent establishing the specified gate, stop; do not weaken branch restrictions, upgrade an account or add a replacement environment automatically. [GitHub environment protection](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)

This shared environment policy also requires manual approval for other jobs that reference it, including existing staging build/evidence jobs. Do not silently move those jobs to a less-protected environment. Policy readback proves configuration, not a successful queued-job/secret-timing rehearsal. Verify that behavior later through an authorized, reviewed execution without bypassing the present source-readiness stops.

## Exact input channel

No setup plan or resume fingerprint is a workflow-dispatch input. Setup dispatch supplies only the exact candidate SHA and phase. Preserve the existing fixture-manifest digest input for `preflight`/`acceptance`, require it for those phases and reject it for setup phases. Reject unknown or incompatible inputs.

The owner supplies these values **only** in `staging-backend` before approving the selected setup job:

| Environment secret | Purpose |
| --- | --- |
| `STAGING_DRAWING_SETUP_PLAN` | Existing exact compact private plan for this run, attempt, source and phase |
| `STAGING_DRAWING_SETUP_PLAN_SHA256` | New, independently reviewed lowercase SHA-256 of those complete plan bytes |
| `STAGING_DRAWING_SETUP_RESUME` | Existing complete-phase private resume with independently reviewed bootstrap provenance and entitlement readback |
| `STAGING_DRAWING_SETUP_RESUME_SHA256` | New, independently reviewed lowercase SHA-256 of those complete resume bytes; required only for `setup-complete` |

Bootstrap does not consume resume values. Complete requires both exact fingerprints. Preserve the dedicated staging setup key and existing bound public configuration; no deployment PAT, repository/organization fallback, broad GitHub token or automated secret writer is added. Fingerprints are nonsecret commitments stored as environment secrets for their documented read timing; private inputs and credentials remain confidential.

Before execution, independently verify the named secret locations and absence of same-name repository/organization fallbacks. A `secrets.NAME` reference or a matching value cannot prove its storage origin. The runner must not claim otherwise. The owner keeps the selected input/fingerprint pair unchanged from final review through job startup; workflow concurrency and exact context checks prevent a mixed or stale pair from being used for another run.

GitHub limits each secret to 48 KB. Apply a conservative **48,000 UTF-8 byte** transport cap to each raw plan/resume; retain the separate 1 MiB private recovery limit. Before bootstrap can create anything, prove a source-derived conservative bound for the eventual owner-mediated bootstrap recovery/resume also fits this transport. Check actual inputs again before each phase. Unsupported sizes stop before mutations; no truncation, automatic splitting, extra secret fragments or alternate delivery channel. [GitHub secret limits](https://docs.github.com/en/actions/reference/security/secrets)

## Execution sequence and refusal policy

1. The secret-free verifier checks manual dispatch on `main`, exact reviewed source ancestry and the same four required source jobs. Setup reruns are refused unless the actual workflow attempt is `1`. The present unconditional `SETUP_PREREQUISITES_UNPROVED` refusal remains before environment jobs until the remaining parent Task 13 readiness implementation passes review.
2. Once later readiness permits execution, complete the reviewed same-source staging build and verify its immutable identity. Any existing build approval is separate from approval of the setup job. The owner does not finalize setup inputs until the required build and prerequisite evidence are available.
3. Hold the setup job at the verified environment gate. The owner reviews its repository, workflow, run ID, attempt, candidate SHA, phase, campaign and recipient; privately prepares the exact plan and, for complete, exact resume; independently approves their full fingerprints; and manually saves the matching environment values. No passwords, TOTP secrets, raw roster or private documents enter dispatch inputs, logs, chat or shared artifacts.
4. After the owner approves that particular job, install tooling before injecting private inputs. Validate the approved fingerprints, actual execution context, expiry and prerequisites. Missing, stale, cross-run, mismatched or oversized inputs stop without fallback. Do not print raw inputs/errors or infer authority from a digest-shaped string.
5. Preserve the initial encrypted-file upload and immutable artifact-ID/archive-digest/ciphertext-digest barrier before every possible first mutation. Inject the dedicated broad setup key only into the narrowly scoped setup path; ordinary app operations still use caller JWTs. Neither a manual approval nor a fingerprint unlocks an unconditional source guard.
6. Validate and encrypt the terminal receipt together with the latest private checkpoint state, including any recoverable MFA enrollment delta, into one exact create-new final file. Upload only the enumerated encrypted file with one-day retention. An earlier result checkpoint is not the terminal success receipt. Missing final persistence/upload, cancellation or ambiguous remote outcome remains uncertain; do not retry creation or claim durable completion.

Disallow setup workflow reruns, including partial-job reruns. A fresh dispatch needs a new execution-specific owner review; it is not permission to replay a partial or unknown foundation. Preserve the existing no-adoption/no-repost and independent reconciliation rules. An expired plan, denied approval, failed build or cancelled waiting job authorizes no setup request.

## Source scope and acceptance

The remaining workflow implementation is confined to the existing staging workflow, focused setup tests, staging audit/run instructions, and `scripts/drawing-cutover-provision.ts` for its private final-handoff wiring. These are already within the approved setup/recovery file set. Preserve the public CLI options, shared plan/receipt/resume schemas, encryption/AAD, real transport guards and drawing-acceptance guard. Do not change migrations, grants, package payloads, ownership classifications, application/Edge code or production assets.

The updated implementation plan must test actual workflow input/gate behavior, phase-specific environment-only bindings, correct full-byte fingerprints and actual run context, setup rerun refusal, size boundaries before any write, secret isolation, the initial upload barrier, terminal encryption/upload and uncertainty on failed/cancelled handoff. It must reject a self-computed approval digest, stale/mixed inputs and attempts to use manual approval as a readiness bypass. Reuse the reviewed crypto/factory and run one serialized broad source verification at the final freeze; do not rerun completed work merely to regenerate evidence.

Fresh source review precedes real custody/key generation, private input entry, main integration, workflow dispatch and staging operations. Configure and verify the approved environment gate only after its implementation-plan and relevant source-review gates; never test it by enabling an incomplete setup path. No automated private-secret entry is authorized.

Actual PostgreSQL concurrency, installed dependency/maintenance and no-email closure, health, exact immutable build/source proof and all remaining drawing/fab acceptance scenarios remain required. This amendment does not complete parent Task 13, approve the exact production package, authorize SQL application or deploy an app. The existing manual shared-database process and all five production release gates remain in force. Drawing Control simplification follows completed cutover and staging acceptance.
