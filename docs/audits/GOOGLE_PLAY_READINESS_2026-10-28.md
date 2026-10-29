# SteelBuild Pro: Google Play readiness and implementation plan

Reviewed October 28–29, 2026 (America/Phoenix), using repository source and current official documentation. This is a researched release plan. No Android package, developer account, purchase, signing key or store submission was created in this review.

**Recommended route: extend the existing Capacitor app to Android.** The repository already uses Capacitor 8 with a bundled Vite/React app, native camera/filesystem/share support, and an iOS shell. Reusing that foundation is a practical engineering choice. A full native rewrite is not needed to begin Android acceptance. This recommendation is based on the existing code; store approval and device quality still require testing.

| Repository state | Consequence |
| --- | --- |
| `capacitor.config.ts`: `appId: com.steelbuildpro.app`, `webDir: dist` | Proposed Android package identity already has a candidate; confirm ownership and long-term choice before registration. |
| Core/CLI and iOS packages are on Capacitor 8.5.1; no Android dependency/project checked in | Add the matching Android platform and a reproducible Android build. |
| Native capability wrappers and upload/download helpers exist | Audit their Android behavior; iOS success does not prove Android support. |
| `isStoreShell()` applies to native platforms; Landing and Billing use it | Existing sign-in-only presentation can support an initial companion-app approach. Verify every route, upgrade prompt and deep link. |
| Native viewport helper adds `maximum-scale=1` | Revisit this iOS-oriented behavior for Android accessibility, zoom and large-text acceptance. |
| Field outbox retains selected captures, not every app operation | Describe supported offline actions precisely. Test Android process death, storage limits and reconnection; do not market universal offline support. |

**Packaging work.** Capacitor's official Android workflow is to install the platform, add it, then open/run the generated Android Studio project. Use an Android package version compatible with the installed core; for the reviewed lockfile that is 8.5.1. These commands are proposed, not executed. [Capacitor Android documentation](https://capacitorjs.com/docs/android).

```powershell
npm install @capacitor/android@8.5.1
npx cap add android
npm run build
npx cap sync android
npx cap open android
```

Commit the generated project, wrapper and repeatable scripts after review; keep signing secrets out of Git. Keep `CAP_SERVER_URL` unset for release so the package contains built assets, not a development URL. Supply the intended public frontend configuration and validate permitted auth redirects/origins. Never embed a service-role key. CI should reject debug/live-reload configuration and build the signed release from a reviewed commit.

Capacitor 8's environment documentation calls for Node 22+ and Android Studio 2025.2.1+; the repo's Node 24 baseline is suitable. Install the necessary Android SDK and use Studio's supplied JDK according to the generated Gradle toolchain. [Environment setup](https://capacitorjs.com/docs/getting-started/environment-setup).

For a new phone/tablet submission, Google currently requires **Android 16 / API 36 or higher**, effective August 31, 2026. Set and verify target SDK in the generated Android configuration; do not rely on an old API 35 launch checklist. Minimum supported Android version is a separate product/testing decision. [Current target API policy](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en).

Produce a signed **Android App Bundle (.aab)** and use Play App Signing. Protect the upload key, record its recovery owner and configure signing through secure CI credentials. Analyze the packaged libraries and test 16 KB memory-page compatibility; JavaScript/WASM assets do not by themselves establish the compatibility of every bundled native SDK. [App bundles](https://developer.android.com/guide/app-bundle), [app signing](https://developer.android.com/studio/publish/app-signing), [16 KB compatibility](https://developer.android.com/guide/practices/page-sizes).

**Commercial model for the first Android release.** Prefer a sign-in-only companion for existing workspace subscribers while validating demand. Google permits consumption-only apps that let people access services paid for elsewhere. Digital SaaS features sold inside the app normally require Play Billing unless an applicable exception/program permits another arrangement. Business-productivity software is not automatically exempt. Review all in-app Stripe/upgrade links against the chosen countries and current program enrollment before enabling them; regional alternative-billing/external-offer programs have conditions. [Payments policy explanation](https://support.google.com/googleplay/android-developer/answer/10281818?hl=en), [Payments policy](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en).

This plan does not require removing web subscriptions. It requires an explicit Android purchase/access policy and tests that the shipped UI follows it. Later adding native purchases means designing entitlement reconciliation, account/workspace ownership, restoration, cancellation and webhook/event idempotency across billing systems.

**Owner preparation.** Register under the actual business using an organization account when that accurately describes the publisher. Google Play registration currently has a **US$25 one-time fee**. Organization onboarding generally requires verified organization details, contacts and a D-U-N-S number; request/check those early. The account owner must handle identity, payment and agreements. This review did not inspect the owner's Console or establish whether an account already exists. [Registration](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en), [organization information](https://support.google.com/googleplay/android-developer/answer/13628312?hl=en).

**Policy and listing package.** Prepare an accurate app name/description, icons, screenshots, support contact, privacy policy, target audience/content rating, ads declaration and reviewer access instructions. Give reviewers a dedicated synthetic workspace/account with enough data to reach the main features; do not send production customer credentials. Ensure any MFA/verification requirement has a legitimate reviewer-access procedure. Verify current Console declarations before submission.

Privacy and Data Safety disclosures must match actual collection/sharing, including account/contact data, uploaded drawings/photos, diagnostics and third-party SDK behavior. Verify the backend deletion flow and a working public request path, including treatment of company-owned project records and retention. Google's account-deletion rule requires in-app and external request paths when account creation is supported within the app; evaluate the complete account journey rather than assuming a hidden signup button resolves the obligation. [User data policy](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en), [account deletion guidance](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en).

**Android acceptance matrix.** These are release requirements, not completed tests.

| Area | Minimum scenarios |
| --- | --- |
| Authentication | Sign in, MFA, refresh/expiry, recovery and invite links, sign out, account/org switch; no old workspace data after switch. |
| Device lifecycle | Hardware/gesture Back, background/resume, OS process kill, rotation, split screen, app upgrade with pending captures. |
| Capture and files | Camera/photo picker, permission denied/revoked, image compression, large PDF open, export/share/download and cancel. Prefer narrow permissions over broad media/storage access. |
| Offline | Capture with airplane mode, kill/reopen, reconnect, quota failure, missing photo bytes, permanent rejection, duplicate retry and multi-session concurrency. |
| Layout and accessibility | Small phone/tablet, large font/display scale, TalkBack focus/labels, contrast, keyboard overlap and edge-to-edge/system bars. |
| Performance | Cold/warm start, low-memory device, 10k/50k job datasets, large drawings and upload bursts; inspect crashes/ANRs and memory. |
| Security | HTTPS/origin behavior, safe deep links, cross-org denial, no embedded secrets, protected files and correct production API target. |
| Store presentation | No unapproved purchase links, accurate offline claims, accessible privacy/deletion/support, reviewer can complete a core task. |

**Release sequence.** Generate and validate the Android shell; produce a signed internal-test AAB; test physical Android devices with PM/shop/field/viewer personas; resolve Play pre-launch report findings; run a closed customer pilot; then submit a staged production rollout with monitored crashes and a rollback/update plan.

For **personal developer accounts created after November 13, 2023**, Google requires at least **12 testers continuously opted into a closed test for 14 days**, followed by an application for production access. This is not a blanket rule for every organization account, and satisfying the duration does not itself grant production access. Confirm the actual account's Console requirements. [Testing requirement](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en).

Success means an installable, correctly signed app that passes the acceptance matrix and Google's review. Adding the `android/` folder is only the first implementation step. The market-readiness data-integrity and authorization gates in the [main audit](COMMERCIAL_READINESS_2026-10-28.md) apply equally to the Android release.
