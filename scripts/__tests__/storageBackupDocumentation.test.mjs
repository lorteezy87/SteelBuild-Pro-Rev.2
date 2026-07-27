import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const repoRoot = new URL("../../", import.meta.url);

async function readRunbook(name) {
  return readFile(new URL(`docs/runbooks/${name}`, repoRoot), "utf8");
}

describe("Storage backup recovery evidence", () => {
  it("keeps activation and restore evidence explicitly open", async () => {
    const [assurance, backupDr, ownerChecklist, setup] = await Promise.all([
      readRunbook("assurance-pack.md"),
      readRunbook("backup-dr.md"),
      readRunbook("owner-checklist.md"),
      readRunbook("storage-backup-setup.md"),
    ]);

    expect(assurance).toContain("not yet an operating control");
    expect(backupDr).toContain("code alone is not a backup");
    expect(ownerChecklist).toContain("[~] **Enable and rehearse offsite Storage backup**");
    expect(setup).toContain("Never overwrite production to test recovery");
  });
});
