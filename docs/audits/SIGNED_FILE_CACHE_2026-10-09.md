# Private file preview cache correction

Status: source verified; not deployed.

The old hook cached signed URLs indefinitely under only the file path. A
mounted preview kept its previous URL after workspace clearing/switching, and a
later mount reused expired links. Six regression cases reproduced these faults
before the implementation changed.

`useResolvedFileUrl.ts` now binds displayed and cached private-path resolutions
to the active workspace generation. AuthContext clears that scope when the
identity changes or signs out; OrgProvider also clears it during scope changes.
Render-time checks hide the previous URL before effects run, including a
batched workspace A → cleared → A change. Late successes and failures cannot
update the new scope. No file is resolved without an active workspace.

Private-path cache entries expire five minutes after resolution starts, well
before the existing 3,600-second Storage URL expiry. Mounted previews request a
fresh signed link at that deadline and remove the old link if access is denied.
The cache holds at most 256 entries. A new workspace generation cannot use an
old entry; the next active cache read also clears its retained values.

This is a UI cache correction, not a Storage authorization repair. It does not
revoke an already-issued bearer URL, change RLS, change the one-hour server TTL,
or renew trusted full HTTP(S) URLs. Full URLs retain the existing resolver trust
check and are excluded from the private-path cache. The independent app-files
project-boundary audit tracks the broader server and legacy-mapping work.

Validation on 2026-10-09:

- Eleven focused hook tests passed, including sign-out, scope replacement,
  A → cleared → A, late response/rejection, mounted renewal and remount expiry.
- Independent review verified all three production callers remain under the
  authenticated workspace gate. Thirteen hook/workspace-isolation tests passed
  together. The existing scope attachment rendering test also passed.
- Scoped ESLint and whitespace checks passed. Full integrated CI and hosted
  acceptance remain separate release gates.
