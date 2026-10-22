-- Surface a sheet's thumbnail and its linked RFI numbers on the register view.
--
-- WHY THE VIEW AND NOT A SECOND READ
-- `drawing_register_view` is the one complete, uncapped read of a project's
-- sheets (see useDrawingRegister: it pages to completeness because five panels
-- derive claims from it). Two Document Control panes need columns that live on
-- `drawings` but were never projected: the register pane wants
-- `thumbnail_url` so the sheet preview can show the actual sheet instead of a
-- placeholder, and the RFI pane wants `linked_rfi_ids` so it can name the
-- sheets an RFI is holding. Reading `drawings` again alongside the view would
-- duplicate the same rows over a second, capped request and add a truncation
-- surface that has to be reported separately. Projecting two existing columns
-- costs nothing by comparison.
--
-- ADDITIVE AND ORDER-PRESERVING
-- Both columns are appended AFTER the existing ones. `create or replace view`
-- requires the existing output columns to keep their names, types and order,
-- so every current caller — including the sibling application, which shares
-- this database — keeps the exact shape it reads today. No column is renamed,
-- retyped, reordered or removed.
--
-- `security_invoker=true` is preserved: the caller's own RLS on `drawings`,
-- `drawing_revisions` and `drawing_holds` still decides what they can see, and
-- these two columns are governed by the same `drawings` policies that already
-- gate `sheet_number` and `title` on the row beside them.
--
-- `linked_rfi_ids` is TEXT here, not uuid[]: on `drawings` it is a
-- comma-separated list of RFI NUMBERS (what SheetFormModal asks detailers to
-- type), which is a different id space from `submittals.linked_rfi_ids`.
-- It is projected verbatim so readers can normalise it with the canonical
-- `normNum` / `linkedRfiNumbers` in src/lib/fabReleaseGate.ts rather than
-- re-splitting it in SQL.

begin;

create or replace view public.drawing_register_view with (security_invoker=true) as
 select d.id as drawing_id,
    d.project_id,
    d.sheet_number,
    d.title as sheet_title,
    d.discipline,
    d.drawing_set_name,
    d.stage,
    cur.id as current_revision_id,
    cur.revision_code as current_revision,
    cur.release_status as current_status,
    cur.issued_at as current_issued_at,
    (select count(*) from public.drawing_impacts i
       where i.drawing_revision_id = cur.id and i.status <> all (array['resolved','closed'])) as open_impact_count,
    (select count(*) from public.drawing_reviews r
       where r.drawing_revision_id = cur.id and r.decision = 'pending') as pending_review_count,
    (select count(*) from public.drawing_links l
       where l.drawing_id = d.id and l.linked_record_type = 'rfi' and l.removed_at is null) as rfi_count,
    (select count(*) from public.drawing_links l
       where l.drawing_id = d.id and l.linked_record_type = 'work_package' and l.removed_at is null) as work_package_count,
    greatest(d.updated_at, cur.updated_at) as last_activity,
    h.id as active_hold_id,
    h.reason as active_hold_reason,
    h.placed_at as active_hold_placed_at,
    -- New, appended: see the header note on ordering.
    d.thumbnail_url,
    d.linked_rfi_ids
   from public.drawings d
     left join lateral (
       select r.id, r.project_id, r.drawing_id, r.revision_code, r.revision_name,
              r.sheet_number, r.sheet_title, r.file_id, r.version_number,
              r.is_current, r.issued_at, r.received_at, r.supersedes_revision_id,
              r.viewer_width, r.viewer_height, r.created_by, r.created_at,
              r.updated_by, r.updated_at, r.archived_at, r.release_status
         from public.drawing_revisions r
        where r.drawing_id = d.id and r.is_current = true
        limit 1
     ) cur on true
     left join public.drawing_holds h on h.drawing_id = d.id and h.is_active
  where d.is_deleted = false;

commit;

notify pgrst, 'reload schema';
