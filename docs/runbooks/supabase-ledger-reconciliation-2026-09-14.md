# Supabase ledger reconciliation — 2026-09-14

Target: production `kjrwqagyeswwoxpjkcko`. This follows the
[2026-09-13 drift repair](supabase-drift-repair-2026-09-13.md).

## What the drift check reported

Thirty-six required Rev.2 and sibling-app migration versions were absent from
the production ledger, and six deprecated Edge Functions were still deployed.
A missing ledger row does not say whether its SQL is unapplied or already live
under another stamp, so each version was checked before anything was recorded.
After PR #404 merged, `20260913202900` joined them.

## Method

Each version's SQL was compared, read-only, with production's catalog and with
a local replay of every Rev.2 migration (Supabase PostgreSQL 17.6). A second
reviewer then tried to refute every "live" or "superseded" claim with its own
queries; none was refuted. Six versions were checked directly after their
reviewer agents stalled. Per-version evidence and the decisive queries are in
[`supabase-ledger-reconciliation-2026-09-14.evidence.json`](supabase-ledger-reconciliation-2026-09-14.evidence.json).

The approved list was then checked against the separately reviewed overrides
in [`supabase/production-ownership-manifest.json`](../../supabase/production-ownership-manifest.json).
Ten approved versions conflict with that manifest, so they are left out (see
[Not recorded](#not-recorded)). Twenty-six are recorded.

## Owner decisions (2026-09-14)

- Record the approved versions as applied. Their effects are live, so each
  repair row carries no statements and none of their SQL runs.
- FIELD users keep creating change requests. Rev.2 adopts production's
  per-table access model for change requests, drawing revisions and closeout.
- Record the two release-gate versions and document the divergence below.
  Porting the sibling app's stricter gate into Rev.2 is a separate product task.
- `schedule_tasks` soft-delete columns join Rev.2 (PR #404).

## Adoption migrations

Both change nothing in production and make fresh Rev.2 environments match it.
On the replay, the resulting function body, policies and table grants equal
production's exactly.

- `20260914120000_adopt_production_soft_delete_project.sql` carries the sibling
  app's `m2_projects_and_project_rbac` body byte for byte (MD5
  `6ac048fb85527ad236dadeda8db85530`). Every child table it soft-deletes exists
  in Rev.2 with `project_id`, `is_deleted` and `deleted_at`.
- `20260914120100_adopt_production_change_request_access_model.sql` reproduces
  production's policies and table grants on `change_requests`,
  `drawing_revisions` and `project_closeout` (from sibling `m3`, `m16`, `m25`).

## Recorded versions

| Version | Migration | Evidence |
|---|---|---|
| `20260727053000` | pm_floor_authority_tables | Email-settings floors are live via 20260913201853; the other three tables take production's model from 20260914120100, so FIELD keeps change-request creation |
| `20260727224500` | bulk_update_piece_attributes | Live; later redefined by 20260727232000, which production matches |
| `20260727232000` | piece_drawing_sets | Its own effects are live; production runs the sibling app's stricter release gate (owner decision: record and document) |
| `20260728040000` | advance_piece_stations_bulk | Live exactly as written |
| `20260728053000` | link_model_elements_chunked | Live exactly as written |
| `20260731003000` | piece_mark_3d_sync | Live; later redefined by 20260801120000, 20260904120000, 20260912023827, which production matches |
| `20260801120000` | piece_mark_relink_on_change | Live; the projection trigger was later redefined by 20260904120000, which production matches |
| `20260802010000` | pilot_readiness_drawing_sets | Live; later redefined by 20260913201853, which production matches |
| `20260805030000` | drop_project_id_null_rls_escape_hatch | Live exactly as written |
| `20260805030100` | revoke_trigger_fn_execute_and_search_path | Live exactly as written |
| `20260805100000` | daily_logs_materials_received | Live exactly as written |
| `20260809223000` | piece_intelligence_drawing_impact_pm_floor | Live exactly as written: all three PM floors on drawing_impacts |
| `20260810053816` | piece_intelligence_drawing_impact_assignment_authority | Live exactly as written: both function bodies match by MD5; grants and trigger live |
| `20260818233000` | production_notes_date_noted_due | Live exactly as written; its backfill has nothing to do |
| `20260818240000` | drawing_sets_titleblock_revision_rect | Live exactly as written: column, comment and validated shape CHECK |
| `20260819001000` | org_member_default_project_access | Live; later redefined by 20260909011728, 20260909014620, which production matches |
| `20260819002000` | operational_alerts_engine | Live exactly as written |
| `20260819003000` | project_workflow_templates | Live exactly as written |
| `20260825140000` | submittal_approver_notes | Live exactly as written |
| `20260905090000` | sync_production_stages_to_pieces | Live exactly as written |
| `20260905130000` | work_package_control_center | Its own effects are live; production runs the sibling app's stricter release implementation (owner decision: record and document) |
| `20260908120000` | schedule_predecessor_orphan_repair | Live exactly as written |
| `20260908130000` | schedule_task_actuals | Live exactly as written |
| `20260908150000` | schedule_change_log_completeness | Live exactly as written |
| `20260908160000` | schedule_duration_single_source | Live exactly as written |
| `20260908170000` | project_calendars | Live exactly as written |

## Not recorded

`20260913084700_expense_atomic_creation` would replace production's newer,
validated expense RPC. Another agent has claimed the expense compatibility
repair; the manifest freezes the version and quarantines its file.

These ten were approved but conflict with the manifest's reviewed overrides,
so they are left out. Each keeps its current classification. Recording one
needs its manifest entry changed first, and its guard test where it has one,
with the owner's agreement.

| Version | Migration | Why it is left out |
|---|---|---|
| `20260801013000` | fix_archive_wp_progress_reentrancy | The manifest keeps its lineage unresolved: two of its three function bodies are not live, and their provenance is not established |
| `20260813120000` | note_folders_job_linking | Production ran it as `20260817072554`, which is recorded, so a second row would record one migration twice |
| `20260817020000` | repair_bimc_rfi_and_schedule_dates | Production ran the same UPDATEs as `20260817083550`, which is recorded; the manifest says it must not be stamped |
| `20260904120000` | piece_archive_projection_sync | Its schema is live, but its one-off data repair was never verified; the manifest records it as schema-only, and a ledger row would read as fully applied |
| `20260908140000` | schedule_baselines | Its schema is live, but its one-off data seed was never verified; the manifest records it as schema-only |
| `20260909060000` | m3_7_auto_archive_empty_drawing_sets | Sibling source version that production recorded as `20260909062016` |
| `20260909060100` | m2_1_scope_project_number_uniqueness_to_org | Sibling source version that production recorded as `20260909073500` |
| `20260909090000` | m19_reset_org_data | Sibling source version whose SQL production recorded as `20260909090445` |
| `20260913090000` | drawing_transmittal_targets | The manifest keeps its lineage unresolved: a second review attributes its live objects to two other recorded migrations |
| `20260913202900` | schedule_tasks_soft_delete_columns | A replay-only no-op that the manifest says never reaches the ledger |

`20260801013000` and `20260913090000` stay `unresolved`, so the drift check
keeps reporting them. The other eight are `intentionally-frozen` and don't
affect it.

## Known divergence: release gate

Production's `evaluate_release_gate` and `release_work_package_canonical_impl`
are the sibling app's `m9_piece_register` bodies (MD5
`c4d43eb981ea9bc43d096708e6e1b541` and `298bed7b45a7e20d8fce3a0f64955821`).
The gate reads `work_package_drawing_set_reports`, which Rev.2 does not have.
A fresh Rev.2 environment (staging, or a rebuild from migrations) therefore
gets the older gate, whose release lets a non-admin PM release past a failed
drawings gate with only an exception reason. The manifest keeps
`20260727232000` unresolved, so the drift check reports it until the gate is
ported.

## Applying

Run the reconciliation script from this change's pull request once, as
postgres, in the Supabase SQL editor. It refuses to run twice or if production
no longer matches the reviewed state. It applies the two adoption migrations,
records them and the 26 versions above (28 rows), re-checks everything and
commits only if it all matches. Merge the pull request at the same time so the
ledger and the repository agree.

## Still open

- Five deprecated Edge Functions: the retirement workflow pinned versions one
  behind production, and PR #411 re-pins them. Then run a dry run, check the
  backup artifact, and apply.
- `stripe-webhook`: confirm in Stripe that no enabled endpoint targets it.
- The drift check still reports the three unresolved migrations
  (`20260727232000`, `20260801013000`, `20260913090000`) and `stripe-webhook`
  until their owners decide.
