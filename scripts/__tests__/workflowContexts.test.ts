import { readdirSync, readFileSync } from "node:fs";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

// Workflow-level and job-level env cannot read the runner, job or steps
// contexts. GitHub then rejects the whole file, and instead of running the
// workflow it records a failed run on every push. The retirement workflow
// shipped this way once; keep those paths inside steps.
const workflowsDir = new URL("../../.github/workflows/", import.meta.url);
const workflows = readdirSync(workflowsDir).filter((name) => /\.ya?ml$/.test(name));
const stepOnlyContext = /\$\{\{[^}]*\b(runner|job|steps)\./;

type Workflow = {
  env?: Record<string, unknown>;
  jobs?: Record<string, { env?: Record<string, unknown> }>;
};

describe("GitHub workflow files", () => {
  it.each(workflows)("%s reads step-only contexts only inside steps", (name) => {
    const workflow = load(readFileSync(new URL(name, workflowsDir), "utf8")) as Workflow;
    const envMaps = [workflow.env, ...Object.values(workflow.jobs ?? {}).map((job) => job.env)];
    const offending = envMaps
      .flatMap((env) => Object.entries(env ?? {}))
      .filter(([, value]) => stepOnlyContext.test(String(value)))
      .map(([key]) => key);

    expect(offending).toEqual([]);
  });
});
