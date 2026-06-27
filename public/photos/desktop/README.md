# Desktop launcher photos

Cinematic construction photos backing the launcher tiles. One landscape WebP per
module, named EXACTLY `<PageKey>.webp` (case-sensitive), e.g. `FabRelease.webp`.

Resolved by `src/config/launcherConfig.js` (`PHOTO_ASSETS`) and rendered by
`src/components/desktop/ModuleTile.jsx`. A missing file falls back to a gradient
tile automatically, so add photos incrementally.

Generation kit + per-module prompts: `docs/superpowers/plans/2026-06-27-desktop-photo-pack-1b.md`.
Target ≤180 KB each, 3:2 landscape (~1536×1024).
