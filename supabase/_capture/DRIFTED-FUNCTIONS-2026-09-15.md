# Drifted functions — a migration defines them, production runs something else

**49 functions, as of 2026-09-15.** These are *not* in
`production-public-functions-2026-09-15.sql`, whose contract is "no migration
defines these". These are the opposite and the more dangerous case: the repo
*does* define them by name, so nothing looks missing, but production's body
matches no version in `supabase/migrations/`, `migrations_archive/`,
`migrations_external/` or `migrations_quarantine/`.

Replaying the repo over production would silently revert all 49. The list
includes the core RLS helpers and the P0 fab-release path.

They are not captured yet. Capturing them is the next piece of work; until then
this file is the inventory.

## Detecting them

Line endings matter: production stores some bodies with CRLF while `* text=auto`
rewrites the checked-in copy to LF, so a raw md5 reports drift where the SQL is
identical (this is exactly what mis-recorded
`work_packages_soft_delete_unassign_pieces` as diverged — 55 CR bytes, nothing
else). Always compare CR-stripped:

```sql
select p.proname, left(md5(replace(p.prosrc, chr(13), '')), 8) as body_pfx
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and not exists (select 1 from pg_depend d
                    where d.objid = p.oid
                      and d.classid = 'pg_proc'::regclass
                      and d.deptype = 'e');
```

Compare each prefix against the md5 of every dollar-quoted body in every
migration directory, with `\r` stripped from both sides. A live function whose
prefix matches nothing is either undefined (in the capture) or drifted (here).

## The 49

- `accept_invitation`
- `build_pay_application_lines`
- `create_organization`
- `create_project`
- `delete_drawing_set`
- `enforce_drawing_set_unlock_role`
- `enforce_fab_release_gate`
- `enforce_org_invite_limit`
- `enforce_org_member_guard`
- `enforce_project_update_guard`
- `enforce_user_projects_membership_identity`
- `evaluate_release_gate`
- `get_my_project_role`
- `guard_drawing_set_lock_for_drawing_links`
- `guard_drawing_set_lock_for_drawing_zone_dependencies`
- `guard_drawing_set_lock_for_drawing_zones`
- `guard_drawing_set_lock_for_drawings`
- `handle_new_user`
- `link_model_elements_to_pieces`
- `link_model_elements_to_pieces_page`
- `log_drawing_activity`
- `log_drawing_link_activity`
- `log_drawing_zone_activity`
- `log_user_project_member_activity`
- `piece_control_drawing_is_approved`
- `plan_member_limit`
- `plan_project_limit`
- `prevent_user_profile_role_change`
- `project_on_hold_stamp`
- `raise_if_drawing_set_locked`
- `reconcile_stuck_extractions`
- `refresh_pay_application_totals`
- `release_work_package_canonical_impl`
- `seed_project_handoff_items`
- `set_for_drawing_is_locked`
- `set_for_zone_is_locked`
- `soft_delete_project`
- `sync_drawing_set_counts`
- `tg_validate_drawing_zone_dependency_project`
- `user_has_project_access`
- `user_has_project_role`
- `user_has_project_role_at_least`
- `user_is_org_admin`
- `user_is_org_member`
- `user_is_project_admin`
- `user_is_system_admin`
- `user_org_role_at_least`
- `validate_drawing_link_target`
- `validate_drawing_zone_polygon`

## Why each one matters is not recorded here

Whether production or the repo is correct has been established for exactly one
of them: `soft_delete_project`, where production is the newer and safer side —
its live body guards the dynamic child-table UPDATE with
`if to_regclass('public.' || v_table) is not null then`, which
`20260801013000_fix_archive_wp_progress_reentrancy.sql` lacks. That is recorded
in `supabase/production-ownership-manifest.json`.

For the other 48, direction is unknown. Do not assume production is right; do
not assume the repo is. Diff before promoting either way.
