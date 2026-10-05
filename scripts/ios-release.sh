#!/usr/bin/env bash
# Run only through ios-release.yml: that workflow verifies the exact commit's CI.
set -euo pipefail
set +x
umask 077

fail() { echo "::error::$1" >&2; exit 1; }
save_diagnostics() {
  mkdir -p ios/App/output
  python3 - "$1" <<'PY'
import os, re, sys
from pathlib import Path
text = Path(sys.argv[1]).read_text(errors='replace')
for name, value in os.environ.items():
    if value and (name.startswith(('ASC_', 'IOS_', 'VITE_')) or name in ('RUNNER_TEMP', 'HOME')):
        text = text.replace(value, '[redacted]')
text = re.sub(r'-----BEGIN .*?-----.*?-----END .*?-----', '[redacted key]', text, flags=re.S)
lines = [line for line in text.splitlines() if not any(word in line.lower() for word in ('signing identity:', 'provisioning profile:', 'codesign '))]
Path('ios/App/output/xcode-diagnostics.txt').write_text('\n'.join(lines[-80:]) + '\n')
PY
}
[[ "$(uname -s)" == Darwin ]] || fail 'A macOS runner with Xcode is required.'
[[ "${GITHUB_ACTIONS:-}" == true && "${GITHUB_REF:-}" == refs/heads/main ]] || fail 'Use the gated main iOS App Store release workflow.'
[[ "${IOS_BUILD_NUMBER:-}" =~ ^[1-9][0-9]{0,8}$ ]] || fail 'Build number must be a positive integer of at most nine digits.'
[[ "${IOS_VERSION:-}" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || fail 'Version must have three numeric components, such as 1.0.0.'
[[ "${IOS_UPLOAD:-false}" == true || "${IOS_UPLOAD:-false}" == false ]] || fail 'Upload must be true or false.'
[[ -z "${CAP_SERVER_URL:-}" ]] || fail 'Live reload must be disabled for release.'
for name in IOS_TEAM_ID IOS_CERTIFICATE_BASE64 IOS_CERTIFICATE_PASSWORD IOS_PROVISIONING_PROFILE_BASE64 VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY; do
  [[ -n "${!name:-}" ]] || fail "Required app-store environment secret is missing: $name"
done
[[ "$VITE_SUPABASE_URL" == 'https://kjrwqagyeswwoxpjkcko.supabase.co' ]] || fail 'The release must use the reviewed production Supabase project.'
[[ "$VITE_SUPABASE_ANON_KEY" != *placeholder* ]] || fail 'Refusing a placeholder client key.'
if [[ "${IOS_UPLOAD:-false}" == true ]]; then
  for name in ASC_KEY_ID ASC_ISSUER_ID ASC_PRIVATE_KEY_BASE64; do
    [[ -n "${!name:-}" ]] || fail "Required upload secret is missing: $name"
  done
fi
xcode_major=$(xcodebuild -version | awk '/^Xcode / { split($2, v, "."); print v[1] }')
sdk_major=$(xcrun --sdk iphoneos --show-sdk-version | cut -d. -f1)
[[ "$xcode_major" -ge 26 && "$sdk_major" -ge 26 ]] || fail 'Xcode 26 and iOS 26 SDK or newer are required.'

release_tmp=$(mktemp -d "${RUNNER_TEMP:?}/steelbuild-ios.XXXXXX")
release_keychain="$release_tmp/signing.keychain-db"
profile_path=''
cleanup() {
  security delete-keychain "$release_keychain" >/dev/null 2>&1 || true
  if [[ -n "$profile_path" ]]; then rm -f "$profile_path"; fi
  rm -rf "$release_tmp"
}
trap cleanup EXIT
export IOS_RELEASE_TEMP="$release_tmp"
python3 - <<'PY'
import base64, os
from pathlib import Path
root = Path(os.environ['IOS_RELEASE_TEMP'])
for key, filename in [('IOS_CERTIFICATE_BASE64', 'certificate.p12'), ('IOS_PROVISIONING_PROFILE_BASE64', 'profile.mobileprovision')]:
    (root / filename).write_bytes(base64.b64decode(os.environ[key], validate=True))
if os.environ.get('IOS_UPLOAD') == 'true':
    (root / 'AuthKey.p8').write_bytes(base64.b64decode(os.environ['ASC_PRIVATE_KEY_BASE64'], validate=True))
PY
security cms -D -i "$release_tmp/profile.mobileprovision" > "$release_tmp/profile.plist"
profile_uuid=$(python3 - <<'PY'
import datetime, os, plistlib
from pathlib import Path
p = plistlib.loads((Path(os.environ['IOS_RELEASE_TEMP']) / 'profile.plist').read_bytes())
team = os.environ['IOS_TEAM_ID']
assert team in p['TeamIdentifier'], 'Provisioning profile has a different team.'
assert p['Entitlements']['application-identifier'] == team + '.com.steelbuildpro.app', 'Profile does not match the exact bundle ID.'
assert not p.get('ProvisionedDevices') and not p.get('ProvisionsAllDevices'), 'An App Store distribution profile is required.'
assert not p['Entitlements'].get('get-task-allow'), 'Development profile cannot be released.'
assert p['ExpirationDate'] > datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None), 'Profile expired.'
print(p['UUID'])
PY
)
echo "::add-mask::$profile_uuid"
profile_dir="$HOME/Library/MobileDevice/Provisioning Profiles"
mkdir -p "$profile_dir"
profile_destination="$profile_dir/$profile_uuid.mobileprovision"
[[ ! -e "$profile_destination" ]] || fail 'Runner already has this provisioning profile; refusing to replace it.'
cp "$release_tmp/profile.mobileprovision" "$profile_destination"
profile_path="$profile_destination"
keychain_password=$(openssl rand -hex 24)
echo "::add-mask::$keychain_password"
security create-keychain -p "$keychain_password" "$release_keychain"
security set-keychain-settings -lut 21600 "$release_keychain"
security unlock-keychain -p "$keychain_password" "$release_keychain"
security import "$release_tmp/certificate.p12" -P "$IOS_CERTIFICATE_PASSWORD" -A -t cert -f pkcs12 -k "$release_keychain" >/dev/null
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$keychain_password" "$release_keychain" >/dev/null
security list-keychains -d user -s "$release_keychain"

npm run build
npx cap sync ios
node --input-type=module - <<'JS'
import fs from 'node:fs';
const config = JSON.parse(fs.readFileSync('ios/App/App/capacitor.config.json', 'utf8'));
if (config.appId !== 'com.steelbuildpro.app' || config.server?.url) throw new Error('Unsafe native release configuration.');
JS
mkdir -p ios/App/output
archive="$release_tmp/SteelBuild-Pro.xcarchive"
if ! xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$archive" \
  CURRENT_PROJECT_VERSION="$IOS_BUILD_NUMBER" MARKETING_VERSION="$IOS_VERSION" \
  DEVELOPMENT_TEAM="$IOS_TEAM_ID" CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY='Apple Distribution' \
  PROVISIONING_PROFILE_SPECIFIER="$profile_uuid" archive > "$release_tmp/archive.log" 2>&1; then
  save_diagnostics "$release_tmp/archive.log"
  fail 'Xcode archive failed. Inspect this run with a signing administrator; no build was uploaded.'
fi
export IOS_ARCHIVE_PATH="$archive" IOS_PROFILE_UUID="$profile_uuid"
python3 - <<'PY'
import os, plistlib
from pathlib import Path
app = Path(os.environ['IOS_ARCHIVE_PATH']) / 'Products/Applications/App.app'
p = plistlib.loads((app / 'Info.plist').read_bytes())
assert p['CFBundleIdentifier'] == 'com.steelbuildpro.app'
assert p['CFBundleVersion'] == os.environ['IOS_BUILD_NUMBER']
assert p['CFBundleShortVersionString'] == os.environ['IOS_VERSION']
assert p.get('ITSAppUsesNonExemptEncryption') is False
assert (app / 'PrivacyInfo.xcprivacy').exists()
options = {'method': 'app-store-connect', 'destination': 'upload' if os.environ.get('IOS_UPLOAD') == 'true' else 'export',
  'signingStyle': 'manual', 'teamID': os.environ['IOS_TEAM_ID'], 'signingCertificate': 'Apple Distribution',
  'provisioningProfiles': {'com.steelbuildpro.app': os.environ['IOS_PROFILE_UUID']},
  'manageAppVersionAndBuildNumber': False, 'testFlightInternalTestingOnly': False, 'uploadSymbols': True}
(Path(os.environ['IOS_RELEASE_TEMP']) / 'ExportOptions.plist').write_bytes(plistlib.dumps(options))
PY
upload_args=()
if [[ "${IOS_UPLOAD:-false}" == true ]]; then
  upload_args=(-allowProvisioningUpdates -authenticationKeyPath "$release_tmp/AuthKey.p8" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")
fi
if ! xcodebuild -exportArchive -archivePath "$archive" -exportPath "$release_tmp/export" \
  -exportOptionsPlist "$release_tmp/ExportOptions.plist" "${upload_args[@]}" > "$release_tmp/export.log" 2>&1; then
  save_diagnostics "$release_tmp/export.log"
  fail 'Archive passed, but export/upload failed. App Store Connect receipt is unconfirmed.'
fi
if [[ "${IOS_UPLOAD:-false}" == true ]]; then
  ASC_KEY_PATH="$release_tmp/AuthKey.p8" node scripts/ios-verify-upload.mjs
else
  cp "$release_tmp/export/"*.ipa ios/App/output/
fi
python3 - <<'PY'
import json, os
from pathlib import Path
result = {'commit': os.environ['GITHUB_SHA'], 'bundleId': 'com.steelbuildpro.app',
  'version': os.environ['IOS_VERSION'], 'buildNumber': os.environ['IOS_BUILD_NUMBER'],
  'archive': 'passed', 'export': 'passed', 'uploadRequested': os.environ.get('IOS_UPLOAD') == 'true',
  'appReviewSubmitted': False}
Path('ios/App/output/release-evidence.json').write_text(json.dumps(result, indent=2) + '\n')
PY
echo 'Signed archive and export verified. App Review submission remains a separate step.'
