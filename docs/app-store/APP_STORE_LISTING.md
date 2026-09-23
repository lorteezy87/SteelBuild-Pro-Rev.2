# SteelBuild Pro — App Store Connect listing draft

Everything App Store Connect asks for, drafted from what the app actually does
today. The owner approves the copy; the build process in
[`SUBMISSION.md`](./SUBMISSION.md) does not depend on any of it.

Rules for editing this file:

- **Truthful metadata (Guideline 2.3).** Every feature named below must work in
  the iOS build a reviewer installs. If a feature is removed or gated, delete
  the line.
- **No purchase calls to action (Guideline 3.1.1).** The iOS app is sign-in
  only. Do not add prices, plan names, trials, "sign up on our website" or
  "upgrade" wording to any field here, screenshots included.
- **No other companies' trademarks** in the name, subtitle or keywords
  (Guideline 2.3.7). Describe imports generically (CSV / spreadsheet drawing
  logs), not by vendor.

---

## App information

| Field | Value | Limit |
|---|---|---|
| Name | **SteelBuild Pro** — owner to confirm the spelling. The 2026 brand lockup writes *SteelBuild-Pro*; the app, PWA manifest and `capacitor.config.ts` use *SteelBuild Pro*. The App Store name must also be unused by another app. | 30 |
| Subtitle | Steel projects, shop to field | 30 (29 used) |
| Bundle ID | `com.steelbuildpro.app` (fixed — matches `capacitor.config.ts` and the Xcode project) | — |
| SKU | `steelbuild-pro-ios` (internal only, never shown) | — |
| Primary language | English (U.S.) | — |
| Primary category | Business | — |
| Secondary category | Productivity | — |
| Content rights | Does not contain, show or access third-party content | — |
| Copyright | `© 2026 <legal entity that enrolls in the Apple Developer Program>` | — |

## Version information (1st submission: 2.1.1)

**Promotional text** (170 max, 124 used — editable without a new build)

> Drawings, RFIs, submittals and release gates on one project record, so the shop and the field build from the right revision.

**Keywords** (100 max, 96 used — comma-separated, no spaces after commas)

```
structural steel,fabricator,erector,RFI,submittal,drawing log,construction,detailing,ironwork,PM
```

**Description** (4,000 max)

> SteelBuild Pro is project management built for structural steel: fabricators, erectors, detailers and the project managers who coordinate them. It keeps drawings, RFIs, submittals, release decisions and piece status on one project record, so the office, the shop and the field work from the same information.
>
> DRAWINGS AND APPROVALS
> • Follow every drawing set through its approval stages, from issued-for-approval to released for fabrication.
> • See the current revision, who has the ball, and what still stands between a drawing and the shop.
> • Open drawing sheets on iPhone or iPad.
>
> RFIS AND SUBMITTALS
> • Keep the question, the responsible party, the required date and the next action together.
> • See aging and overdue responses before they hold up the next trade.
>
> RELEASE AND PRODUCTION
> • Check release gates before work goes to the shop: open RFIs and unapproved drawings are flagged, not buried.
> • Track work packages and pieces through fabrication, delivery and erection, with exceptions surfaced for the team.
>
> IN THE FIELD
> • Capture jobsite and delivery photos with the camera and attach them to the project.
> • Built-in steel tools: weight calculator, crane pick calculator, and feet-inch and fraction converters.
>
> FOR THE WHOLE TEAM
> • Each company works in its own secure workspace, with access controlled by role.
> • Works on iPhone and iPad, in light or dark mode.
>
> A SteelBuild Pro account is required. If your company already uses SteelBuild Pro, ask your workspace administrator for an invitation.

Before submitting, walk every bullet on the release build and delete any that
does not work there.

**What's New** (not shown for the first version) — leave empty for 1.0 of the
listing; later: one line per user-visible change.

## URLs

| Field | Value | Status |
|---|---|---|
| Privacy Policy URL | https://steelbuild-pro.com/privacy | Live. Must describe the iOS app's data use (camera/photos, Sentry diagnostics) — confirm with the App Privacy answers below. |
| Support URL | https://steelbuild-pro.com/support | **Owner decision** — see "Support URL" below. |
| Marketing URL (optional) | https://steelbuild-pro.com | Live. It shows pricing; that is allowed for the *marketing* URL field. |

## App Review information

- **Sign-in required:** yes.
- **Demo account:** a dedicated reviewer login in a workspace that already has
  an active plan and a realistic sample project (drawings with revisions, open
  RFIs, a submittal awaiting approval, a released package, photos). Reviewers
  cannot create a workspace or pay, so without this the review stops at the
  login screen (Guideline 2.1). Do not reuse a real customer's data.
- **Notes for the reviewer** (paste, then fill the placeholders):

```
SteelBuild Pro is a business (B2B) project-management app for structural-steel
fabricators and erectors. Each company's workspace and subscription are set up
by its administrator outside the app; the iOS app is sign-in only and contains
no purchasing.

Demo login (pre-loaded sample project, active plan):
  Email:    <reviewer email>
  Password: <reviewer password>

Suggested path:
1. Sign in. The Dashboard opens on the sample project.
2. Drawings: open a drawing set to see its revisions and approval stage.
3. RFIs: open an RFI to see the responsible party and required date.
4. Photos: add a photo. This shows the camera / photo-library permission prompt.
5. Settings > Profile > "Delete my account" is the in-app account deletion
   (Guideline 5.1.1(v)). You may complete it; we will re-create the demo account.

Native features: camera capture, photo-library attach, haptics, native splash
and status bar, and the app shell is bundled so it opens without a network.
```

- **Contact:** name, phone and email of the person who answers App Review.

## Support URL

App Store Connect requires a Support URL that leads to real contact
information. The site has `support@steelbuild-pro.com` on `/privacy` and
`/security` but no page whose purpose is support. Options, in order of
preference:

1. Add a small public `/support` page (contact email, how to get an invitation,
   how to delete an account) — also useful for the Google Play listing.
2. Use `https://steelbuild-pro.com/security` until then (it lists the support
   address, but a reviewer may not find it quickly).
