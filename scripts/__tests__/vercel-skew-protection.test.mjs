import { describe, expect, it } from "vitest";
import { vercelSkewAssetUrl } from "../vercel-skew-protection.mjs";

describe("vercelSkewAssetUrl", () => {
  it("pins emitted assets to the deployment when Vercel Skew Protection is enabled", () => {
    expect(vercelSkewAssetUrl("assets/ScheduleHub-abc.js", {
      VERCEL_SKEW_PROTECTION_ENABLED: "1",
      VERCEL_DEPLOYMENT_ID: "dpl_abc123",
    })).toBe("/assets/ScheduleHub-abc.js?dpl=dpl_abc123");
  });

  it("leaves local and unprotected builds unchanged", () => {
    expect(vercelSkewAssetUrl("assets/app.js", {})).toBeNull();
    expect(vercelSkewAssetUrl("assets/app.js", {
      VERCEL_SKEW_PROTECTION_ENABLED: "0",
      VERCEL_DEPLOYMENT_ID: "dpl_abc123",
    })).toBeNull();
  });
});
