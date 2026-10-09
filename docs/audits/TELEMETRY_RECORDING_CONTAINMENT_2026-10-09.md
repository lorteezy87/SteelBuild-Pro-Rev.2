# Telemetry recording containment — 2026-10-09

Source fix only; production remains unchanged until the gated frontend release.

Inspection of main `04285069c26c8e57c59b491cd202be6100a01b79` found
`src/instrument.js` still initialized Sentry Replay, sampled 10% of sessions and
100% of sessions with errors, and enabled structured logs. A separate dirty
security worktree contained an unadopted proposal to disable those channels;
that proposal was not evidence of main or production behavior.

This narrow correction removes `replayIntegration`, explicitly sets both
Replay sampling rates to zero, and disables structured logs. Error monitoring,
the existing error/breadcrumb hooks, browser tracing at 10%, DSN selection and
trace propagation settings remain. This does not change the Sentry account,
project settings, existing retained events or credentials.

DOM text/media masking is not a complete recording-envelope privacy contract.
Sentry documents recording-specific controls separately from event filtering:
[Replay privacy](https://docs.sentry.io/platforms/javascript/session-replay/privacy/)
and [Replay configuration](https://docs.sentry.io/platforms/javascript/session-replay/configuration/).
The application has no demonstrated synthetic-secret acceptance for its Replay
recording metadata or structured log channel. Those channels stay disabled
until their own sanitization and actual envelope acceptance are reviewed.

The new `instrumentRecordingPolicy.test.ts` loads the actual instrument module
with a mocked Sentry SDK. Before the fix it failed because Replay was initialized;
after the fix it passes, proving the disabled channel settings and retained
error/tracing hooks. Scoped ESLint also passes. Full integrated source CI and
deployed bundle verification remain separate checks.

This is not a complete telemetry privacy signoff. The existing error hook strips
query strings and one PostgreSQL row-value pattern but does not establish that
all exception text, URL fragments, attachments, arbitrary context, breadcrumbs
or transaction spans are private. A separately reviewed complete event and
transaction envelope boundary, with synthetic-secret tests, remains required.
No historical Sentry event inspection or deletion was performed.

The browser acceptance runner's exact local telemetry sink is also separate:
it discards allowed monitoring envelopes without forwarding them during that
test. Passing a test with that sink does not prove production telemetry delivery
or payload sanitization.
