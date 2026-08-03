# SDD ledger — plan: C:/Users/Nicholas/Documents/Codex/2026-08-02/can/outputs/steelbuild-planner-core-implementation-plan.md

Baseline: branch codex/steelbuild-planner-pwa at 0e7c6691ff7c78133af9205bf4bb09d786803a3c.
Baseline validation: npm test exposed 2 pre-existing failures in src/pages/resourceScheduling/__tests__/resourceSchedulingHelpers.test.ts, then produced no further output and was stopped after a bounded wait. Planner-focused tests and builds are authoritative for this plan.
Global exception: no task may commit, push, deploy, or apply remote migrations because the user did not authorize those actions.
Task 1: fix round 1/5 (3 addressed, 0 open — Planner aliases, build-output ignore, semantic heading; uncommitted working tree)
Task 1: complete (uncommitted working tree, scoped re-review clean)
Task 2: fix round 1/5 (3 addressed, 0 open — server-only audit insertion, replay safety, migration coverage; uncommitted working tree)
Task 2: complete (uncommitted working tree, scoped security re-review clean)
Task 3: fix round 1/5 (2 addressed, 0 open — normalized terminal states and strict date handling; alias finding disproved by exact command)
Task 3: complete (uncommitted working tree, scoped re-review clean; 14 focused tests)
Task 4: fix round 1/5 (1 addressed, 1 open — auth precedence/sign-out cleanup fixed; URL normalization remained)
Task 4: fix round 2/5 (1 addressed, 0 open — validated main-app origin and rendered onboarding destination)
Task 4: complete (uncommitted working tree, scoped re-review clean; 29 Planner tests)
Task 5: fix round 1/5 (3 addressed, 0 open — exact bulk cardinality and narrow repository result types)
Task 5: complete (uncommitted working tree, scoped re-review clean; 43 Planner tests)
Task 6: fix round 1/5 (2 addressed, 1 open — real Task Register route and valid markup fixed; sticky overflow remained)
Task 6: fix round 2/5 (1 addressed, 0 open — register-only horizontal overflow and sticky chrome)
Task 6: complete (uncommitted working tree, scoped re-review clean; 49 Planner tests)
Task 7: fix round 1/5 (4 addressed, 3 open — org/archive/modal/cross-project fixes; conflict rebase, bulk final state, CSV fidelity remained)
Task 7: fix round 2/5 (2 addressed, 1 open — archive retry, bulk final state, CSV fidelity; baseline rebase remained)
Task 7: fix round 3/5 (1 addressed, 0 open — dirty-field conflict baseline rebase)
Task 7: complete (uncommitted working tree, scoped re-review clean; 67 Planner tests)
Task 8: fix round 1/5 (5 addressed, 1 open — live registers, identity, timezone, filters; Task Register rollover remained)
Task 8: fix round 2/5 (1 addressed, 0 open — shared timezone rollover clock)
Task 8: complete (uncommitted working tree, scoped re-review clean; 79 Planner tests)
Task 9: fix rounds 1-4 plus final connectivity guard (all Critical/Important findings addressed; durable receipts, scoped replay, StrictMode-safe cleanup, exact RPC contract)
Task 9: complete (uncommitted working tree, independent final review PASS; 114 Planner tests; migration local and unapplied)
