import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(__dirname, "..", "..");
const workflow = readFileSync(resolve(repoRoot, ".github", "workflows", "ci.yml"), "utf8");

function jobBlock(jobName: string): string {
  const marker = `  ${jobName}:`;
  const start = workflow.indexOf(marker);
  expect(start, `${jobName} job is missing`).toBeGreaterThanOrEqual(0);

  const remaining = workflow.slice(start + marker.length);
  const nextJob = remaining.search(/\n {2}[A-Za-z0-9_-]+:\n/);
  return nextJob === -1 ? remaining : remaining.slice(0, nextJob);
}

describe("Cloudflare deployment credential boundaries", () => {
  it("requires a protected production environment before production secrets are exposed", () => {
    const production = jobBlock("deploy-cloudflare");

    expect(production).toMatch(/^ {4}environment: production$/m);
    expect(production).toContain("secrets.CLOUDFLARE_API_TOKEN");
    expect(production).toContain("secrets.CLOUDFLARE_ACCOUNT_ID");
  });

  it("keeps staging and preview credentials in their own GitHub Environments", () => {
    const staging = jobBlock("deploy-staging-cloudflare");
    const preview = jobBlock("preview-cloudflare");

    expect(staging).toMatch(/^ {4}environment: staging$/m);
    expect(preview).toMatch(/^ {4}environment: cloudflare-preview$/m);
    expect(staging).toContain("secrets.CLOUDFLARE_API_TOKEN");
    expect(preview).toContain("secrets.CLOUDFLARE_API_TOKEN");
  });
});
