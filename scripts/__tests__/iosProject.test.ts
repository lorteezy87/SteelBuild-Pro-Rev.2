import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The committed Xcode project under ios/ is edited by hand, by Xcode, and by
 * `cap sync`, and none of those checks what App Store Connect will reject.
 * These tests pin the settings a rejected upload or a missing permission
 * prompt would otherwise be the first to report.
 */
const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

const INFO_PLIST = "ios/App/App/Info.plist";
const PBXPROJ = "ios/App/App.xcodeproj/project.pbxproj";

/** The <string>/<true/>/<false/> value that follows `<key>name</key>` in a plist. */
function plistValue(plist: string, key: string): string | undefined {
  const match = plist.match(new RegExp(`<key>${key}</key>\\s*(<string>([^<]*)</string>|<(true|false)/>)`));
  return match ? (match[2] ?? match[3]) : undefined;
}

/** Width, height and colour type out of a PNG's IHDR chunk, which always starts at byte 16. */
function pngHeader(rel: string): { width: number; height: number; colorType: number } {
  const buf = readFileSync(resolve(process.cwd(), rel));
  expect(buf.subarray(12, 16).toString("ascii")).toBe("IHDR");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colorType: buf[25] };
}

describe("iOS native project", () => {
  it("registers the same bundle identifier as capacitor.config.ts", () => {
    const appId = read("capacitor.config.ts").match(/appId:\s*'([^']+)'/)?.[1];
    expect(appId).toBe("com.steelbuildpro.app");
    const ids = [...read(PBXPROJ).matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map((m) => m[1]);
    // One per build configuration (Debug + Release), all the same App Store record.
    expect(ids).toEqual([appId, appId]);
  });

  it("carries a purpose string for every permission the camera plugin can prompt for", () => {
    // Apple rejects a binary that can reach the camera or photo library
    // without these, and App Review reads the text verbatim.
    const plist = read(INFO_PLIST);
    for (const key of ["NSCameraUsageDescription", "NSPhotoLibraryUsageDescription", "NSPhotoLibraryAddUsageDescription"]) {
      expect(plistValue(plist, key)?.trim().length ?? 0, key).toBeGreaterThan(20);
    }
  });

  it("declares export compliance so each upload skips the encryption questionnaire", () => {
    // The app uses only HTTPS and OS-provided cryptography.
    expect(plistValue(read(INFO_PLIST), "ITSAppUsesNonExemptEncryption")).toBe("false");
  });

  it("ships the privacy manifest inside the app bundle", () => {
    const manifest = read("ios/App/App/PrivacyInfo.xcprivacy");
    expect(plistValue(manifest, "NSPrivacyTracking")).toBe("false");
    // A file Xcode can see but that is not in the Resources phase never reaches
    // the .ipa, and App Store Connect then reports the manifest as missing.
    const pbx = read(PBXPROJ);
    const resources = pbx.match(/\/\* Resources \*\/ = \{\s*isa = PBXResourcesBuildPhase;[\s\S]*?files = \(([\s\S]*?)\);/)?.[1] ?? "";
    expect(resources).toContain("PrivacyInfo.xcprivacy in Resources");
  });

  it("has a 1024px App Store icon without an alpha channel", () => {
    // PNG colour type 2 is truecolour RGB; 6 would carry alpha, which App
    // Store Connect rejects (ITMS-90717) even when every pixel is opaque.
    expect(pngHeader("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png")).toEqual({
      width: 1024,
      height: 1024,
      colorType: 2,
    });
  });

  it("has a square launch splash large enough to aspect-fill an iPad Pro", () => {
    for (const name of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) {
      const { width, height } = pngHeader(`ios/App/App/Assets.xcassets/Splash.imageset/${name}`);
      expect({ width, height }).toEqual({ width: 2732, height: 2732 });
    }
  });

  it("links every Capacitor plugin in package.json into the Swift package", () => {
    // `cap sync` regenerates CapApp-SPM/Package.swift from package.json. A
    // plugin added without a sync still builds for the web and then fails at
    // runtime in the app with "plugin is not implemented on ios".
    const deps = Object.keys(JSON.parse(read("package.json")).dependencies as Record<string, string>);
    const plugins = deps.filter(
      (name) => name.startsWith("@capacitor/") && !["@capacitor/core", "@capacitor/ios", "@capacitor/android"].includes(name),
    );
    expect(plugins.length).toBeGreaterThan(0);
    const packageSwift = read("ios/App/CapApp-SPM/Package.swift");
    for (const plugin of plugins) {
      expect(packageSwift, plugin).toContain(`path: "../../../node_modules/${plugin}"`);
    }
  });

  it("never commits the copied web bundle or generated native config", () => {
    // cap sync writes these from dist/ and capacitor.config.ts on every run.
    const ignored = read("ios/.gitignore");
    for (const entry of ["App/App/public", "App/App/capacitor.config.json", "App/App/config.xml"]) {
      expect(ignored).toContain(entry);
    }
  });
});
