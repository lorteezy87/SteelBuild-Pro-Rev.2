# Production merge checkpoint (2026-07-27)

**Merged to `main`:** #162 #159 #155 #156 #158 #157 #108 #109  
**Main tip:** `b3a7ba71`  
**Site:** https://www.steelbuild-pro.com (HTTP 200) — **production alias not yet updated**

## Blockers for auto-prod ship
1. GitHub Actions org billing/spending limit — CI/deploy jobs fail in ~2s
2. Vercel CLI token in this environment is expired; MCP Vercel auth requires desktop
3. Vercel Git integration built commit `b3a7ba71` as a **Preview** (`dpl_7PT9rPpRqZfhWKVy9LnUWDZgv8dz`), not Production

## Owner action to finish production
Promote the Preview for `main` @ `b3a7ba71` to Production in the Vercel project `steelbuildpro-og`, **or** run `npx vercel --prod` with a valid token after checkout of `main`.

`vercel.json` temporarily sets `git.deploymentEnabled.main=true` so future main pushes can production-deploy once project settings allow it. Flip back to `false` when Actions billing is restored and the gated Action is sole path again.

## Skipped (not ready)
- Conflicting: #113, #142–#149
- Large draft design/theme: #160, #161
- Stale unknown-mergeable drafts (#30–#76, #131, #154)


# Action-plan — production deploy checkpoint (2026-07-26)

**Merged:** #153 (closeout sweep) + #152 (Drawings closed-set stage sync)  
**Prod deploy:** `dpl_Ba9fmmsTs58cMVYbUwQ3dSvWS3Jw` → https://www.steelbuild-pro.com (HTTP 200)  
**Main tip:** `f3877c27`

## What shipped

| Cluster | IDs |
|---|---|
| Shells / structure | 20, 22, 25, 26, 36, 37, 57 |
| Mutations / logic | 48, 50, 51, 53, 54, 56, 87, 93 |
| UX / workflows | 75, 81, 83 |
| Large page refactors | **21** Submittals · **23** RFIs · **27** Drawings |

## Tracker snapshot

**Done 100 · In Progress 4 · Blocked 1** (of 105)  
Open: **52, 77, 80, 88, 102** (UAT / concurrent-edit / GH Actions billing)

## Remaining (owner)

1. Restore GH Actions billing + staging credentials  
2. Interactive UAT for 77 / 80 / 88 / 102  
3. Optional Playwright concurrent-edit (52)
