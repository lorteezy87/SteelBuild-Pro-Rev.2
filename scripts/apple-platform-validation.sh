#!/usr/bin/env bash
# Unsigned feasibility builds only. Store uploads must use a separately gated release.
set -euo pipefail
platform=${1:?Expected ipad or mac}
[[ "$platform" == ipad || "$platform" == mac ]] || exit 2
mkdir -p apple-platform-output
if [[ "$platform" == mac ]]; then
  bash scripts/macos-build.sh > apple-platform-output/mac-build.log 2>&1
  receipt="$HOME/Library/Containers/com.steelbuildpro.app/Data/tmp/steelbuild-launch-evidence.json"
  mkdir -p "$(dirname "$receipt")"
  app="apple-platform-output/SteelBuild Pro.app"
  "$app/Contents/MacOS/SteelBuildPro" --validation-evidence "$receipt" > apple-platform-output/mac-launch.log 2>&1 &
  app_pid=$!
  trap 'kill "$app_pid" 2>/dev/null || true' EXIT
  for attempt in $(seq 1 45); do
    [[ -f "$receipt" ]] && break
    sleep 2
  done
  cp "$receipt" apple-platform-output/mac-launch.json
  python3 - <<'PYMAC'
import json
from pathlib import Path
receipt = json.loads(Path('apple-platform-output/mac-launch.json').read_text())
assert receipt['rendered'] and receipt['textLength'] > 100, 'Mac WebView did not render the application.'
assert receipt['origin'] == 'steelbuild://localhost', 'Unexpected Mac WebView origin.'
assert receipt['signInVisible'], 'Mac did not present the sign-in flow.'
PYMAC
  screencapture -x apple-platform-output/mac-launch.png || true
else
  npm run build
  npx cap sync ios
  common=(-project ios/App/App.xcodeproj -scheme App -configuration Release CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=)
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
    'build': 'passed', 'storeSigned': False, 'uploaded': False,
    'scope': 'simulator launch only; protected workflows untested' if platform == 'ipad' else 'Mac development build and public shell launch only; protected workflows and store signing untested'
}, indent=2) + '\n')
PY
