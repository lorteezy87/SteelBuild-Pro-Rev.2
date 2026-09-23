import { readdirSync, readFileSync } from "node:fs";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

// SEC-N2 / CI-2. A push runs the workflow file as the pushed branch wrote it,
// so a job's `if:` cannot keep a repository-level secret away from branch code.
// Only an environment with a main-only deployment-branch policy can. These
// tests pin the YAML half of that fix; moving the secrets into the environments
// is the owner half (docs/runbooks/owner-checklist.md §7).

type Step = {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  env?: Record<string, unknown>;
  "working-directory"?: string;
};
type Job = {
  if?: string;
  needs?: string | string[];
  environment?: string | { name: string; url?: string };
  env?: Record<string, unknown>;
  steps: Step[];
};
type Workflow = { jobs: Record<string, Job> };

const workflowsDir = new URL("../../.github/workflows/", import.meta.url);
const workflowFiles = readdirSync(workflowsDir).filter((name) => /\.ya?ml$/.test(name));
const read = (name: string) =>
  load(readFileSync(new URL(name, workflowsDir), "utf8")) as Workflow;
const ci = read("ci.yml");

const environmentOf = (job: Job) =>
  typeof job.environment === "string" ? job.environment : job.environment?.name;

// Browser-public by design (they ship in the bundle), or the ambient token.
const PUBLIC_SECRETS = new Set(["GITHUB_TOKEN", "VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"]);
const secretsOf = (job: Job) =>
  [...JSON.stringify(job).matchAll(/secrets\.([A-Za-z0-9_]+)/g)]
    .map((match) => match[1])
    .filter((name) => !PUBLIC_SECRETS.has(name));

// The one job allowed to read a credential outside an environment, because it
// must run on every branch. It executes main's code only — asserted below.
const BRANCH_EXCEPTIONS = new Set(["ci.yml:supabase-drift-branch"]);

describe("CI secret scope (SEC-N2 / CI-2)", () => {
  it.each(workflowFiles)("%s: every credential-holding job names an environment", (file) => {
    const unscoped = Object.entries(read(file).jobs)
      .filter(([id, job]) => secretsOf(job).length > 0 && !BRANCH_EXCEPTIONS.has(`${file}:${id}`))
      .filter(([, job]) => !environmentOf(job))
      .map(([id, job]) => `${id}: ${secretsOf(job).join(", ")}`);
    expect(unscoped).toEqual([]);
  });

  it.each([
    ["ci.yml", "deploy-cloudflare"],
    ["ci.yml", "e2e-smoke"],
    ["ci.yml", "supabase-drift"],
    ["supabase-drift-scheduled.yml", "drift"],
    ["supabase-retire-deprecated.yml", "retire"],
  ])("%s %s runs in the main-only production environment", (file, id) => {
    expect(environmentOf(read(file).jobs[id])).toBe("production");
  });

  it("keeps previews and staging off the production environment", () => {
    // Previews run the PR's own code, so their token must be a different one.
    expect(environmentOf(ci.jobs["preview-cloudflare"])).toBe("preview");
    for (const id of ["deploy-staging-cloudflare", "staging-e2e-readonly", "staging-e2e-mutations"]) {
      expect(environmentOf(ci.jobs[id])).toBe("staging");
    }
  });

  it("runs the production drift job on main only, and the branch variant everywhere else", () => {
    expect(ci.jobs["supabase-drift"].if).toContain("github.ref == 'refs/heads/main'");
    expect(ci.jobs["supabase-drift-branch"].if).toContain("github.ref != 'refs/heads/main'");
    // The reviewed backend release looks this exact name up on main's push run.
    expect((ci.jobs["supabase-drift"] as Job & { name: string }).name).toBe("Supabase drift check");
  });

  it("never lets the branch drift job execute the branch's code", () => {
    const job = ci.jobs["supabase-drift-branch"];
    const checkouts = job.steps.filter((step) => step.uses?.startsWith("actions/checkout@"));
    expect(checkouts.map((step) => step.with)).toEqual([
      { path: "candidate", "persist-credentials": false },
      { ref: "main", path: "trusted", "persist-credentials": false },
    ]);

    const runs = job.steps.filter((step) => step.run);
    // No install: an npm lifecycle script could plant NODE_OPTIONS for the
    // step that holds the token.
    expect(runs.filter((step) => /\bnpm\b|\bnpx\b/.test(step.run ?? ""))).toEqual([]);
    // Every node process — and the token — lives in main's checkout.
    for (const step of runs.filter((s) => /\bnode\b/.test(s.run ?? ""))) {
      expect(step["working-directory"]).toBe("trusted");
    }
    const tokenSteps = job.steps.filter((step) => JSON.stringify(step).includes("SUPABASE_ACCESS_TOKEN"));
    expect(tokenSteps).toHaveLength(1);
    expect(tokenSteps[0]["working-directory"]).toBe("trusted");
    expect(tokenSteps[0].run).not.toMatch(/candidate/);
  });

  it("stages only data from the branch and refuses symlinks", () => {
    const stage = ci.jobs["supabase-drift-branch"].steps.find((step) => step.name?.startsWith("Stage"));
    expect(stage?.run).toContain("-type l");
    expect(stage?.run).toContain(
      "supabase/migrations supabase/migrations_quarantine supabase/functions supabase/production-ownership-manifest.json",
    );
    expect(JSON.stringify(stage)).not.toContain("secrets.");
  });

  it("installs nothing in a job that holds the Supabase management token", () => {
    const holders = [
      ...Object.entries(ci.jobs).map(([id, job]) => [`ci.yml:${id}`, job] as const),
      ["supabase-drift-scheduled.yml:drift", read("supabase-drift-scheduled.yml").jobs.drift] as const,
    ].filter(([, job]) => secretsOf(job).includes("SUPABASE_ACCESS_TOKEN"));
    expect(holders.map(([id]) => id).sort()).toEqual([
      "ci.yml:supabase-drift",
      "ci.yml:supabase-drift-branch",
      "supabase-drift-scheduled.yml:drift",
    ]);
    for (const [, job] of holders) {
      expect(job.steps.filter((step) => /\bnpm\b|\bnpx\b/.test(step.run ?? ""))).toEqual([]);
    }
  });

  it("gates previews on the drift job that actually runs for a PR", () => {
    // `supabase-drift` is skipped off main; needing it would skip every preview.
    expect(ci.jobs["preview-cloudflare"].needs).toEqual(
      expect.arrayContaining(["ci", "secret-scan", "supabase-drift-branch", "edge-typecheck"]),
    );
    expect(ci.jobs["preview-cloudflare"].needs).not.toContain("supabase-drift");
  });
});
