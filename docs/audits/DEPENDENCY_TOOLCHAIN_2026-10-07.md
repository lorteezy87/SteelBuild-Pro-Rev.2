# Dependency toolchain security follow-up — 2026-10-07

The production dependency audit remains clear. The complete dependency audit
fell from 16 findings (11 high, 5 moderate) to 5 high findings. Those five are
one unresolved `braces` vulnerability and the packages that inherit it. No
advisory has been suppressed, accepted, or excluded from the audit.

## Changes and compatibility evidence

| Dependency path | Change | Reason and verification |
| --- | --- | --- |
| `depcheck` → `js-yaml` → `argparse` → `sprintf-js` | Remove unused `depcheck` | No application, script, CI, or configuration calls Depcheck. Its archived upstream explicitly recommends Knip, which is already installed and configured here. `knip --version` still reports 6.21.0. This removes the unpatched `sprintf-js` path and 54 packages including Depcheck. |
| `wrangler` → `miniflare` → `sharp` | Override only Miniflare's Sharp to 0.35.5 | Patch release addresses the vulnerable bundled librsvg dependency. Its platform packages and libvips packages update with it. Node 24 smoke checks decode an SVG and resize it to PNG both directly and through Miniflare's Images binding. |
| `wrangler` → `miniflare` → `undici` | Override only Miniflare's Undici to 7.29.1 | Patch release fixes the HTTP, TLS, cache, and WebSocket advisories in 7.29.0. A local Miniflare Worker handles GET and image POST requests successfully using the patched dependency. Wrangler remains 4.131.0 and its CLI starts successfully. |
| `tailwindcss` → `postcss-selector-parser`, including its `postcss-nested` dependency | Override only Tailwind's parser to 7.1.6 | Fixes quadratic selector parsing. Version 7 changes safe insertion during AST iteration, so compatibility was checked rather than inferred from a clean audit. The actual `src/globals.css` import tree and a fixture exercising important selectors, `@apply`, responsive, hover, dark, group, peer, data-attribute, pseudo-element, and arbitrary variants compile to identical bytes under 6.1.4 and 7.1.6. |

The lockfile version changes are limited to the three overridden packages and
Sharp's platform/libvips packages. React, Vite, Tailwind, Wrangler, and Miniflare
versions are unchanged.

CSS compatibility evidence:

| Compiled input | Bytes | SHA-256 before and after |
| --- | ---: | --- |
| `src/globals.css`, with imports resolved before Tailwind and Autoprefixer | 195816 | `d5f1355e9591028be74e460f11891c1412e575124957152bf920406241eaee97` |
| Selector/variant compatibility fixture | 1185 | `2696fc1e0b45012173d808c60d9c07102bfb259932e09d3e06fc9a83cf5d03bc` |

Verification used Node 24.11.0 and npm 11.6.1. `npm audit --omit=dev --json`
reports zero vulnerabilities. `npm audit --json` reports the five residual
findings below. `npm ls miniflare sharp undici postcss-selector-parser depcheck
--all` confirms the resolved overrides and Depcheck's removal. `git diff
--check` passes. The combined change still requires the normal repository
test, typecheck, lint, and production-build gates.

## Remaining upstream issue

`braces` 3.0.3 is still the latest published version, and the
[upstream advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) lists no
patched release. Deeply nested attacker-controlled brace patterns can exhaust
the stack. The remaining audit entries are `braces`, `chokidar`, `micromatch`,
`fast-glob`, and `tailwindcss`.

These dependencies are development/build tooling, absent from the production
dependency audit. Repository content globs are trusted configuration; that
limits the current exposure but does not resolve or waive the vulnerability.
The audit's proposed Tailwind 4 upgrade is a framework migration and is not
part of this compatibility-preserving change. Recheck for a patched Braces or
Tailwind 3 dependency chain before the next release; if none is available,
resolve this through a separately verified Tailwind migration. Do not feed
untrusted patterns into build/watch tooling.

Remove the scoped overrides once upstream Miniflare and Tailwind dependencies
resolve patched releases themselves; rerun the complete dependency audit,
CSS comparison, local Worker/Images checks, and repository quality gates when
doing so.

## Upstream references

- [Depcheck maintenance notice and Knip recommendation](https://github.com/depcheck/depcheck)
- [Unpatched sprintf-js advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c)
- [Sharp 0.35.5 release](https://github.com/lovell/sharp/releases/tag/v0.35.5)
- [Sharp/librsvg advisory](https://github.com/advisories/GHSA-wq5f-xc86-pv6w)
- [Undici 7.29.1 security release](https://github.com/nodejs/undici/releases/tag/v7.29.1)
- [Selector parser 7.0.0 iteration change](https://github.com/postcss/postcss-selector-parser/releases/tag/v7.0.0)
- [Selector parser 7.1.6 security advisory](https://github.com/advisories/GHSA-rj75-hqrm-r3gf)
