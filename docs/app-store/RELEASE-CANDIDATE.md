# SteelBuild Pro — release candidate preparation

Prepared 2026-10-05. **No App Store upload or App Review submission has been
completed by this preparation.** Follow [SUBMISSION.md](SUBMISSION.md) for the
product compliance details; this file describes the executable release path.

## Release workflow

The manual **iOS App Store release** GitHub Actions workflow creates a signed
Release archive, validates its bundle/version/encryption/privacy metadata,
exports an IPA, and can upload it to App Store Connect. It runs only from
`main` and requires the exact commit's four production gates to pass:
Lint + Typecheck + Test + Build; Secret scan; Supabase drift; Release Edge
Function typecheck. An advisory dependency-audit failure is not one of those
four gates; it still needs to be assessed separately.

The native app bundles the production web build. Release preparation refuses
a live-reload server, placeholder credentials, or a different Supabase
project. The macOS runner must have Xcode 26 and the iOS 26 SDK or newer;
the script checks both. Apple has required these SDK versions since
April 28, 2026: [Apple's current requirements](https://developer.apple.com/news/upcoming-requirements/).
The app's iOS deployment target remains 15, as supported by the installed
Capacitor native dependencies.

1. Merge the reviewed candidate and wait for its main CI run to finish.
2. Open **Actions → iOS App Store release → Run workflow** on `main`.
3. Set the App Store marketing version (for example `1.0.0`) and an unused,
   increasing build number. Native versions are supplied to Xcode at build
   time; package.json's web version is independent.
4. Leave **upload** off for a signed export check. Download the IPA and
   `release-evidence.json` from that run's artifact.
5. Run with **upload** on and a new build number to send the candidate to
   App Store Connect. The script verifies the exact bundle, marketing version,
   and build number through Apple's API, accepts `PROCESSING` or `VALID`, and
   updates the English TestFlight **What to Test** notes. A processing receipt
   does not mean the build has finished processing or passed review.
6. Complete the device checks below, verify Apple processing is `VALID`, fill
   the listing, select the build, and submit it for App Review in App Store
   Connect. The workflow does not submit an incomplete listing or select an
   external TestFlight group automatically.

## Owner-provided credentials and records

Create an `app-store` GitHub environment restricted to the main branch. Store
the following secrets there, never in a commit, PR description, or chat:

| Secret | Required value |
|---|---|
| `IOS_TEAM_ID` | Developer Program team that owns the bundle ID |
| `IOS_CERTIFICATE_BASE64` | Base64 of an Apple Distribution signing certificate **including its private key**, exported as `.p12` |
| `IOS_CERTIFICATE_PASSWORD` | Password protecting that `.p12` |
| `IOS_PROVISIONING_PROFILE_BASE64` | Base64 of an unexpired App Store distribution profile for `com.steelbuildpro.app`, matching the certificate and team |
| `ASC_KEY_ID`, `ASC_ISSUER_ID` | App Store Connect team API key identifiers with upload access |
| `ASC_PRIVATE_KEY_BASE64` | Base64 of that API key's `.p8` file; upload mode only |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | The existing public production client configuration, not the service-role key |
| `VITE_SENTRY_DSN` | Production telemetry DSN if enabled; disclose the enabled collection in App Privacy |

Signing material lives only in the temporary macOS job directory/keychain and
is removed on exit. Artifacts contain the IPA (export-only mode) and a small
release receipt, not private keys, profiles, raw signing logs, or archives.
If archive/export fails, the artifact also includes the last 80 diagnostic
lines with operational environment values and signing identity lines removed.

The owner must also have an active Developer Program membership, accept
Apple's current agreements, register the bundle identifier, and create the
matching App Store Connect app record. Only the owner can supply legal/contact
information, decide distribution territories and trader status, attest privacy
and age-rating answers, and provide a working reviewer login. Do not enter real
customer credentials in review notes.

## Backend release prerequisites

The hosted Supabase drift job currently receives HTTP 401. Replace its
`SUPABASE_ACCESS_TOKEN` repository secret with an authorized, current token;
then rerun the check. No check or branch protection is disabled by this work.

The revision retry and account deletion PRs contain backend migrations.
Review their exact SQL, apply and verify against staging first, then follow
the repository's **manual apply + exact filename ledger stamp** process for
production. Deploy the matching `account-delete` function only after the
database function exists. Never use `supabase db push`, MCP `apply_migration`,
or ledger repair against the shared production project. A client build alone
does not deploy or verify these backend changes.

## Store listing draft

**Name:** SteelBuild Pro

**Subtitle:** Steel projects. Shop to site.

**Category:** Business

**Promotional text:** Keep steel projects moving with connected schedules,
drawing reviews, fabrication tracking, deliveries, and field updates.

**Description:**

SteelBuild Pro brings project teams, fabrication shops, and field crews into
one workspace for structural steel work.

- Plan activities, dependencies, work calendars, and project schedules.
- Track drawings, submittals, revision reviews, and release readiness.
- Follow fabrication progress, deliveries, and work packages.
- Capture field progress and photos, and share project reports and files.
- Keep project records and responsibilities connected across your team.

Sign in with your existing SteelBuild Pro workspace account. Available
features depend on your workspace access and role. An internet connection is
required for synchronization; supported field updates can queue while offline.

**Keywords:** steel,construction,fabrication,erection,schedule,drawings,submittals,field,project

**Support URL:** https://steelbuild-pro.com/support

**Privacy URL:** https://steelbuild-pro.com/privacy

Verify those public URLs after the gated web deployment; adding the source
route does not establish that it is available on the live site yet.

**Review notes draft:** SteelBuild Pro is a business project management app
for existing workspace users. Use the supplied demo account and seeded
project. The iOS app does not sell subscriptions or direct users to purchase
on the web. Native workflows include camera photo capture, file sharing,
and offline field updates. Account deletion is available from Settings →
Profile. Supply a disposable reviewer account whose records may be deleted.

## Verification needed before submission

- Use a signed-in iPhone and iPad: sign in/out, tenant/project switching,
  schedule editing and scrolling, drawing review, field capture, offline
  replay on the original work date, camera permissions/upload, and file sharing.
- Exercise account deletion in staging for an ordinary member, co-owner,
  and sole owner with more than one project. Prove that unauthorized callers
  cannot view another workspace's erasure census. Verify the HTTP deletion
  RPC completes for representative data under its scoped timeout, not just
  an in-process SQL test.
- Verify light and dark themes, keyboard focus, date input, table hit targets,
  and the app resuming after backgrounding.
- Capture real, current app screenshots for the device families enabled in
  Xcode. Upload the sizes required by App Store Connect. Do not substitute
  design mockups for the submitted app.
- Complete App Privacy from the actual enabled production features and the
  shipped manifest, including optional profile phone, email content, uploaded
  content, identifiers, diagnostics, and session-replay interactions when enabled.
- Confirm reviewer credentials work with representative non-customer data,
  support/contact information is current, and Apple processing is `VALID`.

Local web tests and a successful Capacitor sync are preparation evidence.
They do not prove a signed archive, working camera, device installation,
server migration, TestFlight receipt, or App Review acceptance.
