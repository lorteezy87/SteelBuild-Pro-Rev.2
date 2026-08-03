# SteelBuild Pro — Complete Workflow Audit

**Date:** 2026-07-26  
**Branch:** `cursor/workflow-audit-2696`  
**Auditor:** Cursor Cloud Agent (App workflow audit)  
**Method:** Code-path review + existing Vitest/E2E inventory + targeted repair of confirmed local defects. Staging/live mutation E2E remains owner-gated (`E2E_MUTATIONS_ENABLED`).

---

## 1. Executive summary

The **P0 fabrication moat** (drawings → submittals → RFIs → fab release → piece register) is structurally sound in source: dual-source drawing/submittal authority is documented, fab-release is server-gated, piece-control KPIs use leaf lots, and prior broken-workflow repairs (cost codes, contract sync, CO edit/delete, closeout checklist) are already landed.

This audit **confirmed viable** the P0/P1 domain engines under unit tests (223+ targeted tests green in this session) and **repaired** shared mutation-lifecycle defects that made deletes/bulk edits look finished before writes settled. Remaining items that need staging credentials, Stripe wiring, or storage migration are listed under **Further review** — not marked resolved.

| Band | Count | Disposition |
|---|---|---|
| Confirmed viable (local evidence) | 12 workflows | Keep; no source defect found |
| Repaired this session | 5 defect classes | Code + tests in this branch |
| Further review / owner-staging | 11 items | Tracked in §5 |

---

## 2. Workflow inventory & viability

### P0 — confirmed viable (local)

| Workflow | Entry | Evidence | Notes |
|---|---|---|---|
| Auth / org boundary | `/Landing`, `/Onboarding`, `/OrgMembers` | Unit: org onboarding; E2E smoke shell | Live login needs local Supabase user |
| Getting-started moat | Dashboard checklist → Drawings/Submittals/RFIs/FabRelease | `gettingStarted` + checklist tests | Fail-safe hide on load error (by design) |
| Drawing lifecycle | `/Drawings`, `/DrawingSubmittalHub`, viewer | Cohesion + stage-mapping tests; daily E2E render | Submittal is workflow SoT; `drawings.stage` fallback only |
| Submittal R&R / OFS / IFC | `/Submittals` | Extensive `submittal*` suite; daily E2E render | Comment dispositions gate OFS/IFC |
| RFI create / downstream | `/RFIs` | `rfi*` tests; daily E2E render; RPC sequencing | Downstream actions user-confirmed |
| Fab release gate | `/FabRelease`, export modal | `releaseStatus` tests; `e2e/fab-release-gate.spec.ts` | Mutation E2E fixture-gated |
| Piece register / ship / erect | `/PieceRegister` | pieceControl suite; `e2e/piece-control-pilot.spec.ts` | Leaf-lot KPI rule; exact-mark ship |

### P1 — confirmed viable with caveats

| Workflow | Entry | Evidence | Caveat |
|---|---|---|---|
| Schedule / reparent / bulk | `/Schedule`, `/ScheduleHub` | cascade/gatekeeper tests | Bulk confirm close repaired; no mutation E2E |
| Change orders | `/ChangeOrders` | payload + control-center tests | Prior repair landed (`#112`) |
| Cost / SOV / pay apps / margin | `/CostHub`, `/SOV`, … | costRollup, marginRisk, payapp tests | Stripe live checkout unverified |
| Closeout checklist | `/ProjectCloseout` | checklist RTL + payload tests | Metadata mapping must stay explicit |
| Documents / DMS honesty | `/Documents`, Integrations | `sharepointSyncHonesty` tests | Sync Now correctly reports unavailable |
| Alerts center | `/AlertsCenter` | `generateAlerts` fail-closed | Refresh reloads rows only (no scan EF) |
| QC / inspections / punchlist | Field pages | Field/offline unit coverage | Offline outbox app-wide |
| Email inbox | `/EmailInbox` | email service tests | Edge deploy needs staging |

### P2 — smoke / admin

Contacts, Vendors, Settings, Feature Flags, Calculators — CRUD patterns present; Contacts edit/delete lifecycle repaired in this branch. Billing UI exists; Stripe go-live remains owner checklist.

---

## 3. Defects repaired this session

| ID | Severity | Defect | Repair |
|---|---|---|---|
| WA-01 | P1 | `DeleteDialog` closed on Action click before mutation success | Await `onConfirm`; close only on resolve; busy lock |
| WA-02 | P1 | Submittal/RFI/Contact deletes used fire-and-forget `mutate` | Switched to `mutateAsync` + busy |
| WA-03 | P1 | RFI bulk edit closed before writes settled | `mutateAsync` then close; modal awaits submit |
| WA-04 | P2 | Schedule bulk parent/delete closed optimistically | Close only after `mutateAsync` success |
| WA-05 | P1 | `functions.invoke('agentMemory')` silent null success; LLM catch returned `error: null` | Fail-closed throw / error-shaped LLM payload; `pmaRemoval` scans `functions.ts` |

---

## 4. Test evidence (this session)

```
vitest — DeleteDialog + functions.invoke + prior moat suites: PASS
  (core moat sample 63; domain engines 160; plus new DeleteDialog/functions cases)

Prior E2E (fixture-gated, not re-run without credentials):
  e2e/daily-workflow.spec.ts — register render smoke
  e2e/fab-release-gate.spec.ts — server gate
  e2e/piece-control-pilot.spec.ts — lifecycle
```

---

## 5. Further review (needs owner / staging / follow-up)

Copy into remediation tickets; do not treat as fixed by docs alone.

1. **B41-P1-001** — Legacy flat `app-files/uploads/...` cross-project read residual (775 objects); owner Storage copy + backfill + policy cutover.
2. **B41-P1-002** — Staging DB/migration alignment (feature-flag seeds etc.).
3. **B41-P1-003** — Edge Function deploy/secrets (`llm-proxy`, email-*, stripe-billing, project-export); delete deprecated sharepoint/bluebeam proxies.
4. **B41-P1-004** — Critical staging smoke + mutation fixtures (`E2E_MUTATIONS_ENABLED`).
5. **B41-P1-005** — Branch protection (GitHub plan).
6. **B41-P1-006** — Backup/rollback readiness evidence.
7. **Stripe go-live** — Live webhook + test-mode checkout; 0 `billing_events` historically.
8. **Legal pages** — ToS/privacy/DPA before public signup (legal hold in CLAUDE.md).
9. **Org → project access model** — decide auto-see-all-org-projects vs explicit `user_projects`.
10. **Submittal aging ActionItems** — `ensureCriticalAgingActionItems` swallows failures; consider operator-visible toast when R&R/OFS notifications fail.
11. **Remaining DeleteDialog callers** — many pages still pass `mutate` (Warranty, Punchlist, QC, Safety, Vendors, SOV, …). Shared dialog is fixed; migrate callers to `mutateAsync` incrementally so failed deletes keep the dialog open.

---

## 6. Intentionally not bugs

- SharePoint “Sync Now” honest unavailable toast (`sharepointSyncHonesty`).
- Alerts Center Refresh = reload only (no `generate-alerts` EF).
- Retired PMA/chat UI (guarded by `pmaRemoval.test.ts`).
- Canonical Piece Register (not CanonicalPieceDashboard).
- `command_ui` light Control Centers are intentional (owner lock).

---

## 7. Recommended next agent slices

1. Sweep remaining `DeleteDialog` `mutate` → `mutateAsync` callers (item 11).
2. Surface aging-trigger failures to operators (item 10).
3. Owner-run staging checklist for B41-P1-001…006 + Stripe.
