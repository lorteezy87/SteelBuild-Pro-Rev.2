# Security audit completion work plan

Continuation requested by the owner on October 8, 2026 (America/Phoenix).
Starting commit: `997b7f6b6bd774e1f7741702e4ee04c7de224924` on
`codex/security-membership-revocation`. The canonical findings and closure
criteria remain in [TECH_DEBT](../../TECH_DEBT.md). This plan is execution
tracking, not evidence that a finding is fixed or deployed.

## Implementation order

1. **Highest-risk authoritative boundaries:** DB-9 and SBSEC-04 mailbox
   credentials/sender verification; RLS-5 project-scoped files; RLS-3 creation
   caps and SBSEC-07 event provenance. Three independent implementation streams
   own these boundaries; integration, CI/manifest classification and evidence
   remain with the main session.
2. **Identity and asynchronous work:** AUTH-7 desktop connection consent and
   request/session binding; AUTH-5 callback handling; AUTH-8 fresh proof;
   remaining AUTH-6 continuations and shared-device data. Preserve the verified
   recovery, enrolled-MFA and membership protections.
3. **Abuse and content boundaries:** EDGE-9 atomic accounting, bounded provider
   work/request bodies and safe failures; SEC-1 through SEC-5 exports, links,
   email rendering/attachments and IFC decompression; WEB-1 through WEB-4 cache,
   loader recovery and CSP compatibility.
4. **Residual database and release controls:** safe feature-flag projections,
   intended sequence allocation, immutable membership/provenance, archived
   writes, dependency/CI pinning and publisher restrictions. Changes to shared
   or owner-approved workflows require their actual positive-control tests.
5. **Integration and release evidence:** targeted negative and positive cases,
   independent review, full local gates, exact candidate/artifact identifiers,
   then staging and effective hosted configuration verification. Document
   device, provider and disaster-recovery evidence that source tests cannot
   establish.

## Implementation rules

- Tests exercise the actual SQL, handler or component, including unauthorized,
  revoked, cross-project and failure cases and the legitimate workflow.
- Existing mail metadata cannot automatically become a trusted sender binding.
  Ambiguous historical storage paths cannot automatically gain project access.
- Do not invent commercial plan limits, expand privileges to make a test pass,
  weaken drift classification, or bypass another active claim.
- Generate candidate filenames through the CLI. No bulk database push, MCP
  migration application, ledger repair or unreviewed shared-database replay.
- Mark source corrections Ready with their release requirements. Close a
  production finding only after the specified acceptance evidence exists.

## External acceptance boundaries

The existing staging branch is `ndyfjffsulfbwpmwdmic`; the production parent is
`kjrwqagyeswwoxpjkcko`. A current read confirms both are active. Their historical
MIGRATIONS_FAILED branch label still describes initial automated replay, not
proof that the manually restored database is unusable.

Production publishing follows the repository's explicit deployment instruction
and gated release process. Hosted Auth settings, environment credentials,
provider verification, real multi-connection behavior, signed native builds
and database-plus-files recovery require their own evidence; no local suite
substitutes for those checks.
