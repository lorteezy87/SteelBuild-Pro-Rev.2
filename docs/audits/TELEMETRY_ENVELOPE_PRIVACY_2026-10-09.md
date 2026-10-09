# Browser telemetry envelope privacy boundary — 2026-10-09

Status: **source verified; not a hosted Sentry audit or production deployment**. This change follows the narrower Replay/log containment in `0819331e646bf1ebe8eb86e129793a85ef25bd9c`. It does not alter Sentry account settings, historical events, retention, provider credentials or hosted configuration.

## Verified pipeline and original exposure

The inspected installed `@sentry/react`, `@sentry/browser` and `@sentry/core` version is **10.54.0**. Its core client applies the event hook, assembles SDK metadata and dynamic sampling envelope headers, appends hint attachments, emits late `beforeEnvelope` hooks and then calls `transport.send`. Sessions, standalone/streamed spans and other envelope item types can bypass an event-only hook. Browser tracing also adds trace/baggage headers to matching outgoing application requests outside the envelope path.

Current application callers supply Auth user IDs, query/mutation keys and tags, React component stacks, audit error details and automatically collected request/DOM/console metadata. The existing initialization only stripped URL query strings and selected Postgres row-value text. A new regression against that initialization reproduced private messages, path/fragment contents, exception type and trace operation surviving the hook before this fix.

The old dirty-worktree `telemetryPrivacy.ts` proposal was inspected but not ported. It retained arbitrary exception/mechanism/frame metadata, trace operations/status, unknown event fields and URL path contents. Removing query/fragment alone would retain signed Storage object paths. The replacement uses new typed policy and transport modules.

## Closed outgoing policy

Both error events and transactions are reconstructed from scratch before sending and reconstructed again at the final transport boundary, after late SDK mutations and attachment assembly. Allowed metadata is deliberately limited:

- Validated event/trace/span identifiers; finite bounded timestamps; fixed operation, status, level and built-in exception-type vocabularies; a boolean handled flag; configured 40-hex release SHA and fixed environment vocabulary.
- Error stack line/column and boolean application-frame flag. A filename survives only if its parsed path is an exact member of the current build's captured JavaScript asset inventory. Origin, URL credentials, query, fragment, function/module/context/source text, arbitrary storage paths and unknown filenames do not survive.
- Transaction root/child timing and correlation IDs. Arbitrary transaction names become a fixed category label; descriptions, attributes, links, measurements and other span metadata are dropped.
- Fixed SDK identification and `infer_ip: never` are reconstructed explicitly. Arbitrary SDK metadata and envelope dynamic sampling headers are not forwarded.

The transport drops attachments, sessions, standalone/streamed spans, logs, metrics, client reports, Replay, profiles, feedback, check-ins, security reports and unknown item types, including when they accompany a permitted event. Invalid/unsupported events fail closed. Exceptions, stack frames and child spans are capped; envelopes with more than 64 input items or more than 256 KiB of reconstructed JSON are dropped.

`makeFetchTransport` still owns buffering and rate-limit handling. The wrapper supplies only the reconstructed envelope and overrides caller transport headers/options with `credentials: omit`, `redirect: error` and `referrerPolicy: no-referrer`. Replay/logs remain disabled; default browser session collection, metrics and client reports are disabled. All breadcrumbs are dropped. `tracePropagationTargets: []` prevents arbitrary dynamic sampling names from leaving through application request headers while retaining local timing collection.

## Exact build asset inventory

The small typed Vite plugin enumerates emitted JavaScript chunks from the final build context and places a bounded escaped JSON list in an inert `application/json` element in generated `index.html`. It does not modify JavaScript chunk contents, introduce circular chunk hashes, fetch another file, or include arbitrary public files. The runtime validates and captures the list once at initialization; later DOM changes do not expand it. Missing, duplicate, malformed, oversized or development-only manifests result in no permitted filenames. A matching filename pattern alone never authorizes a path.

The inventory is limited to 1,024 entries and 128 KiB. This is a trusted build artifact, not a defense against malicious code already executing with the application's privileges. Native `capacitor:`/`ionic:` and browser URL forms are normalized to the same exact safe asset path without sending their origins.

## Source acceptance

- Initial recording-policy regression: **one failed, one passed** before correction; the failing assertion showed the synthetic private marker in the real initialization hook result.
- **39 focused Vitest cases passed**, including the real SDK `BrowserClient` and `makeFetchTransport` with an in-memory fetch sink. They cover exception/message/transaction capture, scope and hint attachments, late envelope mutation, raw auxiliary envelopes, nested/future fields, malformed input, bounded payloads, exact manifest capture and a real Vite HTML build. An additional red/green regression ensures absent or unrecognized span status is omitted rather than inventing an error status.
- **Two real Chromium contracts passed (desktop/mobile)**. They bundle the actual `instrument.js` and SDK, use a real loopback application server, and locally intercept the synthetic envelope endpoint. Actual fetch and XHR requests contain no `baggage`, `sentry-trace` or `traceparent`; sanitized envelopes retain emitted asset coordinates and transaction timing without the synthetic private marker, attachment items, cookies or referrer. No request reaches Sentry or another external service.
- Focused strict TypeScript, the actual `tsconfig.scripts.json` check and scoped lint passed. A full application Vite build passed with source-map upload explicitly disabled, producing one inert manifest containing all **443 emitted JavaScript files**, **15,460 bytes**, and no missing paths. This build preceded the narrow unknown-status omission correction above; final exact-SHA application checks remain the hosted CI gate. None of these checks is a production publication claim.

## Observability tradeoff and limits

This intentionally removes arbitrary exception/message text, fingerprints, tags, request details, user/session reporting, breadcrumbs, most SDK metadata, standalone spans and unknown asset paths. Error location/line/column, controlled categories, release identity and transaction timings remain. Missing manifests reduce stack filename observability rather than broaden the policy. Source-map symbolication and provider-side presentation have not been verified against the hosted account.

Validated identifiers and numeric timing are permitted metadata; this is not a claim that every conceivable value or covert channel is impossible. Normal browser network metadata such as the connection address and user agent is outside the event-body schema; no hosted provider retention/access audit or historical-data purge was performed. This policy covers the configured browser Sentry client, not every arbitrary application network path or the local debugging ring buffer. SDK upgrades must rerun the actual-envelope and browser transport contracts before release.

Reference: [Sentry's attachment documentation](https://docs.sentry.io/platforms/javascript/enriching-events/attachments/) describes scope/hint attachment behavior. The installed SDK source, rather than documentation for a different release, determined the final transport placement above.
# Performance-report compatibility follow-up

Exact push run `37956488782` on `0484f8705ec49357a82eefc10baf743929ee9dff`
passed lint, all TypeScript gates, the full unit suite, foundation browser tests
and production build. Its final bundle gate failed because the report's global
HTML path regex counted the inert JSON asset inventory as initial downloads.
On the retained local build, that meant 444 referenced files / 3,187.3 KiB gzip,
although only four script/link asset tags were fetched initially / 124.5 KiB
gzip. The full generated total was 3,226.3 KiB gzip.

The report now parses trusted build HTML using the already-declared `jsdom`
dependency, with its default script execution and resource loading disabled.
Only actual external script and stylesheet/preload/modulepreload tags contribute
to initial asset accounting; prefetch and conditional tags are conservatively
counted too. Inline JSON, script strings, comments and template content do not
fetch those named resources and no longer inflate that metric. Existing total
asset accounting and the **320 KiB initial / 3,600 KiB total** budgets are unchanged.
The manifest's inline HTML bytes are reported separately in this audit; this
existing asset metric does not measure HTML transfer size or all runtime fetches.

An actual-command regression failed before this correction; afterward all **11
CLI cases** pass, including both quote forms, unquoted/reordered attributes,
real script/link budget failures, inert data, and the unchanged total-size gate.
Parsing stays in the existing CommonJS script to preserve the declared Node >=20
runtime support; it does not depend on Node24's TypeScript loader. New tests are
TypeScript, and the actual `tsconfig.scripts.json` and scoped lint checks pass.
