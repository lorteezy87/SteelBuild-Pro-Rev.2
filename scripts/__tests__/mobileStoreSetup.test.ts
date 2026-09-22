import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(__dirname, "..", "..");
const packageJson = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8"));

describe("native store setup", () => {
  it("keeps first-party Capacitor support for both stores", () => {
    expect(packageJson.dependencies["@capacitor/ios"]).toBeDefined();
    expect(packageJson.dependencies["@capacitor/android"]).toBeDefined();
    expect(packageJson.scripts["cap:sync:android"]).toBe("npm run build && cap sync android");
    expect(packageJson.scripts.android).toBe("npm run cap:sync:android && cap open android");
  });

  it("keeps the Android package identifier and target API aligned with Play requirements", () => {
    const capacitorConfig = readFileSync(resolve(repoRoot, "capacitor.config.ts"), "utf8");
    const androidBuild = readFileSync(resolve(repoRoot, "android", "app", "build.gradle"), "utf8");
    const androidVariables = readFileSync(resolve(repoRoot, "android", "variables.gradle"), "utf8");

    expect(capacitorConfig).toContain("appId: 'com.steelbuildpro.app'");
    expect(androidBuild).toContain('applicationId "com.steelbuildpro.app"');
    expect(androidBuild).toContain('versionName "2.1.1"');
    expect(androidVariables).toMatch(/targetSdkVersion\s*=\s*36/);
    expect(androidVariables).toMatch(/compileSdkVersion\s*=\s*36/);
  });
});
