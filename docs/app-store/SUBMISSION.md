# SteelBuild Pro — App Store submission runbook

SteelBuild Pro is a Vite/React web app wrapped in a native iOS shell with
[Capacitor](https://capacitorjs.com/). The iOS app is **sign-in only**: companies
set up their workspace and billing on the web, and their staff sign in on iOS.
The `ios/` Xcode project is committed, and it builds and runs on a physical
iPhone (checked 2026-09-26).

> **Status (2026-09-27): not submittable yet.** The remaining code work is in
> open PRs (§1). Everything after that is an owner step, in order (§2–§7).
> Findings MOB-1 … MOB-10 come from
> [`../audits/PRODUCTION_READINESS_AUDIT_2026-09-21.md`](../audits/PRODUCTION_READINESS_AUDIT_2026-09-21.md).

---

## 1. Code status

| Area | Guideline | PR | State |
|---|---|---|---|
| Sign-in-only native shell: no marketing, pricing or sign-up on iOS (MOB-4) | 3.1.1 | #476 | merged |
| Camera photos, report share sheet, haptics (MOB-2) | 4.2 | #482 | merged |
| Exports and downloads through Files / the share sheet (MOB-5) | 2.1 | #483 | merged |
| Phone layouts: nothing clipped at 360–430 px; phones open Schedule on the Task List | 4.0 | #487, #488 | merged |
| Branded icon and splash; privacy manifest declares collected data (MOB-7) | 2.3, 5.1.2 | #489 | open |
| Privacy and Terms links in the app; no buy-on-web or "coming soon" prompts; Billing and Integrations hidden | 5.1.1, 3.1.1 | #490 | open |
| Account deletion: sole-owner rule, working erase call | 5.1.1(v) | #491 | open |
| Account deletion: release authored records, erase in one transaction (two migrations) | 5.1.1(v) | #492 | open, draft |
| Deep links limited to SteelBuild domains; app-bound domains off (MOB-8) | — | #486 | open: revert its `AGENT_CLAIMS.md` separator row first (it drops a column and breaks the table) |
| Support page for the Support URL; Support & legal links for every user in Settings → Profile; crash reports tagged with platform, version and build (MOB-6); status bar matches the page in both themes (MOB-10); no zoom when an input takes focus; dialog backdrops cover the full phone screen; listing copy | 5.1.1, 2.3 | #493 | open |

Merge #491 before #492. The rest can go in any order.

Not covered here: Google Play (MOB-1, no `android/` platform yet).

## 2. Backend and web (owner, before a review build)

- [ ] **Apply #492's two migrations**, after the read-only pre-check in that PR, then deploy the function:
  ```bash
  supabase functions deploy account-delete --project-ref kjrwqagyeswwoxpjkcko
  ```
  Don't deploy it before the migrations; see #492.
- [ ] **Allowlist the password-reset link.** In Supabase, go to Authentication → URL Configuration → Redirect URLs. It must include `https://steelbuild-pro.com/update-password`. The app's "Forgot password?" email sends users there (MOB-3; see `docs/runbooks/owner-checklist.md`).
- [ ] **Unblock the web deploy.**
  - Production deploys wait on the Supabase drift check.
  - The check fails because production has migrations `20260927004958` and `20260927005727` that aren't in the repo.
  - `/support`, the legal pages and the new deletion dialog reach steelbuild-pro.com only through that deploy.
  - App Review opens the Support and Privacy URLs.
- [ ] **Monitor the support mailboxes.** `support@steelbuild-pro.com` and `security@steelbuild-pro.com` must be real, monitored mailboxes. The app and the support page point people to them.

## 3. Demo account for App Review (owner)

Reviewers can't create a company workspace, so they need a working login (guideline 2.1).

- [ ] Email and password, with **no two-factor authentication**. A reviewer can't pass a TOTP prompt.
- [ ] Make it an **admin (not an owner)** of a demo workspace that belongs to a different account.
  - Reviewers often test account deletion.
  - As a non-owner, deleting it removes only the reviewer's login, and the demo workspace survives.
  - If it were the only owner, deletion would be refused by design, which a reviewer could read as broken.
- [ ] Put the workspace on a plan that includes everything in the screenshots.
- [ ] Seed a realistic sample project: RFIs, drawings and submittals, a schedule, daily logs with photos, deliveries.
- [ ] Sign in with it once on a device.
- [ ] If a reviewer deletes it, create a fresh one before resubmitting.

## 4. Build and upload (Mac)

Needs a released Xcode 26 or newer with the iOS 26 SDK or newer, and a signing team (`36MYCVT3XU` is set in the project). Apple requires these SDKs for uploads from April 28, 2026; check the [current submission requirements](https://developer.apple.com/news/upcoming-requirements/) before archiving.

The build reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (production values) from the environment or a local `.env` file (see `.env.example`). Without them, the app stops at launch with a configuration error.

```bash
npm ci
npm run cap:sync   # vite build, then copy the web assets into ios/
npm run cap:open   # opens ios/App/App.xcworkspace
```

- **Version and build.**
  - Keep **Version** (`MARKETING_VERSION`) at `1.0` for the first release.
  - Raise **Build** (`CURRENT_PROJECT_VERSION`) for every upload. It's in Xcode under the App target → General → Identity.
  - Crash reports from the app carry `app_version` and `app_build` tags, so an error can be matched to its build.
- **Upload.** Product → Archive, then Distribute App → App Store Connect → Upload.
- **TestFlight.** Install the build on an iPhone and an iPad.
- **Dev-server builds must not ship.** For live reload during development, use `CAP_SERVER_URL=http://<LAN-ip>:5173 npm run cap:sync` with `npm run dev`. Unset `CAP_SERVER_URL` and re-sync before archiving: release builds must serve the bundled assets.

## 5. Device checks (TestFlight build, iPhone and iPad)

- [ ] Sign in and out.
- [ ] "Forgot password?" sends an email. Its link sets a new password in the browser, and signing in with it works.
- [ ] A camera photo on a Daily Log or Punchlist item uploads, with a haptic on success.
- [ ] A report link opens the share sheet.
- [ ] These exports open the share sheet: a CSV, a PDF, a grouped package, and one large drawing or document.
- [ ] Settings → Profile → Support & legal: Privacy Policy, Terms of Service and Help & support open, and "Back to home" returns to the app.
- [ ] No pricing, plans, upgrade or buy prompts anywhere. Billing and Integrations aren't in the menus.
- [ ] Delete a throwaway account whose workspace has a project. It signs you out, and the login no longer works.
- [ ] iPad: portrait and landscape, and Split View at ½ and ⅓ width. The ⅓ width uses the phone layout.

## 6. App Store Connect

- **App record**
  - Platform: iOS.
  - Name: SteelBuild Pro.
  - Primary language: English (U.S.).
  - Bundle ID: `com.steelbuildpro.app`.
  - SKU: any unique value.
- **Listing text:** name, subtitle, promotional text, keywords and description are ready to paste in [`LISTING.md`](./LISTING.md). A test keeps them within App Store Connect's limits.
- **Category:** Business. Secondary: Productivity.
- **Price:** Free. There are no in-app purchases.
- **URLs**
  - Support: `https://steelbuild-pro.com/support`.
  - Privacy Policy: `https://steelbuild-pro.com/privacy`.
  - Marketing (optional): `https://steelbuild-pro.com`.
- **Screenshots**
  - Take them from the TestFlight build, using the demo workspace.
  - iPhone 6.9": 1320 × 2868 portrait.
  - iPad 13": 2064 × 2752 portrait. **Required**, because the app supports iPad.
  - Show real screens: Dashboard, Projects, RFIs, Drawings, Schedule, and a field photo. Nothing about pricing.
- **App Privacy.** Answer to match `ios/App/App/PrivacyInfo.xcprivacy`. Every type below is *linked to the user* and *not used for tracking*:

  | Category | Data type | Purpose |
  |---|---|---|
  | Contact Info | Name, Email Address, Phone Number | App Functionality |
  | Identifiers | User ID | App Functionality |
  | User Content | Emails or Text Messages, Photos or Videos, Other User Content | App Functionality |
  | Usage Data | Product Interaction | App Functionality, Analytics |
  | Diagnostics | Crash Data, Performance Data, Other Diagnostic Data | App Functionality |

  Phone numbers are saved in profile metadata. Email Inbox stores composed messages. Masked Sentry replay still captures interaction events, so masking does not remove the Product Interaction disclosure.

  If the app starts collecting something new, update the manifest and these answers together.
- **Age rating:** answer the questionnaire.
- **Export compliance:** already answered in the binary. `ITSAppUsesNonExemptEncryption` is `NO`, since the app uses standard HTTPS only.
- **App Review Information:** add the demo account, a contact, and the notes in §7.

## 7. Notes for App Review

Adapt and paste into App Review Information → Notes. The first paragraph assumes SteelBuild Pro is sold to companies, not to individual consumers (guideline 3.1.3(c)). If that changes, revisit it before submitting.

```text
SteelBuild Pro is project-management software for steel fabrication and
erection companies. It is sold to companies: a company sets up its workspace
on our website and invites its staff, who then sign in with this app. The app
has no account sign-up, purchasing or subscription features, and doesn't link
to any.

Demo account: see Sign-In Information. It is an admin of a sample company
workspace with example projects.

To try the iOS features:
- Daily Log or Punchlist: add a photo with the camera.
- Any report: Share opens the iOS share sheet. Exports open in the share
  sheet, so you can save them to Files.

Account deletion: Settings > Profile > "Delete my account…", then type the
account's email to confirm. The demo workspace belongs to another account, so
it stays.

Privacy Policy and Terms of Service are linked on the sign-in screen. Both,
plus our support page and email, are in Settings > Profile > Support & legal.
```

## 8. Later

- **Universal Links.** `src/lib/native/capacitor.ts` already routes `https` links into the app. To have reset and share links open the app instead of Safari:
  - host `apple-app-site-association` at `https://steelbuild-pro.com/.well-known/`;
  - add the Associated Domains capability (`applinks:steelbuild-pro.com`).
- **Push notifications.** Add `@capacitor/push-notifications`, the Push Notifications capability and an APNs key.
- **Smaller native items (MOB-10).** Self-hosted fonts for offline cold starts, and Keychain-backed session storage.

---

### Quick reference — repo scripts

| Script | Purpose |
|---|---|
| `npm run cap:sync` | `vite build`, then copy web assets and update native dependencies. |
| `npm run cap:copy` | Copy web assets only (no native dependency update). |
| `npm run cap:open` | Open the project in Xcode. |
| `npm run ios` | `cap:sync`, then open Xcode. |
