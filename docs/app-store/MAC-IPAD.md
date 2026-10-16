# iPad and Mac delivery

## Verified Mac upload — 2026-10-16

Mac version **1.0.0**, build **20261016**, source commit
`f1e5edef78f749063e6014e1c81e51a5960bf817` was signed, packaged, validated and
uploaded by [release run 38969556839](https://github.com/lorteezy87/SteelBuild-Pro-Rev.2/actions/runs/38969556839).
The receipt confirms **MAC_OS**, exact version/build, **VALID** processing and
updated en-US What to Test. The package contains arm64 and x86_64; both app and
installer signatures were verified. Package SHA256:
`7b4bffbaa3b0942c63436e6c8ba22b31248b7cec767227719f37a800c2344ee3`.
PR #559 is merged. All five required main CI jobs passed in run 38969470989;
the dependency audit is still an advisory failure. **App Review was not submitted.**

Before App Review, complete the separately reviewed native CORS backend rollout,
authenticated Mac/iPad project/upload/export/editing acceptance using a dedicated
test workspace, real app screenshots, listing metadata, reviewer account and
owner review contact details. The Mac upload proves packaging and Apple processing,
not those authenticated product workflows. Production handlers differ from current
main in some functions, so replacing every live handler from main is not a safe
shortcut for the CORS rollout; retain the existing reviewed-backend release process.

## iPad: already in the uploaded iOS release

Version 1.0.0, build 20261016, commit bc6380b5fbe0385411f6e1cf06e4eff2b3a1bcbb
was uploaded by iOS release run 38948751514. Apple reported VALID.
The App target uses device families 1 and 2 and declares all four iPad orientations.
iPad uses this same iOS build; it needs no separate binary or app record.

Native validation run 38951763063 built the simulator binary, verified that
UIDeviceFamily contains 2, installed and launched it on a 13-inch iPad, and captured
the rendered sign-in screen. This validates launch, not authenticated workflows.

Select the build on the iOS version page. Supply actual iPad screenshots and test
project access, imports/exports, keyboard editing, rotation, and multitasking.

## Mac: standalone native shell

Catalyst probes 38951763063 and 38952500832 established that the current Capacitor
and Cordova XCFrameworks contain no Mac Catalyst libraries. Do not switch the
working iOS project to Catalyst or represent those probes as successful builds.

The Mac app instead uses SwiftUI/AppKit and WKWebView with the same bundled Vite
application. It opens the project sign-in route and supports native back/forward,
reload, file selection, save dialogs, and browser handling of external links.
It has its own sandboxed browser session. Native iOS plugin APIs are not exposed;
shared web fallbacks apply. macOS 13+ is required.

Run `bash scripts/macos-build.sh` on a Mac with Xcode after `npm ci`.
The script compiles arm64 and x86_64, creates a universal app with the existing
product icon, bundles web assets/privacy metadata, and applies an ad-hoc signature
for development validation. No App Store upload occurs.

Run 38953091100 proved the universal binary, strict local signature verification,
and rendered public shell launch. Its screenshot showed the marketing page; the
subsequent change starts at /Dashboard so a fresh session reaches sign-in.
Final development run 38954754567 confirmed rendered sign-in and the exact native
origin steelbuild://localhost; its screenshot was inspected.

Development artifacts are not Apple distribution-signed or notarized. A local
ad-hoc signature is not App Store or Gatekeeper release approval.

## Native networking

The existing Edge CORS helper rejected custom native WebView origins. The source
fix recognizes only capacitor://localhost and steelbuild://localhost for CORS.
They are never accepted by isAllowedOrigin for billing redirect URLs.
Unknown/null/custom origins, host suffixes, credentials, ports, and paths stay
rejected. JWT/MFA/RLS checks still determine authorization.

The source fix must be reviewed and deployed with each affected live Edge Function
before native Edge workflows can be marked verified. This branch does not deploy
backend code. Eighty-seven focused CORS and Stripe handler tests passed locally.

## Mac App Store prerequisites

The Mac distribution app has now been uploaded successfully. The signing setup
and repeatable release path are:

1. Create a Mac App Store Connect provisioning profile for com.steelbuildpro.app
   (register/enable the macOS identifier if required). Name it
   **SteelBuild Pro Mac App Store**. The iOS profile cannot sign this Mac app.
2. Create a **Mac Installer Distribution** certificate and export it with its
   matching private key as a password-protected .p12.
3. Store the profile as MAC_PROVISIONING_PROFILE_BASE64 and the installer material
   as MAC_INSTALLER_CERTIFICATE_BASE64 / MAC_INSTALLER_CERTIFICATE_PASSWORD in the
   GitHub app-store environment. Do not send private keys or passwords in chat.
   The existing Apple Distribution application certificate may be reused if it
   is valid for this Mac profile.
4. Run the gated Mac App Store release workflow from main for future builds.
   It performs distribution signing, productbuild packaging, Apple validation,
   optional upload, and receipt checks for MAC_OS plus exact version/build.
5. Test the signed sandboxed app: sign-in, project access, uploads, downloads,
   file exports, external links, keyboard editing and window resizing. Camera
   capture and protected workflows are not yet accepted on Mac.
6. Supply Mac screenshots and review metadata on the macOS version page.

Do not reuse the iOS receipt verifier unchanged: identical version/build numbers
can exist on multiple platforms, so Mac verification must check MAC_OS explicitly.
App Review submission remains separate from building/uploading.

References:
- https://developer.apple.com/documentation/xcode/creating-distribution-signed-code-for-the-mac/
- https://developer.apple.com/documentation/xcode/packaging-mac-software-for-distribution
- https://developer.apple.com/help/account/provisioning-profiles/create-an-app-store-provisioning-profile
- https://developer.apple.com/documentation/xcode/configuring-the-macos-app-sandbox


## Gated Mac distribution workflow

`macos-release.yml` waits for all five production CI jobs on the exact source
commit. Branch runs may sign and validate only; uploads require current main and
its completed push CI. The installer/profile secrets are separate from iOS; the
existing Apple Distribution .p12 is reused only when its private-key identity is
present in the Mac profile. Profile platform, team, App ID, expiry, and App Store
distribution type are checked before signing. Credentials remain in a temporary
keychain/directory and are cleaned on exit.

The workflow builds both architectures, embeds the Mac profile and exact signed
entitlements, produces a signed productbuild package, verifies both signatures,
and validates the package with Apple. Upload is optional and defaults to false.
Upload receipt verification requires MAC_OS, the exact marketing/build versions,
and VALID processing; a matching iOS build never satisfies Mac verification.
The Mac en-US What to Test text is updated only after that match. This does not
submit App Review or make authenticated workflow acceptance unnecessary.

Owner-created profile inspected on 2026-10-16: OSX, exact bundle ID,
App Store distribution, unexpired. No private key or password was uploaded in chat.
The three Mac secrets in app-store were confirmed usable by private-key identity
matching, successful distribution signing, installer packaging and Apple validation.

First signed run 38965878832 confirmed both signing identities, the universal app
signature, exact entitlements, and installer signature. Apple validation rejected
the payload with error 90255 because the secret-protection umask also made bundled
resources root-only. The release now normalizes the public app payload to readable
files/traversable directories before signing, and uses normal permissions for newly
generated signature resources. The temporary signing directory stays private.

A fresh GitHub main-head comparison runs immediately before the upload command,
after package validation, so approval queues/build delays cannot release stale main.
Nineteen focused gate/receipt/permissions tests passed locally. Corrected-package
Apple validation passed in run 38968083388, and the main release upload/VALID receipt
passed in run 38969556839.

Future iOS release follow-up: make the existing iOS receipt matcher explicitly
require platform IOS as well as marketing/build versions now that both platforms
can share those numbers. The uploaded iOS build was verified before this Mac upload;
the new Mac matcher already requires MAC_OS.
