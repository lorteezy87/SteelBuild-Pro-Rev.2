import { describe, expect, it } from "vitest";
import { isPreviewDeployHost } from "../deployHost";

describe("isPreviewDeployHost", () => {
  it("treats every *.workers.dev host as a preview", () => {
    // Cloudflare production is the custom domain; there is no workers.dev
    // production alias, so the Worker's own subdomain is a preview too.
    expect(isPreviewDeployHost("steelbuild-pro-rev-2.nickl.workers.dev")).toBe(true);
    // Per-version preview URL shape.
    expect(isPreviewDeployHost("a1b2c3d4-steelbuild-pro-rev-2.nickl.workers.dev")).toBe(true);
  });

  it("treats *.vercel.app as a preview EXCEPT the production alias", () => {
    expect(isPreviewDeployHost("steelbuild-pro-abc123.vercel.app")).toBe(true);
    expect(isPreviewDeployHost("steelbuild-pro-git-staging.vercel.app")).toBe(true);
    // Vercel points this alias at the current production deployment — it is a
    // real production origin and must keep the manifest + service worker.
    expect(isPreviewDeployHost("steelbuild-pro.vercel.app")).toBe(false);
  });

  it("leaves production domains, localhost and native webviews alone", () => {
    expect(isPreviewDeployHost("steelbuild-pro.com")).toBe(false);
    expect(isPreviewDeployHost("www.steelbuild-pro.com")).toBe(false);
    expect(isPreviewDeployHost("localhost")).toBe(false);
    expect(isPreviewDeployHost("127.0.0.1")).toBe(false);
    expect(isPreviewDeployHost("")).toBe(false);
    expect(isPreviewDeployHost(null)).toBe(false);
    expect(isPreviewDeployHost(undefined)).toBe(false);
  });

  it("matches on the host suffix, not a substring", () => {
    // A lookalike domain an attacker could register must not be granted the
    // production alias's exemption, and must not be mistaken for a preview.
    expect(isPreviewDeployHost("workers.dev.example.com")).toBe(false);
    expect(isPreviewDeployHost("vercel.app.example.com")).toBe(false);
    // ...but "steelbuild-pro.vercel.app" as a SUBDOMAIN of something else is
    // still a preview-shaped vercel.app host, not the production alias.
    expect(isPreviewDeployHost("x.steelbuild-pro.vercel.app")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isPreviewDeployHost("Preview.WORKERS.DEV")).toBe(true);
    expect(isPreviewDeployHost("SteelBuild-Pro.Vercel.App")).toBe(false);
  });
});
