# iPad and Mac delivery

## Existing iOS release

Version 1.0.0, build 20261016, commit bc6380b5fbe0385411f6e1cf06e4eff2b3a1bcbb
was uploaded by iOS release run 38948751514. Its App Store receipt reported VALID.
The Xcode App target uses TARGETED_DEVICE_FAMILY = "1,2" in both configurations,
and Info.plist declares all four iPad orientations. iPad uses the same iOS build;
do not create a second app record or upload a separate iPad binary.

Select the processed build on the iOS App Store version. Supply actual iPad
screenshots and test sign-in, protected project workflows, file import/export,
keyboard editing, orientation changes, and multitasking before review.

## Native validation

The Apple platform validation workflow builds bundled production web assets and
performs unsigned feasibility checks on macOS runners. It has no distribution
certificate or App Store API credentials and cannot upload a build.

- iPad: builds the simulator binary, checks UIDeviceFamily contains 2, installs
  and launches on an available iPad simulator, then captures a screenshot.
- Mac: enables Catalyst in an ephemeral copy of the Xcode project and attempts
  an unsigned archive. A successful archive is not proof of runtime behavior,
  sandbox compatibility, store signing, or App Store acceptance.

Artifacts are labeled unsigned and must not be presented as store releases.

## Mac distribution prerequisites

A Mac Catalyst release is a separate macOS binary. Before a store upload:

1. Enable Mac Catalyst on the existing com.steelbuildpro.app App ID in Apple Developer.
2. Create a Mac App Store Connect provisioning profile for that exact App ID.
   The iOS profile cannot sign the Mac app.
3. Configure Mac app sandbox permissions for observed needs: outgoing network,
   user-selected imports/exports, and camera if supported and exercised.
4. Store any Mac signing profile/certificate material in GitHub environment
   secrets, never in source or chat. Keep Mac and iOS profile secrets separate.
5. Run a reviewed, gated Mac signing/export/upload workflow; verify the receipt
   identifies platform MAC_OS as well as the expected version/build.
6. Verify the signed Mac app at runtime, including imports, downloads, share,
   keyboard shortcuts, resizing, authentication, and project access.
7. Add actual Mac screenshots and review metadata on the macOS version page.

The unsigned validation workflow intentionally does not replace these steps.
Do not reuse scripts/ios-verify-upload.mjs for Mac without adding a platform
filter: version and build numbers may coincide across iOS and macOS.

Apple references:
- https://developer.apple.com/help/account/capabilities/create-a-mac-version-of-an-ipad-app
- https://developer.apple.com/help/account/provisioning-profiles/create-an-app-store-provisioning-profile
- https://developer.apple.com/documentation/xcode/configuring-the-macos-app-sandbox
