# Security & Compliance Assurance Pack

**SteelBuild Pro**
Date: 2026-07-22
Finding: [M22] (no security/assurance collateral for enterprise buyers)

Purpose: a single reference for the artifacts enterprise/procurement teams request during a security review of a SaaS vendor. This is an **outline + working reference**, not a substitute for counsel-reviewed published documents (see owner-checklist H12/H13).

Refs:
- Production: `https://steelbuild-pro.com`
- Supabase project: `kjrwqagyeswwoxpjkcko` (region **us-east-1**)
- Storage S3 endpoint: `https://kjrwqagyeswwoxpjkcko.storage.supabase.co/storage/v1/s3`

---

## 1. Information Security Policy (1-page outline)

1. **Scope & ownership** — SteelBuild Pro (multi-tenant SaaS); operating entity `SteelBuild Pro LLC` (AZ, formation per owner-checklist M51); security owner: the owner (nickl@shsteelaz.com).
2. **Data classification** — all customer project data is treated as **confidential** (contract values, budgets, costs, schedules, RFIs, submittals, drawings, change orders, field/QA/safety records, uploaded files, emails). No data is "public" by default.
3. **Access control** — RBAC with two layers (global `user_profiles.role`; project `user_projects.role` = owner/admin/pm/field/viewer). Least privilege; owner/admin MFA (owner-checklist H23).
4. **Tenant isolation** — enforced at the database (RLS) layer; the org boundary lives inside `user_has_project_access`, cascading to ~70 project-scoped tables. UI gates are defense-in-depth only; **RLS is authoritative**.
5. **Secrets management** — service-role keys and provider keys never reach the browser; all LLM/provider calls proxy through edge functions; deploy tokens scoped + rotated (owner-checklist M12).
6. **Change management** — CI-gated deploys (lint + typecheck + test + build must pass before Vercel deploy); branch protection on `main` (owner-checklist H6).
7. **Logging & audit** — append-only `activities` audit trail; Sentry error/perf monitoring with masked session replay (no readable project/financial content).
8. **Backup & DR** — see `backup-dr.md`.
9. **Incident response** — see `incident-response.md`.
10. **Vendor management** — subprocessors with executed DPAs (Section 4).
11. **Review cadence** — policy reviewed at least annually and after any SEV1.

---

## 2. Incident Response & Breach-Notification SLA

- Full process: `incident-response.md`.
- **Breach-notification SLA: 72 hours** from confirmation of a breach affecting customer data — notify affected orgs (and any legally required authorities), coordinated with counsel.
- Severity model: SEV1 (all-tenant down / data at risk / breach), SEV2 (major feature degraded), SEV3 (minor). Detection via uptime monitor + Sentry alerts. Blameless postmortem within 5 business days for SEV1/SEV2.

---

## 3. Backup & DR statement

- **Database (Postgres):** Supabase daily automated backups + Point-in-Time Recovery (PITR). Target **RPO 15 min / RTO 4 h**. Restore rehearsed on a recurring cadence (log in `backup-dr.md`).
- **Storage (`app-files`, `email-attachments`):** nightly offsite workflow is implemented with timestamped snapshots, a current mirror, exact verification, and a retained manifest. It is **not yet an operating control** until owner-managed secrets are configured and the first backup plus staging restore are recorded. Target **RPO 24 h / RTO 4 h**.
- Restore procedure and post-restore verification: `backup-dr.md`.

---

## 4. Vendor / Subprocessor list

| Subprocessor | Purpose | Data hosting region | DPA status |
|---|---|---|---|
| **Supabase** | Postgres DB, Auth, Storage, Edge Functions | US (project region **us-east-1**) | ☐ To execute (owner-checklist H12/H13) |
| **Vercel** | Frontend hosting / CDN / deploy | US | ☐ To execute |
| **Stripe** | Subscription billing / payments | US | ☐ To execute |
| **Sentry** | Error & performance monitoring (masked replay) | US | ☐ To execute |
| **OpenAI** | LLM inference (primary) | US | ☐ To execute · evaluate **ZDR** |
| **Anthropic** | LLM inference (fallback/router option) | US | ☐ To execute |

All subprocessors are **US-based**. Update this table as vendors change; enterprise customers should be notified of material subprocessor changes.

---

## 5. CAIQ-Lite outline (self-assessment skeleton)

Map answers to the CSA CAIQ-Lite domains. Starting posture:

- **Application & Interface Security** — RLS tenant isolation; input validation on uploads (`uploadValidation.ts` extension allowlist + size caps); CSP (moving to enforcing — owner-checklist M40).
- **Audit Assurance & Compliance** — append-only `activities` audit trail; SOC 2 Type I on roadmap (Section 7).
- **Business Continuity & Operational Resilience** — `backup-dr.md`; `incident-response.md`.
- **Change Control & Configuration** — CI gates; branch protection; migrations in git.
- **Data Security & Information Lifecycle** — data classified confidential; erasure path (org-delete fn + `hard_delete_project` RPC — to be wired, owner-checklist H11).
- **Encryption & Key Management** — TLS in transit; provider-managed encryption at rest (Supabase); secrets server-side only.
- **Governance & Risk Management** — this pack; annual review.
- **Identity & Access Management** — RBAC (5 project roles); MFA for privileged accounts (owner-checklist H23); leaked-password protection + CAPTCHA (owner-checklist M42).
- **Infrastructure & Virtualization** — managed PaaS (Supabase, Vercel); no self-managed servers.
- **Interoperability & Portability** — per-tenant data export (`project-export` edge fn, RLS-scoped + audited).
- **Threat & Vulnerability Management** — Sentry monitoring; external pen test planned (owner-checklist M53).

(Complete the full CAIQ-Lite question set before sharing with a prospect.)

---

## 6. SOC 2 Type I roadmap note

SOC 2 Type I (design of controls at a point in time) is the realistic near-term target. Several relevant controls are **already in place** and can be cited as evidence:

- **CI gates** — mandatory lint/typecheck/test/build before any production deploy (change-management control).
- **RLS tenant-isolation boundary** — access enforced at the DB, verified by live RLS probes (logical-access control).
- **Append-only audit logs** — `activities` trail (monitoring/audit control).
- **Error monitoring** — Sentry with masked replay (operations control).

Gaps to close for SOC 2 readiness: formal written policies (Section 1), MFA enforcement, backup restore evidence, vendor DPAs, formal access reviews, and an external pen test. Sequence: publish policies → enable MFA + auth hardening → complete one DR rehearsal → execute DPAs → engage an auditor for a readiness assessment, then Type I. (Type II — controls operating effectively over a period — follows once the above run for 3–6+ months.)

---

## 7. Offsite Storage backup implementation and evidence status

- Workflow: `.github/workflows/storage-backup.yml` (nightly and manual dispatch).
- Runner: `scripts/storage-backup.mjs` (server-only credentials, both required buckets, immutable snapshot, current mirror, checks, and manifest).
- Setup and restore acceptance: `storage-backup-setup.md`.
- Evidence status: **implementation verified by automated tests; operating effectiveness not yet verified**. H25 remains open until the first successful production-source backup manifest and staging restore record exist.
