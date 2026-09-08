import { describe, expect, it } from "vitest";
import { isPreviewDeployHost } from "../deployHost";

describe("isPreviewDeployHost", () => {
  it("treats every *.workers.dev host as a preview", () => {
    // Cloudflare production is the custom domain; there is no workers.dev
    // production alias, so the Worker's own subdomain is a preview too.
    expect(isPreviewDeployHost("steelbuild-pro-rev-2.n-lortz1987.workers.dev")).toBe(true);
    // Per-version preview URL shape, as emitted by `wrangler versions upload`.
    expect(isPreviewDeployHost("475d682a-steelbuild-pro-rev-2.n-lortz1987.workers.dev")).toBe(
      true,
    );
  });

  it("treats a Netlify deploy preview or branch deploy as a preview", () => {
    // Netlify puts `--` between the deploy label and the site name.
    expect(isPreviewDeployHost("deploy-preview-309--steelbuild-pro.netlify.app")).toBe(true);
    expect(isPreviewDeployHost("claude-cloudflare-migration--steelbuild-pro.netlify.app")).toBe(
      true,
    );
  });

  it("does NOT treat the bare Netlify site URL as a preview", () => {
    // `site.netlify.app` is Netlify's production URL for the site. Registering
    // the service worker there is correct; suppressing it would break offline
    // boot for anyone reaching the app that way.
    expect(isPreviewDeployHost("steelbuild-pro.netlify.app")).toBe(false);
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
    // Lookalike domains an attacker could register must not be classified by
    // an accidental substring match.
    expect(isPreviewDeployHost("workers.dev.example.com")).toBe(false);
    expect(isPreviewDeployHost("netlify.app.example.com")).toBe(false);
    expect(isPreviewDeployHost("deploy-preview-1--site.netlify.app.example.com")).toBe(false);
  });

  it("no longer treats Vercel hosts as previews", () => {
    // The Vercel account is gone and its config is out of the repo, so no
    // *.vercel.app origin can serve this app. Documented so a future reader
    // knows the omission is deliberate, not an oversight.
    expect(isPreviewDeployHost("steelbuild-pro-abc123.vercel.app")).toBe(false);
    expect(isPreviewDeployHost("steelbuild-pro.vercel.app")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isPreviewDeployHost("Preview.WORKERS.DEV")).toBe(true);
    expect(isPreviewDeployHost("Deploy-Preview-9--Site.Netlify.App")).toBe(true);
    expect(isPreviewDeployHost("SteelBuild-Pro.Netlify.App")).toBe(false);
  });
});
