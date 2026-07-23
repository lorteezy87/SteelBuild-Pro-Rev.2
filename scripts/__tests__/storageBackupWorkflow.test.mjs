import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const workflowUrl = new URL("../../.github/workflows/storage-backup.yml", import.meta.url);

describe("Storage backup workflow", () => {
  it("is scheduled, manually runnable, and checksum-pins rclone", async () => {
    const workflow = await readFile(workflowUrl, "utf8");

    expect(workflow).toContain("schedule:");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain('RCLONE_VERSION: "1.74.4"');
    expect(workflow).toContain("fe435e0c36228e7c2f116a8701f01127bb1f694005fc11d1f27186c8bca4115d");
  });

  it("fails closed unless every source and offsite setting is provided as a secret", async () => {
    const workflow = await readFile(workflowUrl, "utf8");
    const requiredSecrets = [
      "OFFSITE_RCLONE_CONFIG_B64",
      "OFFSITE_ROOT",
      "SUPABASE_S3_ACCESS_KEY_ID",
      "SUPABASE_S3_ENDPOINT",
      "SUPABASE_S3_REGION",
      "SUPABASE_S3_SECRET_ACCESS_KEY",
    ];

    for (const secret of requiredSecrets) {
      expect(workflow).toContain(`secrets.${secret}`);
    }
    expect(workflow).toContain("node scripts/storage-backup.mjs");
  });
});
