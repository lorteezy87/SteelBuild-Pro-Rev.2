# SteelBuild Pro — Apple App Store submission runbook

SteelBuild Pro is a Vite/React web app. To ship it on the App Store it is
wrapped in a native iOS shell with [Capacitor](https://capacitorjs.com/). This
document is the end-to-end runbook: what is already wired up in this repo, and
the remaining steps — most of which **require a Mac with Xcode** and cannot be
done in CI/Linux.

> Legal note: public-facing/store work (marketing copy, signup, billing) was
> cleared for the S&H Steel conflict before this was started (see `CLAUDE.md`).
> If that clearance changes, stop and re-check before submitting.

---

## Already done in this repo

- **Capacitor iOS wrapper** — `capacitor.config.ts` (appId `com.steelbuildpro.app`,
  `webDir: dist`), plugins installed (`app`, `status-bar`, `splash-screen`,
  `keyboard`, `haptics`, `camera`, `share`, `preferences`), npm scripts
  (`cap:add:ios`, `cap:sync`, `cap:open`, `ios`).
- **Native bootstrap** — `src/lib/native/capacitor.ts`, loaded only inside the
  native shell (guarded in `src/main.jsx`): status-bar theming, splash hide,
  keyboard classes, deep-link routing, safe-area root class. The web bundle and
  test suite are unaffected.
- **PWA / iOS web hardening** — real `public/manifest.json` icons + metadata,
  `apple-mobile-web-app-*` meta tags, PNG `apple-touch-icon`, safe-area-inset
  CSS (`src/styles/base.css`, active only in standalone/native).
- **Privacy manifest template** — `mobile/ios/PrivacyInfo.xcprivacy`.
- **Info.plist usage strings** — `mobile/ios/Info.plist.snippet.xml` (camera /
  photo library — required by `@capacitor/camera`).

## Requires a Mac (cannot run here)

Generating the Xcode project, `pod install`, code signing, building the `.ipa`,
capturing screenshots, and uploading to App Store Connect.

---

## 0. Prerequisites

- **Apple Developer Program** membership ($99/yr) — enroll as the S&H Steel org
  or as an individual, per the legal decision.
- **Mac + Xcode 16.1 or newer** (required by Capacitor 8).
- **CocoaPods**: `brew install cocoapods` (or `sudo gem install cocoapods`).
- Repo installed: `npm ci`.

## 1. One-time native project setup (Mac)

```bash
npm run cap:add:ios        # generates ios/ (commit it, or keep local — see .gitignore)
```

Then, in the generated project:

1. **Privacy manifest** — copy `mobile/ios/PrivacyInfo.xcprivacy` to
   `ios/App/App/PrivacyInfo.xcprivacy`, then in Xcode: *File ▸ Add Files to "App"…*
   and check *Add to target: App*.
2. **Usage strings** — paste the keys from `mobile/ios/Info.plist.snippet.xml`
   into `ios/App/App/Info.plist`.
3. **Bundle Identifier** — set to `com.steelbuildpro.app` (must match
   `capacitor.config.ts` `appId` and the App Store Connect record).
4. **Signing** — select your Team, enable *Automatically manage signing*.
5. **Deployment target** — iOS 15.0+.
6. **Encryption compliance** — add `ITSAppUsesNonExemptEncryption = NO` to
   `Info.plist` (standard HTTPS only; skips the export-compliance prompt each
   upload).

## 2. App icon, splash & launch screen

Fastest path — generate every size from one source image:

```bash
npm i -D @capacitor/assets
# place a 1024×1024 icon at assets/icon.png and a splash at assets/splash.png
#   (source: public/steelbuild-pro-icon-512.png upscaled, or the master art)
npx capacitor-assets generate --ios
```

Set the launch-screen background to `#0B0E11` (matches the web loading shell and
`SplashScreen.backgroundColor`) so there is no white flash on cold start.

## 3. Build & run loop

```bash
npm run cap:sync     # vite build → copy web assets into the native project
npm run cap:open     # open ios/App/App.xcworkspace in Xcode
# or: npm run ios     # sync + open in one step
```

Run on a simulator and a real device. **Live-reload** against the dev server
(faster iteration, no rebuild per change):

```bash
CAP_SERVER_URL=http://<your-LAN-ip>:5173 npm run cap:sync
npm run dev   # in another terminal
```

Unset `CAP_SERVER_URL` and re-sync before archiving a release — release builds
must serve the bundled offline assets, not a dev URL.

## 4. App Store Connect

1. Create the app record (bundle id `com.steelbuildpro.app`, SKU, primary
   language).
2. **Screenshots** (upload at least the required device sizes):
   - 6.9" iPhone (16 Pro Max) — 1320 × 2868
   - 6.5" iPhone — 1242 × 2688
   - 13" iPad Pro — 2064 × 2752 (only if the app supports iPad)
3. **App Privacy ("nutrition labels")** — declare what is collected. For this
   app that is typically: *Contact Info* (name, email), *User Content* (photos,
   documents, messages), *Identifiers* (user/org id), *Diagnostics* (Sentry
   crash/telemetry). Keep `mobile/ios/PrivacyInfo.xcprivacy`
   `NSPrivacyCollectedDataTypes` consistent with this.
4. **Age rating** questionnaire.
5. **App Review Information** — provide a working **demo account** (see §5,
   guideline 2.1). Reviewers cannot self-provision a B2B workspace.
6. Link the existing legal pages: Privacy (`/privacy`), Terms (`/terms`),
   Security (`/security`), Subprocessors (`/subprocessors`).

## 5. App Review Guidelines — the parts that get apps rejected

| Guideline | What it requires | Status / action |
|---|---|---|
| **2.1 Completeness** | Reviewer can actually use the app | **Action:** create a demo login with seeded data; put it in App Review Information. |
| **4.2 Minimum functionality** | Not "just a repackaged website" | **Handled:** native camera capture, haptics, share sheet, native status bar/splash, offline-capable bundled assets. Keep leaning on native capabilities. |
| **5.1.1(v) Account deletion** | Any user who can create an account can delete it **in-app** | ✅ **Implemented — see §6.1** (self-service "Delete my account" in Settings → Profile). Needs staging deploy + test before submission. |
| **3.1.1 / 3.1.3 Payments** | Digital subscriptions consumed in-app generally need Apple IAP | ⚠️ **DECISION — see §6.2.** Recommended: iOS app is sign-in-only; sell/renew subscriptions on the web. |
| **5.1.1 / 5.1.2 Data & privacy** | Privacy policy linked; data use disclosed | **Handled:** legal pages exist; link them and complete nutrition labels. |
| **4.8 / 5.1.1 Sign in with Apple** | If you offer a third-party social login (e.g. Google), you must also offer Sign in with Apple (with narrow exceptions) | **Check:** if only email/password is offered, this does not apply. Confirm the auth methods enabled in Supabase. |
| **2.3 Accurate metadata** | Store listing matches the app | Keep marketing copy truthful; no hidden/unfinished features. |

## 6. Compliance action items — do BEFORE first submit

### 6.1 Account deletion — ✅ implemented (verify on staging before submit)

Self-service account deletion now ships in the app:
- **UI:** `src/components/settings/DeleteAccountZone.jsx`, rendered in
  Settings → Profile (`UserSettingsTab.jsx`). Available to **every**
  authenticated user regardless of role, **not** behind a feature flag, with a
  type-your-email confirmation.
- **Backend:** the `account-delete` edge function gained a `mode: "account"`
  path. It erases any workspace the caller **solely owns** (product policy —
  takes the whole workspace and its members' access with it), deletes the
  caller's `auth.users` row (FK-cascading their memberships, `user_profiles`
  PII, and `user_projects`; authorship columns are `ON DELETE SET NULL`), and
  removes co-members who are left in no workspace.

**Before relying on this for submission:**
1. Deploy the updated function: `supabase functions deploy account-delete --project-ref <ref>`.
2. On staging, verify all three cases: (a) a member of a shared workspace,
   (b) a co-owner (workspace survives), (c) a **sole owner** (workspace is
   fully erased). Confirm the `auth.users` row and `user_profiles` PII are gone.
3. Note: a pure account deletion that erases no workspace writes no
   `account_deletions` audit row (that table is org-scoped). Add a dedicated
   account-deletion audit if your compliance program requires one.

### 6.2 In-app purchase decision

The app already integrates Stripe (`supabase/functions/stripe-billing`). Apple's
rules: digital subscriptions **used inside the app** typically must go through
Apple IAP (30/15% fee). The common compliant pattern for B2B SaaS is:
- the **iOS app is sign-in only** — no plan purchase/upgrade UI in the app;
- accounts and billing are created/managed on the **web**.

Decide this with product/legal. If any purchase/upgrade UI ships in the iOS
build, plan for StoreKit IAP and the review scrutiny that comes with it.

### 6.3 Other

- Demo reviewer account with representative data.
- Privacy nutrition labels filled in and consistent with the privacy manifest.
- App icon, launch screen, and screenshots produced.

## 7. Deep links / Universal Links (optional)

`src/lib/native/capacitor.ts` already routes incoming `https` Universal Links
into the SPA router. To activate them, host an
`apple-app-site-association` file at `https://steelbuild-pro.com/.well-known/`
and add the Associated Domains capability (`applinks:steelbuild-pro.com`) in
Xcode.

## 8. Push notifications (optional / future)

Not included. When needed: add `@capacitor/push-notifications`, enable the Push
Notifications capability + an APNs key, and register device tokens server-side.

---

### Quick reference — repo scripts

| Script | Purpose |
|---|---|
| `npm run cap:add:ios` | One-time: generate the `ios/` project (Mac). |
| `npm run cap:sync` | `vite build` + copy web assets into the native project. |
| `npm run cap:copy` | Copy web assets only (no native dependency update). |
| `npm run cap:open` | Open the project in Xcode. |
| `npm run ios` | `cap:sync` then open Xcode. |
