#!/usr/bin/env bash
# Creates a universal, ad-hoc signed development app. Does not upload to any store.
set -euo pipefail
[[ "$(uname -s)" == Darwin ]] || { echo 'macOS with Xcode is required.' >&2; exit 1; }
output=${MAC_BUILD_OUTPUT:-apple-platform-output}
app="$output/SteelBuild Pro.app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
npm run build
cp macos/SteelBuildPro/Info.plist "$app/Contents/Info.plist"
cp -R dist "$app/Contents/Resources/web"
cp ios/App/App/PrivacyInfo.xcprivacy "$app/Contents/Resources/PrivacyInfo.xcprivacy"
iconset="$output/AppIcon.iconset"
mkdir -p "$iconset"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png --out "$iconset/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z "$double" "$double" ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png --out "$iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$iconset" -o "$app/Contents/Resources/AppIcon.icns"
sdk=$(xcrun --sdk macosx --show-sdk-path)
for arch in arm64 x86_64; do
  xcrun swiftc -swift-version 5 -parse-as-library -O -sdk "$sdk" -target "$arch-apple-macos13.0" \
    -framework SwiftUI -framework AppKit -framework WebKit -framework UniformTypeIdentifiers \
    macos/SteelBuildPro/SteelBuildPro.swift -o "$output/SteelBuildPro-$arch"
done
xcrun lipo -create "$output/SteelBuildPro-arm64" "$output/SteelBuildPro-x86_64" -output "$app/Contents/MacOS/SteelBuildPro"
codesign --force --sign - --entitlements macos/SteelBuildPro/SteelBuildPro.entitlements "$app"
codesign --verify --strict "$app"
xcrun lipo -info "$app/Contents/MacOS/SteelBuildPro" > "$output/mac-architectures.txt"
ditto -c -k --sequesterRsrc --keepParent "$app" "$output/SteelBuild-Pro-Mac-development.zip"
echo 'Mac development app built. App Store signing, packaging, and upload are separate.'
