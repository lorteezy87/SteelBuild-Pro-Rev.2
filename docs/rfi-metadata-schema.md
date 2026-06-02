# `rfis.metadata` schema

The `rfis` table keeps a `metadata jsonb` column for fields that don't (yet)
warrant their own column. The RFI form/detail seed these from `metadata` and
fold them back on submit, so **no migration is required to add a key** — but
every key in active use must be documented here so the app and any AI/import
flows stay consistent.

## Keys

| Key | Type | Set by | Read by | Meaning |
| --- | --- | --- | --- | --- |
| `rfi_type` | string | `RFIFormModal` | RFI workflow views | RFI classification (workflow backbone). |
| `proposed_solution` | string | `RFIFormModal` | RFI detail / copilot | The asker's proposed resolution. |
| `fab_hold` | boolean | `RFIFormModal` ("Fab Hold" checkbox) | `RfiDetailModal` (red chip), fab-protection rollups | This RFI should **hold fabrication** of the sheets/pieces it affects until resolved. |
| `piece_marks` | string | `RFIFormModal` ("Piece Marks" field) | `RfiDetailModal` (Pieces chip) | Affected piece marks, comma/space separated (e.g. `C-12, B-7`). |
| `source_photo_id` | uuid (string) | field-capture / photo→RFI flow | RFI detail (linked photo) | The `photos.id` a field-captured RFI was created from. *(Reserved — wire the photo→RFI capture flow to populate it.)* |

## Conventions

- **Read defensively:** always `rfi?.metadata?.<key>` with a fallback
  (`|| ""` / `!!`). Older rows won't have newer keys.
- **Write by merge, never replace:** when updating, spread the existing
  metadata first — `metadata: { ...(rfi.metadata || {}), <key>: value }` — so a
  partial form save can't drop other keys. `RFIFormModal.buildPayload()` follows
  this.
- **Normalize on write:** booleans coerced with `!!`, strings `.trim()`ed.

## Related (NOT metadata — top-level columns)

`drawing_reference`, `spec_section`, `discipline`, `status`, `ball_in_court`,
`priority`, `linked_rfi_ids` (on `drawings`, the sheet→RFI link the fab-release
gate keys on). The Fab Release gate (`src/lib/fabReleaseGate.js`) currently keys
on `drawings.linked_rfi_ids` + open status; `metadata.fab_hold` / `piece_marks`
are the RFI-author's explicit signal layered on top.
