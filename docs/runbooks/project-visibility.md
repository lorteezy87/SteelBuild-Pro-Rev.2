# Current project visibility contract

SteelBuild Pro uses a hybrid workspace/project rule. This documents the
as-built behavior; it does not choose a new model.

- `organization_members` owners/admins access every project in their org.
- Normal org members access only projects with an explicit `user_projects`
  row. Org membership alone gives them no project visibility.
- The RLS helper first joins project to org membership, so a `user_projects`
  row cannot cross organizations.
- `get_my_project_role` prefers an explicit project role, then falls back to
  the org owner/admin role.
- Owner/admin invitation acceptance backfills existing project memberships;
  normal-member invitation acceptance does not.
- Project creation grants the creator owner and backfills other org
  owners/admins. Normal members are not auto-added.

RLS and RPC checks are authoritative; UI visibility is defense in depth.

Before onboarding another organization, choose explicitly between preserving
this least-privilege hybrid model or auto-granting every org member every
project. That decision affects invites, Project Members UX, RLS helpers, role
tests, exports, notifications, and audit expectations and is outside this
maintenance batch.
