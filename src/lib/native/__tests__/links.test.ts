import { describe, expect, it } from "vitest";
import { passwordResetRedirectUrl, trustedSteelBuildPath } from "@/lib/native/links";

describe("native authentication links", () => {
  it("uses the public HTTPS reset route from a native shell", () => {
    expect(passwordResetRedirectUrl("capacitor://localhost", true)).toBe(
      "https://steelbuild-pro.com/update-password",
    );
  });

  it("keeps the current web origin for browser password recovery", () => {
    expect(passwordResetRedirectUrl("https://staging.steelbuild-pro.com", false)).toBe(
      "https://staging.steelbuild-pro.com/update-password",
    );
  });

  it("routes only HTTPS links from SteelBuild production hosts into the app", () => {
    expect(trustedSteelBuildPath("https://steelbuild-pro.com/Projects?view=active#today")).toBe(
      "/Projects?view=active#today",
    );
    expect(trustedSteelBuildPath("https://www.steelbuild-pro.com/update-password#token")).toBe(
      "/update-password#token",
    );
    expect(trustedSteelBuildPath("https://attacker.example/Projects")).toBeNull();
    expect(trustedSteelBuildPath("http://steelbuild-pro.com/Projects")).toBeNull();
    expect(trustedSteelBuildPath("steelbuild://Projects")).toBeNull();
  });
});
