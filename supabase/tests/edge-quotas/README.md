# Private Edge operation accounting — local release candidate

This package executes `20261008235532_private_atomic_edge_operation_quotas.sql`
against PGlite 0.5.8. Run `npm ci --ignore-scripts` then `npm test` here. No
hosted SQL, deployment, provider requests, or customer data are involved.

## Contract

`reserve_edge_operation` writes a private scope revision, checks usage, and
inserts the unique operation in one transaction. It returns permission for one
dispatch only after the insert commits. A real scope write serializes contenders
at READ COMMITTED and causes a stale REPEATABLE READ/SERIALIZABLE contender to
fail serialization. Clients have no access to the schema or RPCs; only the
service role can call the three RPCs, without direct private-table access.

Email sends are counted per authenticated user over one rolling hour. LLM calls
are counted and cost-reserved per user over 24 hours. Inbound paid classification
is counted per project over 24 hours. Deleting correspondence or telemetry cannot
remove these reservations. Authentication, MFA, project authorization and verified
mailbox resolution still happen before reservation/replay. Service RPC access
alone is not a substitute for those entrypoint checks.

A repeated key with identical content returns its completed result for 24 hours.
Changed content conflicts. Pending, unknown, and older completed operations never
automatically dispatch again, even after the accounting window ages out. Provider
timeouts, malformed responses, and lost completion acknowledgements retain the
reservation. Known usage settles the reserved cost; missing usage retains the
full amount. These are at-most-one-dispatch controls, not an exactly-once provider
guarantee: a worker can fail after reservation but before dispatch. Operators must
check the provider before resolving an ambiguous operation. There is deliberately
no automated reset/refund/redispatch endpoint.

Public correspondence insertion and attachment uploads are separate effects.
The inbound paid-classification key prevents repeated paid classification; it
does not make inbound correspondence/storage insertion exactly-once. The existing
message-ID deduplication remains best effort. Manual forwards without a provider
message ID use a deterministic classification-content digest. Providers should
supply their stable message ID for distinct deliveries.

## Configuration and coordinated release

1. Review and manually apply/stamp the candidate using repository migration
   policy. Do not use `db push`, migration repair, or automatic deployment.
2. Review/apply the separate private-mailbox candidate and explicitly verify
   mailbox bindings before releasing the mail handlers. See `../private-email`.
3. Release clients that send `Idempotency-Key` together with the handlers. Older
   email/LLM callers fail closed with HTTP 400. Compose, reply, and RFI nudge retain
   a key for the unchanged open draft; changed drafts/new modal sessions get a
   new key. AI automatic transport retries keep one key throughout the loop.
4. Confirm actual secrets: `EMAIL_SEND_HOURLY_LIMIT` defaults to 100;
   `EMAIL_CLASSIFY_DAILY_LIMIT` defaults to 200. `LLM_DAILY_REQUEST_LIMIT` and
   `LLM_DAILY_COST_LIMIT_USD` default to 0 (disabled), preserving existing explicit
   configuration behavior. **LLM spending is not bounded until operators configure
   nonzero caps.** Zero explicitly disables a dimension; negative, blank,
   whitespace, nonnumeric, infinite, and fractional count caps fail closed.
   Decimal nonnegative cost caps are supported. Classifier configuration/ledger
   failures fall back to free regex; sends/LLM return a denial before dispatch.
5. Keep provider account/project billing limits and alerts. These quotas are
   per-user/per-project application controls, not a global provider budget, and
   separately authorized operations with new keys are intentional new requests.

## Cost and request bounds

LLM reservations conservatively price the model's entire supported context plus
the allowed output ceiling. They do not estimate tokens from JSON byte length;
images and PDFs invalidate that estimate. Provider context limits without beta
headers bound the admitted request. Prices/context were checked on 2026-10-08:
[OpenAI model documentation](https://developers.openai.com/api/docs/models),
[Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing),
[Sonnet 4.5](https://platform.claude.com/docs/en/models/sonnet-4-5/overview),
[Haiku 4.5](https://platform.claude.com/docs/en/models/haiku-4-5/overview), and
[Opus 4](https://www.anthropic.com/claude/opus).

The unsupported `claude-haiku-4` entry with inaccurate pricing is replaced by
the documented `claude-haiku-4-5` ($1/$5 per million input/output tokens). No
existing repository caller used the removed ID. Native separately billed server
tools and prompt cache controls are rejected. Custom JSON function tools remain
supported. Reverify vendor model availability, context, and prices before release
and whenever the allowlist changes; provider pricing changes are outside SQL's
control. Missing/invalid usage is not treated as free.

Incoming streams are bounded before JSON or multipart materialization: 30 MiB
outbound email, 40 MiB inbound email, 24 MiB LLM. Reading has a 15-second deadline.
Shared HTTP deadlines cover both fetch and response consumption; LLM providers
have 60 seconds/256 KiB responses, classifier 20 seconds/64 KiB, ledger 5 seconds,
and other touched mail/LLM HTTP calls 10 seconds by default. Aborting a request
does not prove a provider canceled its effect. Multiple sequential attachment
operations are individually bounded; this is not a single end-to-end deadline.

Untrusted inbound flag mode retains reviewable text, no HTML/attachments, and
uses regex only. Trusted attachments go through `classifyAttachmentContent` before
publication: active HTML/SVG/XML and mismatched signature formats are rejected;
recognized passive signatures use the admitted MIME; other accepted construction
formats use `application/octet-stream`. Uploads request attachment disposition.
This is admission, not malware scanning, archive inspection, or retroactive
cleanup. Existing stored objects and provider download-header persistence require
separate hosted review; the current inbox renders attachment names, not links.

## Retention and erasure

Private result bodies may contain correspondence/AI output. Replay stops after
24 hours. Physical deletion of unaccessed cached bodies needs a reviewed recurring
operator schedule calling `purge_edge_operation_results(500)` until it returns
zero; the function clears expired bodies only and never removes accounting or
idempotency tombstones. **No hosted schedule is installed by this candidate.**
Choose and monitor its interval explicitly; elapsed replay eligibility is not
proof of physical purge. Project erasure clears associated cached bodies and permanently
marks the operation so late completion cannot restore them. User erasure deletes
the user's operations. LLM requests without a project ID have no project association
for erasure; their result bodies remain subject to user erasure and cache purge.
Empty scope rows and classifier tombstones retain only
opaque IDs/accounting metadata and need an approved long-term retention policy.

## Verification and remaining acceptance

PGlite covers actual candidate SQL, ACLs, scope revision writes, cap checks,
rollback, replay/conflicts, unknown outcomes, cost settlement, purge and erasure.
Its single connection serializes submitted queries: it does **not** prove real
overlapping PostgreSQL transaction behavior. Before hosted release, exercise two
connections against the applied schema at READ COMMITTED and REPEATABLE READ,
including an existing scope row, forced insert failure, and final count=1. A
serialization failure must deny dispatch, then a same-key retry may recheck.

Vitest executes actual handlers/provider adapters with remote HTTP substituted;
it does not prove provider delivery, deployed JWT settings, actual secrets,
provider pricing acceptance, hosted contention or scheduled retention. Review
those separately. No live closure is claimed by these local results.
