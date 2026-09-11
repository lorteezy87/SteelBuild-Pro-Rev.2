# Module implementation ledger

Binding brief: [MASTER_BUILD_PROMPT.md](MASTER_BUILD_PROMPT.md).

Target: existing SteelBuild Pro Rev 2; branch `codex/module-foundation`.
Baseline: `36a974289` (origin/main, 2026-09-11). PRs #331 and #332 are separate,
open work; their capabilities are not assumed to exist on this baseline.

Existing features are retained. `not_started` below means not yet audited against
this new acceptance contract, not that the existing app lacks that feature.
Exactly one module is active. Later modules remain pending until M0 is verified.

| Module | State | Commit | Schema evidence | Logic/API evidence | Browser flow | Remaining blocker |
|---|---|---|---|---|---|---|
| M0 — Application shell and verification foundation | active | `984768f80` / [PR #333](https://github.com/lorteezy87/SteelBuild-Pro-Rev.2/pull/333) | No schema change in M0; DB helper checks pass | [M0 evidence](M0_FOUNDATION.md): 4,909 tests and all local code gates pass | 6 local Playwright checks pass; authenticated preview pending | New PR CI/preview; signed-in shell and publisher verification |
| M1 — Authentication and workspace membership | not_started | — | — | — | — | Preceding module gate |
| M2 — Projects, project roles and operational settings | not_started | — | — | — | — | Preceding module gate |
| M3 — Drawing sets, intake manifest and register | not_started | — | — | — | — | Preceding module gate |
| M3.1 — Title-block templates, extraction and rescan | not_started | — | — | — | — | Preceding module gate |
| M3.2 — PDF viewer, navigation and calibrated measurement | not_started | — | — | — | — | Preceding module gate |
| M3.3 — Revision-bound markups and annotation persistence | not_started | — | — | — | — | Preceding module gate |
| M3.4 — Revision publication, history and deterministic compare | not_started | — | — | — | — | Preceding module gate |
| M3.5 — Sheet-level Holds & Blockers | not_started | — | — | — | — | Preceding module gate |
| M3.6 — GC/contract drawing register and shared document picker | not_started | — | — | — | — | Preceding module gate |
| M4 — Submittal rounds, responses and approval workflow | not_started | — | — | — | — | Preceding module gate |
| M4.1 — Release packages and transmittal snapshots | not_started | — | — | — | — | Preceding module gate |
| M5 — Detailing Control Center integration | not_started | — | — | — | — | Preceding module gate |
| M6 — RFI lifecycle and selected hold resolution | not_started | — | — | — | — | Preceding module gate |
| M7 — Server-enforced fabrication release gate | not_started | — | — | — | — | Preceding module gate |
| M8 — Work packages and drawing/RFI scope | not_started | — | — | — | — | Preceding module gate |
| M9 — Canonical piece lots, imports and protected lifecycle | not_started | — | — | — | — | Preceding module gate |
| M9.1 — Detailing and piece data-completeness validation | not_started | — | — | — | — | Preceding module gate |
| M10 — Project schedule and dependency engine | not_started | — | — | — | — | Preceding module gate |
| M10.1 — Baselines, actuals and lookahead | not_started | — | — | — | — | Preceding module gate |
| M11 — Deliveries, loads and field receipts | not_started | — | — | — | — | Preceding module gate |
| M12 — Procurement and material commitments | not_started | — | — | — | — | Preceding module gate |
| M12.1 — Shop planning and production coordination | not_started | — | — | — | — | Preceding module gate |
| M13 — Daily field reports, labor/equipment/material and photos | not_started | — | — | — | — | Preceding module gate |
| M13.1 — Field offline outbox and reconciliation | not_started | — | — | — | — | Preceding module gate |
| M14 — Punch lists and quality inspections | not_started | — | — | — | — | Preceding module gate |
| M14.1 — Safety observations and incident records | not_started | — | — | — | — | Preceding module gate |
| M15 — Cost codes, budgets and schedule of values | not_started | — | — | — | — | Preceding module gate |
| M16 — Change requests and change orders | not_started | — | — | — | — | Preceding module gate |
| M17 — Pay applications and retainage | not_started | — | — | — | — | Preceding module gate |
| M18 — Backcharges and time-and-material tickets | not_started | — | — | — | — | Preceding module gate |
| M19 — Expenses and actual cost capture | not_started | — | — | — | — | Preceding module gate |
| M19.1 — Contracts and commercial commitments | not_started | — | — | — | — | Preceding module gate |
| M20 — Subscriptions, entitlements and billing | not_started | — | — | — | — | Preceding module gate |
| M21 — Configurable feature availability | not_started | — | — | — | — | Preceding module gate |
| M22 — Exports, retention and deletion workflows | not_started | — | — | — | — | Preceding module gate |
| M23 — Observability, support diagnostics and service health | not_started | — | — | — | — | Preceding module gate |
| M24 — Shared AI gateway and job protocol | not_started | — | — | — | — | Preceding module gate |
| M25 — Assisted document extraction | not_started | — | — | — | — | Preceding module gate |
| M25.1 — Revision impact intelligence | not_started | — | — | — | — | Preceding module gate |
| M25.2 — Assisted imports and reconciliation | not_started | — | — | — | — | Preceding module gate |
| M26 — IFC viewer and canonical model status | not_started | — | — | — | — | Preceding module gate |
| M27 — Operational command center and alerts | not_started | — | — | — | — | Preceding module gate |
| M28 — Portfolio and executive reporting | not_started | — | — | — | — | Preceding module gate |
| M29 — Closeout and warranty | not_started | — | — | — | — | Preceding module gate |
| M30 — Project risk and exposure register | not_started | — | — | — | — | Preceding module gate |
| M31 — Contacts, vendors and project directory | not_started | — | — | — | — | Preceding module gate |
| M31.1 — Project documents, notes and search | not_started | — | — | — | — | Preceding module gate |
| M32 — Operational calculators | not_started | — | — | — | — | Preceding module gate |
| M33 — Email delivery and communication records | not_started | — | — | — | — | Preceding module gate |
| M33.1 — External file and business-system connectors | not_started | — | — | — | — | Preceding module gate |
| M34 — Resource and crew capacity planning | not_started | — | — | — | — | Preceding module gate |
| M35 — Responsive field acceptance and performance | not_started | — | — | — | — | Preceding module gate |
| M35.1 — Recovery rehearsal and final integrated release gate | not_started | — | — | — | — | Preceding module gate |
