import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assertDisposableMutationEnvironment,
  resolveE2EEnvironment,
} from "../../e2e/environment";

const staging = {
  E2E_TARGET: "staging",
  E2E_BASE_URL: "https://steelbuild-pro-staging.vercel.app",
  E2E_SUPABASE_URL: "https://abbeavtbifuddtrifvae.supabase.co",
  E2E_SUPABASE_ANON_KEY: "browser-public-key",
  E2E_USER: "synthetic@example.invalid",
  E2E_PASS: "test-password-not-a-secret",
  E2E_EXPECTED_SUPABASE_REF: "abbeavtbifuddtrifvae",
};

describe("staging E2E environment guardrails", () => {
  it("accepts a matched staging app and Supabase target", () => {
    const resolved = resolveE2EEnvironment(staging);
    expect(resolved.target).toBe("staging");
    expect(resolved.supabaseRef).toBe("abbeavtbifuddtrifvae");
  });

  it("rejects a production app host in staging mode", () => {
    expect(() =>
      resolveE2EEnvironment({ ...staging, E2E_BASE_URL: "https://steelbuild-pro.com" }),
    ).toThrow(/refuses to run against the production app host/);
  });

  it("rejects staging credentials for an unexpected Supabase project", () => {
    expect(() =>
      resolveE2EEnvironment({
        ...staging,
        E2E_SUPABASE_URL: "https://kjrwqagyeswwoxpjkcko.supabase.co",
      }),
    ).toThrow(/does not match E2E_EXPECTED_SUPABASE_REF/);
  });

  it("allows mutations only for an explicit disposable staging fixture", () => {
    expect(() => assertDisposableMutationEnvironment(staging)).toThrow(
      /E2E_MUTATIONS_ENABLED=true/,
    );
    expect(() =>
      assertDisposableMutationEnvironment({
        ...staging,
        E2E_MUTATIONS_ENABLED: "true",
        E2E_MUTATION_FIXTURE_KIND: "disposable",
      }),
    ).not.toThrow();
  });

  it("wires only read-only specs into the STAGING_E2E_ENABLED job", () => {
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(workflow).toContain("vars.STAGING_E2E_ENABLED == 'true'");
    expect(workflow).toContain("secrets.STAGING_E2E_USER");
    expect(workflow).toContain("secrets.STAGING_E2E_PASS");
    expect(workflow).toContain("secrets.STAGING_E2E_SUPABASE_URL");
    expect(workflow).toContain("secrets.STAGING_E2E_SUPABASE_ANON_KEY");
    expect(workflow).toContain("npm run test:e2e:staging:readonly");
  });
});
