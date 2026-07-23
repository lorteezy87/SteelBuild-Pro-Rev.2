import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  createRcloneSourceEnvironment,
  createStorageBackupPlan,
  decodeOffsiteRcloneConfig,
  executeStorageBackupPlan,
  formatStorageBackupTimestamp,
  validateStorageBackupEnvironment,
} from "./lib/storageBackup.mjs";

function createRcloneExecutor({ configPath, environment }) {
  return (args, { captureOutput, label }) => new Promise((resolveCommand, rejectCommand) => {
    const child = spawn("rclone", [...args, "--config", configPath], {
      env: environment,
      shell: false,
      stdio: captureOutput ? ["ignore", "pipe", "pipe"] : "inherit",
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";

    if (captureOutput) {
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
    }

    child.on("error", (error) => {
      rejectCommand(new Error(`Unable to start rclone for ${label}: ${error.message}`));
    });
    child.on("close", (code) => {
      if (code !== 0) {
        if (stderr) process.stderr.write(stderr);
        rejectCommand(new Error(`rclone failed for ${label} with exit code ${code}`));
        return;
      }
      resolveCommand(stdout);
    });
  });
}

async function main() {
  const config = validateStorageBackupEnvironment(process.env);
  const timestamp = formatStorageBackupTimestamp();
  const plan = createStorageBackupPlan({
    destinationRoot: config.destinationRoot,
    timestamp,
  });
  const tempDirectory = await mkdtemp(join(tmpdir(), "steelbuild-storage-backup-"));
  const rcloneConfigPath = join(tempDirectory, "rclone.conf");
  const manifestPath = resolve(
    process.env.STORAGE_BACKUP_MANIFEST_PATH
      ?? join(".tmp", "storage-backup", `${timestamp}.json`),
  );

  const childEnvironment = { ...process.env };
  delete childEnvironment.OFFSITE_RCLONE_CONFIG_B64;
  delete childEnvironment.SUPABASE_S3_ACCESS_KEY_ID;
  delete childEnvironment.SUPABASE_S3_SECRET_ACCESS_KEY;
  Object.assign(childEnvironment, createRcloneSourceEnvironment(process.env));

  try {
    await writeFile(
      rcloneConfigPath,
      decodeOffsiteRcloneConfig(process.env.OFFSITE_RCLONE_CONFIG_B64),
      { encoding: "utf8", mode: 0o600 },
    );
    const execute = createRcloneExecutor({
      configPath: rcloneConfigPath,
      environment: childEnvironment,
    });
    const manifest = await executeStorageBackupPlan({
      plan,
      timestamp,
      execute,
    });

    await mkdir(dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await execute(
      [
        "copyto",
        manifestPath,
        `${config.destinationRoot}/manifests/${timestamp}.json`,
        "--immutable",
      ],
      { captureOutput: false, label: "verified manifest upload" },
    );

    for (const bucket of manifest.buckets) {
      console.log(`Verified ${bucket.bucket}: ${bucket.objects} objects, ${bucket.bytes} bytes`);
    }
    console.log(`Storage backup manifest: ${manifestPath}`);
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`Storage backup failed: ${error.message}`);
  process.exitCode = 1;
});
