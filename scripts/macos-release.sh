#!/usr/bin/env bash
# Called only by the gated macos-release workflow; never submits App Review.
set -euo pipefail
set +x
umask 077
fail() { echo "::error::$1" >&2; exit 1; }
[[ "$(uname -s)" == Darwin ]] || fail 'A Mac with Xcode is required.'
[[ "${GITHUB_ACTIONS:-}" == true ]] || fail 'Use the gated Mac workflow.'
[[ "${MAC_UPLOAD:-false}" == true || "${MAC_UPLOAD:-false}" == false ]] || fail 'Invalid upload selection.'
[[ "${MAC_UPLOAD:-false}" != true || "${GITHUB_REF:-}" == refs/heads/main ]] || fail 'Uploads require main.'
[[ "${MAC_VERSION:-}" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || fail 'Invalid marketing version.'
[[ "${MAC_BUILD_NUMBER:-}" =~ ^[1-9][0-9]{0,8}$ ]] || fail 'Invalid build number.'
for name in IOS_TEAM_ID IOS_CERTIFICATE_BASE64 IOS_CERTIFICATE_PASSWORD MAC_INSTALLER_CERTIFICATE_BASE64 MAC_INSTALLER_CERTIFICATE_PASSWORD MAC_PROVISIONING_PROFILE_BASE64 ASC_KEY_ID ASC_ISSUER_ID ASC_PRIVATE_KEY_BASE64 VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY; do
  [[ -n "${!name:-}" ]] || fail "Missing app-store secret: $name"
done
[[ "$VITE_SUPABASE_URL" == https://kjrwqagyeswwoxpjkcko.supabase.co ]] || fail 'Reviewed production backend is required.'
[[ "$VITE_SUPABASE_ANON_KEY" != *placeholder* && -z "${CAP_SERVER_URL:-}" ]] || fail 'Invalid release configuration.'
[[ "$(xcodebuild -version | awk '/^Xcode / {split($2,v,"."); print v[1]}')" -ge 26 ]] || fail 'Xcode 26+ is required.'
release_tmp=$(mktemp -d "${RUNNER_TEMP:?}/steelbuild-mac.XXXXXX")
export MAC_RELEASE_TEMP="$release_tmp"
release_keychain="$release_tmp/signing.keychain-db"
security list-keychains -d user > "$release_tmp/original-keychains.txt"
cleanup() {
  python3 - <<'PYRESTORE' || true
import os, shlex, subprocess
from pathlib import Path
paths=shlex.split((Path(os.environ['MAC_RELEASE_TEMP'])/'original-keychains.txt').read_text())
subprocess.run(['security','list-keychains','-d','user','-s',*paths],check=True)
PYRESTORE
  security delete-keychain "$release_keychain" >/dev/null 2>&1 || true
  rm -rf "$release_tmp"
}
trap cleanup EXIT
mkdir -p macos/output
save_diagnostics() {
  python3 - "$1" <<'PYLOG'
import os,re,sys
from pathlib import Path
s=Path(sys.argv[1]).read_text(errors='replace')
for k,v in os.environ.items():
 if v and (k.startswith(('ASC_','IOS_','MAC_','VITE_')) or k in ('HOME','RUNNER_TEMP')): s=s.replace(v,'[redacted]')
s=re.sub(r'-----BEGIN .*?-----.*?-----END .*?-----','[redacted]',s,flags=re.S)
s='\n'.join(line for line in s.splitlines() if not any(x in line.lower() for x in ['signing identity','provisioning profile','authority=','teamidentifier=','3rd party mac developer','apple distribution:']))
Path('macos/output/release-diagnostics.txt').write_text(s[-12000:])
PYLOG
}
run_private() {
  local label="$1"; shift
  if ! "$@" > "$release_tmp/command.log" 2>&1; then
    save_diagnostics "$release_tmp/command.log"
    fail "$label failed. Inspect the sanitized diagnostics; upload is unconfirmed."
  fi
}
python3 - <<'PYDECODE'
import base64,os
from pathlib import Path
p=Path(os.environ['MAC_RELEASE_TEMP'])
for k,n in [('IOS_CERTIFICATE_BASE64','application.p12'),('MAC_INSTALLER_CERTIFICATE_BASE64','installer.p12'),('MAC_PROVISIONING_PROFILE_BASE64','profile.provisionprofile')]:
 (p/n).write_bytes(base64.b64decode(os.environ[k],validate=True))
keys=p/'private_keys'; keys.mkdir()
(keys/f'AuthKey_{os.environ["ASC_KEY_ID"]}.p8').write_bytes(base64.b64decode(os.environ['ASC_PRIVATE_KEY_BASE64'],validate=True))
PYDECODE
security cms -D -i "$release_tmp/profile.provisionprofile" > "$release_tmp/profile.plist"
python3 - <<'PYPROFILE'
import datetime,hashlib,os,plistlib
from pathlib import Path
p=Path(os.environ['MAC_RELEASE_TEMP']); profile=plistlib.loads((p/'profile.plist').read_bytes()); team=os.environ['IOS_TEAM_ID']
assert profile.get('Platform')==['OSX'], 'Expected macOS profile.'
assert team in profile['TeamIdentifier'], 'Profile team mismatch.'
assert profile['Entitlements']['com.apple.application-identifier']==team+'.com.steelbuildpro.app', 'Profile App ID mismatch.'
assert profile['ExpirationDate']>datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None), 'Profile expired.'
assert not profile.get('ProvisionedDevices') and not profile.get('ProvisionsAllDevices'), 'App Store profile required.'
assert not profile['Entitlements'].get('get-task-allow') and not profile['Entitlements'].get('com.apple.security.get-task-allow'), 'Development profile rejected.'
(p/'allowed-application-hashes.txt').write_text('\n'.join(hashlib.sha1(c).hexdigest().upper() for c in profile['DeveloperCertificates']))
e=plistlib.loads(Path('macos/SteelBuildPro/SteelBuildPro.entitlements').read_bytes())
e['com.apple.application-identifier']=profile['Entitlements']['com.apple.application-identifier']
e['com.apple.developer.team-identifier']=team
(p/'entitlements.plist').write_bytes(plistlib.dumps(e))
PYPROFILE
keychain_password=$(openssl rand -hex 24)
echo "::add-mask::$keychain_password"
run_private 'Create signing keychain' security create-keychain -p "$keychain_password" "$release_keychain"
security set-keychain-settings -lut 21600 "$release_keychain"
security unlock-keychain -p "$keychain_password" "$release_keychain"
run_private 'Import application certificate' security import "$release_tmp/application.p12" -P "$IOS_CERTIFICATE_PASSWORD" -A -t cert -f pkcs12 -k "$release_keychain"
run_private 'Import installer certificate' security import "$release_tmp/installer.p12" -P "$MAC_INSTALLER_CERTIFICATE_PASSWORD" -A -t cert -f pkcs12 -k "$release_keychain"
run_private 'Authorize signing tools' security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$keychain_password" "$release_keychain"
security list-keychains -d user -s "$release_keychain"
security find-identity -v "$release_keychain" > "$release_tmp/identities.txt"
python3 - <<'PYIDENTITY'
import os,re
from pathlib import Path
p=Path(os.environ['MAC_RELEASE_TEMP']); identities=re.findall(r'\b([A-F0-9]{40}) "([^"]+)"', (p/'identities.txt').read_text())
allowed=(p/'allowed-application-hashes.txt').read_text().splitlines(); team=os.environ['IOS_TEAM_ID']
app=[h for h,n in identities if h in allowed and (n.startswith('Apple Distribution:') or n.startswith('3rd Party Mac Developer Application:')) and f'({team})' in n]
installer=[h for h,n in identities if n.startswith('3rd Party Mac Developer Installer:') and f'({team})' in n]
assert len(app)==1, 'No unique private-key application identity matches the Mac profile.'
assert len(installer)==1, 'No unique Mac App Store installer private-key identity for this team.'
(p/'app-identity').write_text(app[0]); (p/'installer-identity').write_text(installer[0])
PYIDENTITY
app_identity=$(cat "$release_tmp/app-identity")
installer_identity=$(cat "$release_tmp/installer-identity")
echo "::add-mask::$app_identity"
echo "::add-mask::$installer_identity"
MAC_BUILD_OUTPUT="$release_tmp/build" run_private 'Universal Mac build' bash scripts/macos-build.sh
app="$release_tmp/build/SteelBuild Pro.app"
export MAC_RELEASE_APP="$app"
cp "$release_tmp/profile.provisionprofile" "$app/Contents/embedded.provisionprofile"
python3 - <<'PYINFO'
import os,plistlib,subprocess
from pathlib import Path
p=Path(os.environ['MAC_RELEASE_APP'])/'Contents/Info.plist'; info=plistlib.loads(p.read_bytes())
assert info['CFBundleIdentifier']=='com.steelbuildpro.app'
info.update(CFBundleVersion=os.environ['MAC_BUILD_NUMBER'],CFBundleShortVersionString=os.environ['MAC_VERSION'],
 DTPlatformName='macosx',DTPlatformVersion=subprocess.check_output(['xcrun','--sdk','macosx','--show-sdk-version'],text=True).strip(),
 DTSDKName='macosx'+subprocess.check_output(['xcrun','--sdk','macosx','--show-sdk-version'],text=True).strip(),
 DTSDKBuild=subprocess.check_output(['xcrun','--sdk','macosx','--show-sdk-build-version'],text=True).strip(),
 BuildMachineOSBuild=subprocess.check_output(['sw_vers','-buildVersion'],text=True).strip(),CFBundleSupportedPlatforms=['MacOSX'])
xcode=subprocess.check_output(['xcodebuild','-version'],text=True).splitlines(); v=xcode[0].split()[1].split('.')
info['DTXcode']=v[0].zfill(2)+''.join((v+['0','0'])[i] for i in (1,2)); info['DTXcodeBuild']=xcode[1].split()[-1]
p.write_bytes(plistlib.dumps(info))
assert (p.parent/'Resources/PrivacyInfo.xcprivacy').exists()
PYINFO
node scripts/macos-bundle-permissions.mjs "$app"
# Newly generated signature resources must also be readable. All private material
# already lives inside the mode-0700 release_tmp directory and retains mode 0600.
umask 022
run_private 'Distribution app signing' codesign --force --sign "$app_identity" --keychain "$release_keychain" --timestamp --entitlements "$release_tmp/entitlements.plist" "$app"
run_private 'Strict signature verification' codesign --verify --strict --verbose=2 "$app"
codesign -d --entitlements :- "$app" > "$release_tmp/signed-entitlements.plist" 2>/dev/null
python3 - <<'PYCHECK'
import os,plistlib
from pathlib import Path
p=Path(os.environ['MAC_RELEASE_TEMP']); actual=plistlib.loads((p/'signed-entitlements.plist').read_bytes()); expected=plistlib.loads((p/'entitlements.plist').read_bytes())
assert actual==expected, 'Signed entitlements differ from reviewed entitlements.'
assert actual['com.apple.security.app-sandbox'] is True
assert not actual.get('com.apple.security.get-task-allow')
PYCHECK
package='macos/output/SteelBuild-Pro-Mac.pkg'
run_private 'Installer packaging' productbuild --component "$app" /Applications --sign "$installer_identity" --keychain "$release_keychain" "$package"
run_private 'Installer signature verification' pkgutil --check-signature "$package"
export API_PRIVATE_KEYS_DIR="$release_tmp/private_keys"
run_private 'App Store package validation' xcrun altool --validate-app --type macos --file "$package" --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"
if [[ "${MAC_UPLOAD:-false}" == true ]]; then
  run_private 'App Store upload' xcrun altool --upload-app --type macos --file "$package" --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"
  ASC_KEY_PATH="$release_tmp/private_keys/AuthKey_$ASC_KEY_ID.p8" node scripts/macos-verify-upload.mjs
fi
python3 - <<'PYEVIDENCE'
import hashlib,json,os
from pathlib import Path
p=Path('macos/output'); package=p/'SteelBuild-Pro-Mac.pkg'
r=dict(commit=os.environ['GITHUB_SHA'],bundleId='com.steelbuildpro.app',platform='MAC_OS',version=os.environ['MAC_VERSION'],buildNumber=os.environ['MAC_BUILD_NUMBER'],architectures=['arm64','x86_64'],packageSHA256=hashlib.sha256(package.read_bytes()).hexdigest(),signature='verified',appStoreValidation='passed',uploadRequested=os.environ.get('MAC_UPLOAD')=='true',appReviewSubmitted=False)
(p/'release-evidence.json').write_text(json.dumps(r,indent=2)+'\n')
PYEVIDENCE
echo 'Signed universal Mac package validated. App Review has not been submitted.'
