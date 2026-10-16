#!/usr/bin/env bash
# Unsigned feasibility builds only. Store uploads must use a separately gated release.
set -euo pipefail
platform=${1:?Expected ipad or mac}
[[ "$platform" == ipad || "$platform" == mac ]] || exit 2
mkdir -p apple-platform-output
npm run build
npx cap sync ios
common=(-project ios/App/App.xcodeproj -scheme App -configuration Release CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=)
if [[ "$platform" == mac ]]; then
  # Destination discovery reads the project before command-line overrides are applied.
  python3 - <<'PYMAC'
from pathlib import Path
p = Path('ios/App/App.xcodeproj/project.pbxproj')
s = p.read_text()
marker = 'TARGETED_DEVICE_FAMILY = "1,2";'
assert s.count(marker) == 2
s = s.replace(marker, marker + '\n\t\t\t\tSUPPORTS_MACCATALYST = YES;\n\t\t\t\tDERIVE_MACCATALYST_PRODUCT_BUNDLE_IDENTIFIER = NO;\n\t\t\t\tSUPPORTED_PLATFORMS = "iphoneos iphonesimulator macosx";')
p.write_text(s)
PYMAC
  xcodebuild "${common[@]}" -destination 'generic/platform=macOS,variant=Mac Catalyst' \
    -archivePath "$RUNNER_TEMP/SteelBuild-Mac.xcarchive" \
    SUPPORTS_MACCATALYST=YES DERIVE_MACCATALYST_PRODUCT_BUNDLE_IDENTIFIER=NO \
    archive > apple-platform-output/mac-build.log 2>&1
  app="$RUNNER_TEMP/SteelBuild-Mac.xcarchive/Products/Applications/App.app"
  test -d "$app"
  /usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app/Contents/Info.plist" > apple-platform-output/mac-bundle.txt
  ditto -c -k --sequesterRsrc --keepParent "$app" apple-platform-output/SteelBuild-Pro-Mac-unsigned.zip
else
  xcodebuild "${common[@]}" -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
    -derivedDataPath "$RUNNER_TEMP/SteelBuild-iPad" build > apple-platform-output/ipad-build.log 2>&1
  app="$RUNNER_TEMP/SteelBuild-iPad/Build/Products/Release-iphonesimulator/App.app"
  python3 - "$app/Info.plist" <<'PY'
import plistlib, sys
with open(sys.argv[1], 'rb') as f:
    info = plistlib.load(f)
assert 2 in info['UIDeviceFamily'], 'Build does not support iPad.'
print('Verified iPad device family in built app.')
PY
  xcrun simctl list devices available -j > "$RUNNER_TEMP/devices.json"
  device=$(python3 - "$RUNNER_TEMP/devices.json" <<'PY'
import json, sys
with open(sys.argv[1]) as f:
    devices = json.load(f)['devices']
pads = [d for group in devices.values() for d in group if 'iPad' in d['name'] and d.get('isAvailable')]
assert pads, 'No available iPad simulator.'
pad = next((d for d in pads if '13-inch' in d['name']), pads[0])
print(pad['udid'])
PY
)
  xcrun simctl boot "$device" || true
  xcrun simctl bootstatus "$device" -b
  xcrun simctl install "$device" "$app"
  xcrun simctl launch "$device" com.steelbuildpro.app > apple-platform-output/ipad-launch.txt
  # Let the bundled WebView finish its first launch before the visual evidence capture.
  sleep 15
  xcrun simctl io "$device" screenshot apple-platform-output/ipad-launch.png
fi
python3 - "$platform" <<'PY'
import json, os, sys
from pathlib import Path
platform = sys.argv[1]
Path(f'apple-platform-output/{platform}-evidence.json').write_text(json.dumps({
    'commit': os.environ['GITHUB_SHA'], 'platform': platform,
    'build': 'passed', 'signed': False, 'uploaded': False,
    'scope': 'simulator launch only; protected workflows untested' if platform == 'ipad' else 'Catalyst archive only; runtime and store signing untested'
}, indent=2) + '\n')
PY
