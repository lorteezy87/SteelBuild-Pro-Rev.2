import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  createRcloneChildEnvironment,
  rcloneRetryFlags,
  createStorageBackupPlan,
  decodeOffsiteRcloneConfig,
  formatStorageBackupTimestamp,
  validateStorageBackupEnvironment,
} from "./lib/storageBackup.mjs";

import { parseB2Config, readB2Inventory, runIncrementalBackup, BUDGET_BYTES } from "./lib/b2Backup.mjs";

function createRcloneExecutor({ configPath, environment }) {
  return (args, { captureOutput, label }) => new Promise((resolveCommand, rejectCommand) => {
    const child = spawn("rclone", [...args, "--config", configPath, ...rcloneRetryFlags(args)], {
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
  const b2 = parseB2Config(decodeOffsiteRcloneConfig(process.env.OFFSITE_RCLONE_CONFIG_B64));
  const bucketName = config.destinationRoot.slice("offsite:".length).split("/")[0];
  const inventory = () => readB2Inventory({ ...b2, bucketName });
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

  const childEnvironment = createRcloneChildEnvironment(process.env);

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
    for (const item of plan) await mkdir(join(tempDirectory, "stage", item.bucket), { recursive: true });
    const awsEnvironment = {
      PATH: process.env.PATH,
      AWS_ACCESS_KEY_ID: process.env.SUPABASE_S3_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: process.env.SUPABASE_S3_SECRET_ACCESS_KEY,
      AWS_DEFAULT_REGION: process.env.SUPABASE_S3_REGION,
      AWS_EC2_METADATA_DISABLED: "true",
      AWS_MAX_ATTEMPTS: "3",
    };
    await promisify(execFile)("aws", ["--version"], { env: awsEnvironment });
    const stageSource = async ({ item, local, mapping, run, flags }) => {
      const normal = mapping.filter(f => !f.special);
      const listPath = join(tempDirectory, `${item.bucket}-files.txt`);
      await writeFile(listPath, normal.map(f => f.sourcePath).join("\n") + "\n");
      if (normal.length) await run(["copy", item.source, local, "--files-from-raw", listPath, "--no-traverse", "--metadata", "--max-transfer", String(BUDGET_BYTES), "--cutoff-mode", "hard", ...flags]);
      for (const object of mapping.filter(f => f.special)) {
        const target = join(local, object.path);
        await mkdir(dirname(target), { recursive: true });
        await promisify(execFile)("aws", ["s3api", "get-object", "--endpoint-url", process.env.SUPABASE_S3_ENDPOINT, "--bucket", item.bucket, "--key", object.sourcePath, "--no-cli-pager", target], { env: awsEnvironment, timeout: 120000 });
      }
    };
    const manifest = await runIncrementalBackup({ plan, stageRoot: join(tempDirectory, "stage"), execute, inventory, stageSource });
    // Exercise recovery after BOTH overwrite and deletion, using synthetic bytes only.
    const probePath = join(tempDirectory, "recovery-probe.txt");
    const restoredProbe = join(tempDirectory, "recovered-probe.txt");
    const probeRemote = `${config.destinationRoot}/restore-probes/${randomUUID()}.txt`;
    const probeOptions = { captureOutput: false, label: "historical restore probe" };
    const original = `SteelBuild backup recovery ${timestamp} version one`;
    await writeFile(probePath, original);
    await execute(["copyto", probePath, probeRemote, "--b2-hard-delete=false", "--retries", "1"], probeOptions);
    const probeRestoreAt = new Date().toISOString();
    await pause(1100);
    await writeFile(probePath, `${original} changed`);
    await execute(["copyto", probePath, probeRemote, "--ignore-times", "--b2-hard-delete=false", "--retries", "1"], probeOptions);
    await execute(["deletefile", probeRemote, "--b2-hard-delete=false"], probeOptions);
    await execute(["copyto", probeRemote, restoredProbe, "--b2-version-at", probeRestoreAt], probeOptions);
    if (await readFile(restoredProbe, "utf8") !== original) throw new Error("Historical restore probe failed");
    manifest.historicalRestoreProbe = { status: "verified", restoreAt: probeRestoreAt, remote: probeRemote };
    manifest.backupTimestamp = timestamp;
    manifest.completedAt = new Date().toISOString();
    manifest.source = config.source;
    const finalInventory = await inventory();
    manifest.retainedBytesBeforeManifest = finalInventory.storedBytes;
    const manifestBytes = Buffer.byteLength(JSON.stringify(manifest, null, 2)) + 1;
    if (finalInventory.storedBytes + manifestBytes > BUDGET_BYTES) throw new Error("Final inventory exceeds 9 GB budget");

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
  if (process.env.GITHUB_ACTIONS === "true") console.error("::error::Storage backup failed; no new verified recovery point was published. Check the backup log.");
  process.exitCode = 1;
});
