import { readFile } from "node:fs/promises";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

const workflowUrl = new URL("../../.github/workflows/storage-backup.yml", import.meta.url);

describe("Storage backup workflow", () => {
  it("is scheduled, manually runnable, and checksum-pins rclone", async () => {
    const workflow = load(await readFile(workflowUrl, "utf8"));
    const triggers = workflow.on ?? workflow.true;

    expect(triggers.schedule).toEqual([{ cron: "17 8 * * *" }]);
    expect(triggers).toHaveProperty("workflow_dispatch");
    expect(workflow.jobs.backup.env.RCLONE_VERSION).toBe("1.74.4");
    expect(workflow.jobs.backup.env.RCLONE_SHA256)
      .toBe("fe435e0c36228e7c2f116a8701f01127bb1f694005fc11d1f27186c8bca4115d");
  });

  it("limits production credentials and project identity to the backup step", async () => {
    const workflow = load(await readFile(workflowUrl, "utf8"));
    const backupJob = workflow.jobs.backup;
    const requiredSecrets = [
      "OFFSITE_RCLONE_CONFIG_B64",
      "OFFSITE_ROOT",
      "SUPABASE_S3_ACCESS_KEY_ID",
      "SUPABASE_S3_ENDPOINT",
      "SUPABASE_S3_REGION",
      "SUPABASE_S3_SECRET_ACCESS_KEY",
    ];

    const backupStep = backupJob.steps.find(({ name }) => name === "Back up and verify required buckets");
    for (const secret of requiredSecrets) {
      expect(backupJob.env).not.toHaveProperty(secret);
      expect(Object.values(backupJob.env)).not.toContain(`\${{ secrets.${secret} }}`);
      expect(backupStep.env[secret]).toBe(`\${{ secrets.${secret} }}`);
    }
    expect(backupStep.env.SUPABASE_EXPECTED_PROJECT_REF)
      .toBe("${{ vars.SUPABASE_EXPECTED_PROJECT_REF }}");
    expect(backupStep.run).toBe("node scripts/storage-backup.mjs");
  });

  it("uses the production environment and prevents feature-branch backup jobs", async () => {
    const workflow = load(await readFile(workflowUrl, "utf8"));
    const backupJob = workflow.jobs.backup;

    expect(backupJob.environment).toBe("storage-backup-production");
    expect(backupJob.if).toBe("github.ref == 'refs/heads/main'");
    expect(backupJob.steps.find(({ uses }) => uses === "actions/upload-artifact@v4").with.path)
      .toBe("${{ runner.temp }}/storage-backup-manifest.json");
  });
});
