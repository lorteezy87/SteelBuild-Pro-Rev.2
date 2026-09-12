import { readFile } from "node:fs/promises";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

const workflowUrl = new URL(
  "../../.github/workflows/supabase-evidence.yml",
  import.meta.url,
);

async function readWorkflow() {
  return load(await readFile(workflowUrl, "utf8"));
}

describe("Supabase evidence workflow", () => {
  it("is branch-scoped, least-privilege, and production-target guarded", async () => {
    const workflow = await readWorkflow();
    const triggers = workflow.on ?? workflow.true;
    const captureJob = workflow.jobs.capture;
    const setupStep = captureJob.steps.find(
      ({ name }) => name === "Install pinned Supabase CLI",
    );
    const captureStep = captureJob.steps.find(
      ({ name }) => name === "Capture migration, schema, and function evidence",
    );

    expect(triggers.push.branches).toEqual(["copilot/security-audit-phase-1"]);
    expect(triggers).toHaveProperty("workflow_dispatch");
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(captureJob.if).toBe(
      "github.repository == 'lorteezy87/SteelBuild-Pro-Rev.2'",
    );
    expect(captureJob.env).toBeUndefined();
    expect(setupStep.uses).toBe(
      "supabase/setup-cli@46f7f98c7f948ad727d22c1e67fab04c223a0520",
    );
    expect(setupStep.with.version).toBe("2.117.0");
    expect(captureStep.env.CONFIRMATION).toContain(
      "github.event_name == 'push'",
    );
    expect(captureStep.env.EXPECTED_PROJECT_REF).toBe("kjrwqagyeswwoxpjkcko");
    expect(captureStep.run).toContain(
      '[ "$CONFIRMATION" = "CAPTURE_READ_ONLY_EVIDENCE" ]',
    );
    expect(captureStep.run).toContain(
      '[ "$SUPABASE_PROJECT_REF" = "$EXPECTED_PROJECT_REF" ]',
    );
  });

  it("scopes credentials to capture and permits only read-only Supabase commands", async () => {
    const workflow = await readWorkflow();
    const captureJob = workflow.jobs.capture;
    const captureStep = captureJob.steps.find(
      ({ name }) => name === "Capture migration, schema, and function evidence",
    );
    const otherSteps = captureJob.steps.filter((step) => step !== captureStep);

    expect(captureStep.env.SUPABASE_ACCESS_TOKEN).toBe(
      "${{ secrets.SUPABASE_ACCESS_TOKEN }}",
    );
    expect(captureStep.env.SUPABASE_DB_PASSWORD).toBe(
      "${{ secrets.SUPABASE_DB_PASSWORD }}",
    );
    expect(captureStep.env.SUPABASE_PROJECT_REF).toBe(
      "${{ vars.SUPABASE_PROJECT_REF }}",
    );
    for (const step of otherSteps) {
      expect(step.env).toBeUndefined();
    }

    expect(captureStep.run).toContain("supabase migration list");
    expect(captureStep.run).toContain("supabase db dump");
    expect(captureStep.run).toContain("supabase functions download");
    expect(captureStep.run).toContain("download-failures.txt");
    expect(captureStep.run).toContain("if ! supabase functions download");
    expect(captureStep.run).not.toContain("npx ");
    expect(captureStep.run).not.toMatch(
      /supabase (?:migration repair|db (?:push|reset)|functions (?:deploy|delete))/,
    );
    expect(
      captureJob.steps.some(({ uses }) =>
        uses?.startsWith("actions/checkout@"),
      ),
    ).toBe(false);
  });

  it("retains evidence for one day and always removes runner copies", async () => {
    const workflow = await readWorkflow();
    const captureJob = workflow.jobs.capture;
    const uploadStep = captureJob.steps.find(({ uses }) =>
      uses?.startsWith("actions/upload-artifact@"),
    );
    const cleanupStep = captureJob.steps.find(
      ({ name }) => name === "Remove temporary evidence",
    );
    const verifyStep = captureJob.steps.find(
      ({ name }) => name === "Verify evidence completeness",
    );

    expect(uploadStep.with.path).toBe(
      "${{ runner.temp }}/supabase-production-evidence",
    );
    expect(uploadStep.with["retention-days"]).toBe(1);
    expect(uploadStep.with["if-no-files-found"]).toBe("error");
    expect(uploadStep.if).toBe("${{ !cancelled() }}");
    expect(verifyStep.run).toContain("download-failures.txt");
    expect(verifyStep.run).toContain("exit 1");
    expect(cleanupStep.if).toBe("always()");
    expect(cleanupStep.run).toContain(
      '"$RUNNER_TEMP/supabase-production-evidence"',
    );
  });
});
