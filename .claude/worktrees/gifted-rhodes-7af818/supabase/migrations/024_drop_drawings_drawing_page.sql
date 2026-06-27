-- ╭────────────────────────────────────────────────────────────────────────────╮
-- │ 024 — Drop drawings.drawing_page (duplicate of pdf_page)                    │
-- │                                                                              │
-- │ `drawing_page` was introduced by migration 020 alongside `pdf_page` but     │
-- │ nothing ever read from it. All code uses `pdf_page` for the thumbnail /     │
-- │ viewer page index. Confirmed zero non-null rows before drop.                │
-- ╰────────────────────────────────────────────────────────────────────────────╯

ALTER TABLE drawings DROP COLUMN IF EXISTS drawing_page;
