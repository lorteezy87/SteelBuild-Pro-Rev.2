# SteelBuild Pro

## Stack
Vite, React 18, TypeScript, Supabase (project: kjrwqagyeswwoxpjkcko), Tailwind, Vercel.

Data layer: import `entities`/`auth`/`integrations`/`functions`/`getSignedUrl` from `@/api/supabaseClient` — a thin re-export barrel. The implementation lives in `src/api/client/*` domain modules (entities, auth, storage, uploads, llm, functions, entityClient, fieldMapping, …), not inline in supabaseClient.ts.

## Commands
- `npm run dev` — local dev server
- `npm run lint` — lint (must be clean before commit)
- `npm run test` — full test suite (2,454 tests as of v2.1.1 baseline)
- `npm run build` — production build

## Design system: SteelBuild dual theme
- Colors: CSS variables only (`var(--bg-*)`, `var(--text-*)`, `var(--accent)`, `var(--cmd-*)`, `var(--sbd-*)`). Never hardcode surface/text/border hex in components.
- Dark: SteelBuild Dark (`data-theme="dark"` + `html.steelbuild-dark`); accent gold `#C89B20` / `#E0B030`.
- Light: `[data-theme="light"]`; command Control Centers use `[data-skin="command"]` with `--cmd-*` (dark remap aliases SteelBuild Dark).
- Fonts: Barlow Condensed (display), Inter (body), IBM Plex Mono (numeric/code).
- Radius: use the shipped token/component radii for each kit; do not reintroduce a fake 2px-only rule.
- Theme preference: `sbp-theme` in localStorage, else `prefers-color-scheme`.
- Never use `<form>` tags. Never use Radix Dialog.

## Database / RLS
- All tables must have RLS enabled with explicit per-role policies. No blanket-`true` policies.
- Check `auth_rls_initplan` pattern on any new policy — wrap `auth.uid()` calls in `(select ...)`.
- SECURITY DEFINER functions must set `search_path` explicitly.
- Known-fixed classes of bugs (do not reintroduce): feature_flags privilege escalation, vendors blanket-true policies.

## Number-sequence integrity — DO NOT regress
Official record numbers (RFI/CO/submittal/…) come ONLY from the atomic DB RPC `get_next_sequence_number` — never derive the next number client-side. `src/components/shared/numberSequencing.jsx` once floored the RPC with a client-side `Math.max()`, which could mint duplicate numbers under concurrency; that was removed (fixed c5612168) — `getNextFormattedNumber` now re-allocates from the RPC until it clears any existing records, and fails closed if the RPC is unavailable. Keep it RPC-only. Gated by a hook (see `.claude/hooks/`).

## MCP server
`steelbuild-mcp-server` — 18 tools across portfolio/coordination/commercial/logistics domains. Authenticates via user JWT so RLS applies automatically. Don't bypass this with service-role calls in application code.

## Workflow rules
- Employment/IP conflict with S&H Steel is unresolved — do not add billing, multi-tenant signup, or public marketing copy without being told this has cleared legal review.
- Before touching Stripe/webhook code: idempotency is already implemented, don't remove it.
- Playwright E2E spec for the fab-release gate must stay green — this is a P0 path.

## What NOT to put in this file
Anything procedural (audit checklists, migration steps, RFI Copilot testing flow) belongs in `.claude/skills/`, not here. If Claude already does something right without being told, delete the line.
