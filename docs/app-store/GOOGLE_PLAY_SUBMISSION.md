# SteelBuild Pro — Google Play submission runbook

SteelBuild Pro is a Vite/React application packaged as a native Android app
with Capacitor. This runbook records the source-controlled setup and the
owner-controlled steps that must be complete before a Google Play submission.

## Current source-controlled setup

- Native Android project: `android/`.
- Application ID: `com.steelbuildpro.app` in `capacitor.config.ts` and
  `android/app/build.gradle`. Register this exact ID in Play Console before
  uploading any build; it cannot be changed for an existing listing.
- Product name: SteelBuild Pro.
- Capacitor Android version: pinned through `package-lock.json`.
- Android API levels: `minSdkVersion 24`, `compileSdkVersion 36`, and
  `targetSdkVersion 36` in `android/variables.gradle`.
- Native capabilities already used by the product: camera capture, share
  sheet, haptics, keyboard handling, splash screen, status bar, secure local
  preferences, and offline app-shell behavior.
- Native purchase policy: sign-in only. Billing, checkout, and upgrade UI stay
  hidden in the native app; customer subscriptions are managed on the web.
- Account deletion: the authenticated Settings -> Profile flow is the in-app
  deletion path. It must pass staging verification before release.

Google Play currently requires new apps and updates to target Android 16
(API 36) or higher beginning August 31, 2026. This project is already set to
API 36, but re-check this policy immediately before upload because it changes.

## Required local tooling

- Android Studio with Android SDK Platform 36 and Build Tools installed.
- A JDK supported by the Android Gradle Plugin shipped in `android/`.
- A Google Play developer account registered to the correct legal entity.
- An upload key stored outside the repository. Never commit `*.jks`,
  `keystore.properties`, `local.properties`, or Play service-account keys.

## Build and test loop

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run cap:sync:android
npm run android
```

Open the generated Android project in Android Studio, then run it on at least
one physical phone and one API-36 emulator. For the release candidate, unset
`CAP_SERVER_URL` and re-run `npm run cap:sync:android`; the release must bundle
`dist/`, not point at a development server.

Verify these critical flows on-device:

1. Sign in, sign out, and expired-session recovery.
2. Project switching and the Drawing Register / Piece Register workflows.
3. Camera capture, photo selection, attachment upload, and cancel/deny paths.
4. Sharing an exported report to another app (FileProvider path included).
5. Offline launch, queued field changes, reconnect, and duplicate-safe sync.
6. Rotation, split-screen, keyboard behavior, accessibility scaling, and
   back-navigation from a deep link.
7. Settings -> Profile -> Delete my account on staging for a shared member,
   co-owner, and sole-owner workspace. Confirm the expected account/data
   outcome in Supabase after each case.

Do not claim a release build is tested until it is signed and executed on a
physical Android device. This Windows workspace has no Android SDK/JDK
configured, so it cannot perform that build or device verification.

## Signing and Android App Bundle

1. In Play Console, create the app record with package ID
   `com.steelbuildpro.app` and enroll in Play App Signing.
2. Create a separate upload key; store its location/passwords in the approved
   secret manager, not this repository.
3. Configure Android Studio's signed release build with that upload key.
4. Before every release, increment `versionCode` and set `versionName` in
   `android/app/build.gradle` to the approved release version. Google Play
   rejects an upload whose version code is not greater than the last release.
5. Generate an Android App Bundle (`.aab`), not a debug APK.
6. Upload first to the internal testing track. Promote only after the device
   checklist and crash/error review are green.

## Play Console content and compliance gate

Before closed or production testing, complete these items with a product owner
and legal/privacy reviewer:

- **Store listing:** app name, short/full descriptions, 512x512 app icon,
  feature graphic, phone screenshots, support email, and website.
- **App access:** supply a working reviewer/demo account with realistic but
  non-sensitive data. Reviewers must be able to use the B2B app without
  provisioning a company or paying for a plan.
- **Privacy policy:** link the published `/privacy` page in Play Console and
  from inside the app. Confirm its claims cover every shipped native plugin and
  third-party SDK, including Supabase and Sentry.
- **Data safety:** complete the form from an audited data inventory. Likely
  categories include contact information, user content (project documents and
  photos), identifiers, and diagnostics; this is a starting inventory only,
  not a completed declaration. Record whether each datum is collected,
  shared, encrypted in transit, and deletable.
- **Account deletion:** Google Play requires an in-app deletion path when an
  app supports account creation, and the Data safety form includes deletion
  questions. Publish and link an external authenticated deletion-request page
  only after legal/product confirms its identity-verification and retention
  policy; do not use a generic support email as a substitute.
- **Permissions:** inspect the merged release manifest using Android Studio's
  Manifest Merger report. Retain only permissions with a demonstrated feature
  need. Test camera denial and media-selection fallbacks before declaring the
  permissions in Play Console.
- **Content and distribution:** complete ads, content rating, target audience,
  data deletion, and country/distribution questionnaires truthfully.
- **Security:** verify production authentication, authorization, CSP, error
  monitoring, and rollback instructions. Confirm production has no test keys,
  debug endpoints, or unrestricted development server URL.

## Release sequence and rollback

1. Internal testing: team-only build, full device checklist, and a 24-hour
   error-monitoring window.
2. Closed testing: invite a small pilot group; monitor sign-in, upload, and
   offline-sync failures.
3. Production: staged rollout with an owner monitoring Sentry and Supabase
   errors. Pause or roll back for data-integrity issues, security issues, or
   material increases in authentication/upload failure rates.
4. Roll back by halting the Play rollout or promoting the previous verified
   App Bundle. Preserve user data; do not attempt a destructive database
   rollback to address a mobile-client defect.

## Source-controlled commands

| Command | Purpose |
| --- | --- |
| `npm run cap:add:android` | Creates the Android project if it does not exist. |
| `npm run cap:sync:android` | Builds the web bundle and copies it into Android. |
| `npm run android` | Syncs and opens the Android project in Android Studio. |
| `npm run cap:sync` | Existing iOS-only compatibility command. |

## Known release blockers

- The release icon must be generated from approved 1024x1024 master artwork;
  the existing web/PWA icon is not by itself evidence that Play icon density
  assets are approved.
- The Play feature graphic, store screenshots, and finalized listing copy have
  not been created or approved.
- A public, policy-approved account-deletion request URL has not been
  implemented or verified.
- The privacy/Data safety declaration requires a current legal and vendor-SDK
  review before it can be submitted.
- `npm audit --omit=dev --audit-level=high` currently reports two **moderate**
  React Router advisories. The offered remediation upgrades to React Router 7,
  a breaking major version; do not run `npm audit fix --force` during release
  preparation. Assess and test that upgrade in a dedicated compatibility PR.
- No signed `.aab`, real-device test result, Play Console record, or staged
  rollout exists yet.
