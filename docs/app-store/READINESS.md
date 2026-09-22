# SteelBuild Pro mobile release preparation

Assessed 2026-09-22 against origin/main 6ab54a286. Preparation only; no store upload or production deployment has occurred.

## Commercial direction

Recommended first release: company subscriptions sold on the web, with free mobile access for existing workspace members. Prioritize a small number of paid company pilots and guided onboarding while native builds are tested. Keep the existing Stripe web billing flow; do not add StoreKit or Play Billing without an explicit business decision.

Apple guideline 3.1.3(c) permits access to organization subscriptions sold directly for employees. It explicitly distinguishes consumer, single-user and family sales. Do not assume that hiding checkout makes every pricing model exempt. The companion-app provision in 3.1.3(f) has its own conditions. Google permits consumption-only apps. Store review must evaluate the actual product, sales model and regional rules.

## Verified starting state

- Shared Capacitor config uses com.steelbuildpro.app and bundles dist.
- Native billing/upgrade suppression already exists, with regression tests.
- iOS privacy and permission files are templates only; there is no generated Xcode project.
- Android 8.5.0 dependency and native project have now been added, matching the locked Capacitor core/iOS version. Android targets API 36, minimum API 24. Version name matches package.json; initial versionCode is 1.
- Android artwork is still the generated Capacitor artwork. It is not store-ready branding.
- Native bootstrap exists for splash, status bar, keyboard and links. Installed plugins alone do not prove functioning native camera/share workflows.
- The logged-out AuthenticatedApp still renders the marketing Landing page with signup. A dedicated native sign-in flow is a release blocker; the existing billing gates do not make the whole app sign-in-only.
- extractInAppPath currently accepts any HTTP(S) host despite its own-site comment. Add host validation and navigation tests before enabling app links.
- This Windows machine has no detected Android SDK or java command. It cannot build an AAB yet. Signed iOS builds require a Mac/Xcode host.

## Ordered work remaining

1. Confirm company selling identity, store-account status, and initial company-only sales model. Keep signing keys and passwords out of this repository.
2. Make native logged-out navigation sign-in/password-reset only, preserve web signup, and test that marketing, checkout and upgrade links cannot leak through native routes.
3. Add safe native link routing and Android Back behavior; test session recovery, expired links and external links.
4. Generate and commit the iOS project on a Mac; incorporate verified permission strings and privacy manifest into its target. Complete a source-based data inventory for Apple privacy labels and Google Data safety. The empty collected-data template is not a declaration that no data is collected.
5. Verify account deletion end-to-end for member, co-owner and sole-owner cases in an approved test environment. Supply a publicly reachable deletion-request page for Play; explain retained records and retention periods accurately.
6. Supply final 1024px icon master, Android adaptive artwork, store feature graphic, and screenshots from real builds. Do not use generated screenshots as evidence of app behavior.
7. Configure production public backend values, sign builds, test representative phones/tablets, then distribute through TestFlight and Play internal testing.
8. Complete privacy/age/content questionnaires, reviewer demo workspace, support contact and listing copy. Verify signup, deletion, billing, uploads, PDF/3D viewing, offline/reconnect and permissions on devices before submission.

## Build commands

Use Node 24 (the repository CI version) and npm ci. Android Studio 2025.2.1+ supplies the JDK; install Android SDK 36. On a Mac use Xcode 26+ with an iOS 26+ SDK for current submissions. Capacitor 8 defaults to Swift Package Manager; CocoaPods is optional.

Android preparation: npm run cap:sync:android, then npm run cap:open:android. In Android Studio generate a signed Android App Bundle using a protected upload key and Play App Signing. Increase versionCode for every upload. The generated Gradle project has no release signing credentials.

iOS preparation on a Mac: npm run cap:add:ios, incorporate mobile/ios templates, select the correct signing team, npm run cap:sync, then npm run cap:open. Archive and validate before TestFlight upload.

Before either release sync, unset CAP_SERVER_URL. Supply the intended production VITE_SUPABASE_URL and browser-safe VITE_SUPABASE_ANON_KEY in the build environment. Never bundle a service-role key. Test builds with CI placeholder credentials are not release builds. Review the generated capacitor.config.json: server.url must be absent. Bundled assets do not imply full offline data support.

## Submission gates and sources

- Apple SDK requirements: https://developer.apple.com/news/upcoming-requirements/
- Apple review/payment rules: https://developer.apple.com/app-store/review/guidelines/
- Capacitor tools: https://capacitorjs.com/docs/getting-started/environment-setup
- Google target API policy: https://developer.android.com/google/play/requirements/target-sdk
- Google payment rules: https://support.google.com/googleplay/android-developer/answer/10281818
- Google account deletion: https://support.google.com/googleplay/android-developer/answer/13327111
- New personal Play accounts may require 12 opted-in testers for 14 consecutive days before applying for production access: https://support.google.com/googleplay/android-developer/answer/14151465

Submission remains blocked on the items above. Neither store approval nor production readiness is implied by a successful web build or Capacitor sync.

## Verification from this preparation pass

Native billing/navigation regression tests: 3 passed across 2 files. Vite build passed with chunk-size/import warnings using CI placeholder backend credentials; this build is for packaging validation only and must not be uploaded. Android Gradle compilation, device testing and signed store artifacts remain unverified.
