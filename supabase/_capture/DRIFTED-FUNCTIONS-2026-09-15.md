# Drifted functions — a migration defines them, production runs something else

**48 functions, as of 2026-09-15** (49 at first count; `soft_delete_project` was
retired from this list by `20260914120000_adopt_production_soft_delete_project.sql`,
which is the worked example of how to clear one).

These are *not* in `production-public-functions-2026-09-15.sql`, whose contract is
"no migration defines these". These are the opposite and the more dangerous case:
the repo *does* define them by name, so nothing looks missing, but production's
body matches no version in `supabase/migrations/`, `migrations_archive/`,
`migrations_external/` or `migrations_quarantine/`.

Replaying the repo over production would silently revert all 48. The list
includes the core RLS helpers and the P0 fab-release path.

## Where they come from

Mostly **the sibling app**. `lorteezy87/SteelBuild-Pro-2026` shares this
production Supabase project (see CLAUDE.md), so its migrations land in the same
database and Rev.2's migration history never records them. That is stated
outright in `20260914120000_adopt_production_soft_delete_project.sql`: production
ran the sibling's definition from *its* ledger entry `20260909014620
m2_projects_and_project_rbac`, and no Rev.2 migration carried it.

So "drifted" here usually does not mean someone hand-edited production. It means
the other app owns that function today. Which repo *should* own it is the open
question, and CLAUDE.md records that schema ownership between the two apps is
still undecided.

## Clearing one

`20260914120000_adopt_production_soft_delete_project.sql` is the pattern: copy
the sibling's file byte for byte, confirm the body md5 matches production, state
that the migration changes nothing in production, and keep grants and owner. Then
delete the name from this list.

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

## The 48

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

## Direction is not established

For `soft_delete_project` it was, and production won: its live body guarded the
dynamic child-table UPDATE with `if to_regclass('public.' || v_table) is not null
then`, which the Rev.2 file lacked. That is why it was adopted rather than
overwritten.

For the other 48, direction is unknown. Do not assume production is right; do not
assume the repo is. Diff before promoting either way, and check the sibling app
first — it is the likely author.
