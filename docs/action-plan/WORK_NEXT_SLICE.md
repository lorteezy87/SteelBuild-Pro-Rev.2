# Action-plan — closeout sweep checkpoint (2026-07-26)

**Branch / PR:** `cursor/action-plan-closeout-sweep-d3a1` → #153  
**Prior prod:** #139–#151 → https://www.steelbuild-pro.com

## Closed this sweep

**21 tracker IDs → Done**, including hygiene docs/tests **and** major page extracts:

| Cluster | IDs |
|---|---|
| Shells / structure | 20, 22, 25, 26, 36, 37, 57 |
| Mutations / logic | 48, 50, 51, 53, 54, 56, 87, 93 |
| UX / workflows | 75, 81, 83 |
| Large page refactors | **21** (Submittals ~756), **23** (RFIs ~393), **27** (Drawings ~886) |

## Tracker snapshot

**Done 100 · In Progress 4 · Blocked 1** (of 105)  
Open: **52, 77, 80, 88, 102**

## Remaining (cannot close without owner/UAT)

| ID | Why |
|---|---|
| **52** | Concurrent-edit E2E |
| **77** | RFI field UAT |
| **80** | Schedule / look-ahead field UAT |
| **88** | Cross-page project-switch interactive UAT |
| **102** | Full UAT blocked on staging + GH Actions billing |

## Next (owner)

1. Restore GH Actions billing / staging credentials  
2. Run interactive UAT checklist (ties 77/80/88/102)  
3. Optional Playwright for concurrent-edit (52)
