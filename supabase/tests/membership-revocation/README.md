# Workspace membership revocation verification

Run locally from this directory:

```sh
npm ci --ignore-scripts
npm test
```

This suite uses an ephemeral in-memory PGlite database, synthetic identities and
the actual migration definitions of the three project-role resolvers, ordinary
project access, project archival, its update guard and erasure census. It does
not connect to Supabase, read environment credentials or write customer data.

The regression is an explicit `user_projects` role surviving deletion of its
`organization_members` row. Before the candidate, that role still authorizes the
definer archive RPC even though ordinary project SELECT returns no rows. The
suite can reproduce the old failure intentionally:

```sh
node verify.mjs --before-fix
```

That diagnostic command must exit nonzero: 18 authorization tests fail against
the old definitions. The initial red run with the empty CLI-created candidate
had 16 passes and 18 failures; two preservation checks were added afterward.
The candidate must pass all 36 tests.

Coverage includes every explicit viewer/field/PM/admin/owner role after removal,
each of the three resolvers, the admin wrapper, unauthorized archive rejection
with no persisted archive, cross-workspace membership, workspace default roles,
explicit-role precedence, current workspace owner/admin authority, ordinary
archival, archived-project census, missing identities and unchanged execution
grants. Archived projects deliberately remain eligible for role resolution so
current administrators can complete erasure. Ordinary project visibility is
unchanged.

The older account-deletion suite intentionally loads pre-fix role helpers to
prove that census independently rejects stale memberships. Its characterization
assertion remains useful and is not changed by this suite.

Limits: this fixture exercises relevant shipped SQL with a reduced table/trigger
catalog. It is not a complete hosted-schema replay, PostgREST/MFA test, or a
concurrent-revocation acceptance test. PostgreSQL statement snapshots still
govern already-running transactions. Project membership rows are retained, so
adding someone back to a workspace makes existing explicit project grants
effective again; deleting those historical grants is a separate policy change.
Hosted application requires the repository's reviewed manual migration process.
