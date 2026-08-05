-- ╭────────────────────────────────────────────────────────────────────────────╮
-- │ 027 — Add file_url and revision_history to drawing_sets                    │
-- │                                                                              │
-- │ RevisionUploadModal.jsx needs to:                                           │
-- │   1. Record the "current" PDF file URL for the set so the UI can link to   │
-- │      the latest issued drawing package                                     │
-- │   2. Persist a JSON-serialized history of prior revisions (revisionLabel,  │
-- │      issueDate, issuedBy, fileUrl, sheetCount, notes, uploadedAt, status)  │
-- │                                                                              │
-- │ Neither column existed until now, which is why revision uploads were      │
-- │ failing with "Could not find the 'current_file_url' column" — the code    │
-- │ had been using current_file_url / revision_history names that PostgREST   │
-- │ rejected because nothing of either name was in the schema cache.           │
-- │                                                                              │
-- │ This migration adds:                                                        │
-- │   - file_url         TEXT  — storage path or signed-URL seed for the       │
-- │                               currently-issued set file                    │
-- │   - revision_history TEXT  — JSON array of prior-revision snapshots        │
-- │                                                                              │
-- │ The code is being updated in the same commit to drop the "current_"        │
-- │ prefix on the other three fields (revision / issued_date / issued_by) so  │
-- │ RevisionUploadModal matches the DB naming that DrawingSetUploadModal      │
-- │ already uses.                                                               │
-- ╰────────────────────────────────────────────────────────────────────────────╯

ALTER TABLE drawing_sets ADD COLUMN IF NOT EXISTS file_url         TEXT;
ALTER TABLE drawing_sets ADD COLUMN IF NOT EXISTS revision_history TEXT;

-- Nudge PostgREST so the new columns become visible to API clients without
-- waiting for the periodic schema-cache refresh.
NOTIFY pgrst, 'reload schema';
