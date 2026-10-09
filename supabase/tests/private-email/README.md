# Private mailbox verification

Run `npm ci --ignore-scripts` then `npm test` in this directory. The package uses
PGlite 0.5.8, actual shipped mailbox schema/policies and role resolvers, and the
complete candidate migration. All identities and credentials are synthetic.
`npm test -- --before-fix` deliberately reproduces the original credential
exposure and field-level mailbox administration (five failed security assertions).

## Release prerequisites

This source is not a deployment. Review, manually apply, and ledger-stamp
`20261008201945_private_email_credentials_and_verified_mailboxes.sql` before
releasing the dependent email handlers/UI. Coordinate the sibling application
and any OAuth consumer: public credential columns are removed without CASCADE,
and token consumers must use the service-only credentials RPCs. Existing tokens
are preserved privately but withheld until the account has a current binding.
No OAuth connection/refresh UI is added by this change.

The migration creates **zero trusted mailbox bindings**. An active mailbox or
historical user-entered address is not verification. Every legitimate outbound
mailbox needs an explicit trusted operator review before sending resumes.
Existing mailbox metadata stays visible in the UI with its verification state.

The operator must independently verify all of:

- The workspace controls/consents to the exact mailbox address and project.
- The provider permits that exact mailbox identity (Graph application access
  policy/RBAC and tenant/client, or the Resend verified domain/account scope).
- The current `email_accounts` account ID, project ID, workspace ID, normalized
  address, account provider, and connection type match the reviewed identity.
- A nonsecret provider configuration generation is assigned. Set the matching
  `EMAIL_RESEND_CONNECTION_ID` or `EMAIL_MSGRAPH_CONNECTION_ID` Edge environment
  value. A provider tenant/application/account change requires a new ID and
  re-verification; ordinary same-identity secret rotation need not change it.
- A durable, nonsecret verification evidence reference and operator identity
  are recorded. Do not store provider tokens in that evidence reference.

Only trusted SQL operators can insert/update `steelbuild_email_private.mailbox_bindings`.
There is deliberately no client or service-role binding-management RPC. Use a
reviewed transaction that locks the account row, checks the exact reviewed
snapshot, and inserts the binding plus `verified_by` and
`verification_reference`. Do not generate bindings by selecting all existing
mailboxes. Use `send_provider='inbound_only'` when only inbound trust is approved;
this never authorizes outbound sending. For outbound, use `resend` or `msgraph`
and the matching provider connection ID. Different workspaces must not receive
the same mailbox authority without independently reviewed consent.

Set `revoked_at` to revoke a binding. Changing account address/provider/connection
deletes its binding and obsolete credentials; deactivation deletes the binding.
Reverting metadata or reactivating does not restore trust. Deleting the account
cascades private state. A changed workspace/project snapshot or archived project
does not resolve to a verified mailbox. Coordinate operator binding writes with
account edits by locking the account row in the operator transaction.

`get_verified_email_mailboxes`, `get_email_account_credentials`, and
`store_email_account_credentials` accept only service-role calls. Safe
`get_email_account_verification` status requires the caller's current project
access. Credentials are not exposed through ordinary table reads, safe metadata
RPCs, or project export. Direct access to the private tables is denied even to
the service role; only the explicit runtime RPCs expose their intended results.

## Acceptance before production closure

Verify deployed REST/RPC ACLs, private schema non-exposure, provider connection
IDs/scopes, and synthetic delivery for each approved provider. Confirm a changed,
unverified, cross-workspace, revoked, archived, or disabled binding cannot reach
the provider. Verify manual-forward/Power Automate webhook trust with synthetic
messages: mailbox trust comes only from verified bindings, while the separate
operator-configured trusted-domain allowlist remains supported. The shared
webhook secret still authenticates the webhook; an address is not a replacement
for webhook authentication or upstream sender validation.

PGlite proves SQL/ACL behavior, and handler tests exercise the real entrypoints
with mocked HTTP boundaries. They do not prove hosted PostgREST/Realtime schema
configuration, Graph/Resend scope, provider delivery, or shared-caller
compatibility. A provider operation already in flight can finish after a
revocation; the next lookup denies it. Historical backups/logs or previously
downloaded tokens are not erased by moving columns: assess and rotate/revoke
previously exposed credentials through the provider as part of release.
