const REQUIRED_BUCKETS = ["app-files", "email-attachments"];
const REQUIRED_ENV_KEYS = [
  "OFFSITE_RCLONE_CONFIG_B64",
  "OFFSITE_ROOT",
  "SUPABASE_S3_ACCESS_KEY_ID",
  "SUPABASE_S3_ENDPOINT",
  "SUPABASE_S3_REGION",
  "SUPABASE_S3_SECRET_ACCESS_KEY",
];

export function formatStorageBackupTimestamp(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error("Storage backup timestamp requires a valid Date");
  }
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function createRcloneSourceEnvironment(environment) {
  return {
    RCLONE_CONFIG_SUPABASE_TYPE: "s3",
    RCLONE_CONFIG_SUPABASE_PROVIDER: "Other",
    RCLONE_CONFIG_SUPABASE_ACCESS_KEY_ID: environment.SUPABASE_S3_ACCESS_KEY_ID,
    RCLONE_CONFIG_SUPABASE_SECRET_ACCESS_KEY: environment.SUPABASE_S3_SECRET_ACCESS_KEY,
    RCLONE_CONFIG_SUPABASE_ENDPOINT: environment.SUPABASE_S3_ENDPOINT,
    RCLONE_CONFIG_SUPABASE_REGION: environment.SUPABASE_S3_REGION,
    RCLONE_CONFIG_SUPABASE_NO_CHECK_BUCKET: "true",
  };
}

function normalizeRemoteRoot(value) {
  return value.trim().replace(/\/+$/, "");
}

export function createStorageBackupPlan({ destinationRoot, timestamp }) {
  const normalizedRoot = normalizeRemoteRoot(destinationRoot ?? "");
  if (!normalizedRoot || !normalizedRoot.includes(":")) {
    throw new Error("Storage backup destination must be an rclone remote path");
  }
  if (!normalizedRoot.toLowerCase().startsWith("offsite:")) {
    throw new Error("Storage backup destination must use the configured offsite remote (offsite:)");
  }
  if (!normalizedRoot.slice("offsite:".length).replace(/^\/+/, "")) {
    throw new Error("Storage backup destination must include an offsite container or bucket path");
  }
  if (!/^\d{8}T\d{6}Z$/.test(timestamp ?? "")) {
    throw new Error("Storage backup timestamp must use YYYYMMDDTHHmmssZ");
  }

  return REQUIRED_BUCKETS.map((bucket) => ({
    bucket,
    source: `supabase:${bucket}`,
    snapshot: `${normalizedRoot}/snapshots/${timestamp}/${bucket}`,
    current: `${normalizedRoot}/current/${bucket}`,
  }));
}

export function decodeOffsiteRcloneConfig(encodedConfig) {
  const normalizedConfig = encodedConfig?.trim() ?? "";
  if (
    !normalizedConfig
    || normalizedConfig.length % 4 !== 0
    || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalizedConfig)
  ) {
    throw new Error("OFFSITE_RCLONE_CONFIG_B64 must be valid base64");
  }

  let decoded;
  try {
    decoded = Buffer.from(normalizedConfig, "base64").toString("utf8");
  } catch {
    throw new Error("OFFSITE_RCLONE_CONFIG_B64 must be valid base64");
  }
  if (!/^\s*\[offsite\]\s*$/m.test(decoded)) {
    throw new Error("Decoded rclone configuration must define an [offsite] remote");
  }
  return decoded;
}

export function validateStorageBackupEnvironment(environment) {
  const missing = REQUIRED_ENV_KEYS.filter((key) => !environment[key]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required Storage backup configuration: ${missing.join(", ")}`);
  }

  const endpoint = new URL(environment.SUPABASE_S3_ENDPOINT);
  if (endpoint.protocol !== "https:") {
    throw new Error("SUPABASE_S3_ENDPOINT must use HTTPS");
  }
  decodeOffsiteRcloneConfig(environment.OFFSITE_RCLONE_CONFIG_B64);
  createStorageBackupPlan({
    destinationRoot: environment.OFFSITE_ROOT,
    timestamp: "20000101T000000Z",
  });

  return {
    destinationRoot: normalizeRemoteRoot(environment.OFFSITE_ROOT),
    sourceEndpoint: endpoint.toString().replace(/\/$/, ""),
    sourceRegion: environment.SUPABASE_S3_REGION.trim(),
  };
}

function assertStatsMatch(bucket, label, source, destination) {
  if (source.count !== destination.count || source.bytes !== destination.bytes) {
    throw new Error(
      `${bucket} ${label} verification failed: source=${source.count} objects/${source.bytes} bytes, destination=${destination.count} objects/${destination.bytes} bytes`,
    );
  }
}

export function assertBackupVerified({ bucket, source, snapshot, current }) {
  assertStatsMatch(bucket, "snapshot", source, snapshot);
  assertStatsMatch(bucket, "current", source, current);
}

const TRANSFER_FLAGS = [
  "--metadata",
  "--fast-list",
  "--transfers",
  "8",
  "--checkers",
  "16",
  "--stats",
  "30s",
  "--stats-one-line",
];

export function createRcloneBackupOperations(item) {
  return [
    {
      label: `${item.bucket} snapshot copy`,
      args: ["copy", item.source, item.snapshot, "--immutable", ...TRANSFER_FLAGS],
    },
    {
      label: `${item.bucket} current sync`,
      args: ["sync", item.source, item.current, ...TRANSFER_FLAGS],
    },
    {
      label: `${item.bucket} snapshot check`,
      args: ["check", item.source, item.snapshot, "--size-only"],
    },
    {
      label: `${item.bucket} current check`,
      args: ["check", item.source, item.current, "--size-only"],
    },
  ];
}

function parseRcloneSize(output, remote) {
  let stats;
  try {
    stats = JSON.parse(output);
  } catch {
    throw new Error(`rclone size returned invalid JSON for ${remote}`);
  }

  if (
    !Number.isSafeInteger(stats.count)
    || stats.count < 0
    || !Number.isSafeInteger(stats.bytes)
    || stats.bytes < 0
  ) {
    throw new Error(`rclone size returned invalid object statistics for ${remote}`);
  }

  return { count: stats.count, bytes: stats.bytes };
}

function assertRequiredPlanCoverage(plan) {
  const buckets = plan.map(({ bucket }) => bucket);
  if (
    buckets.length !== REQUIRED_BUCKETS.length
    || REQUIRED_BUCKETS.some((bucket) => !buckets.includes(bucket))
  ) {
    throw new Error(`Storage backup plan must cover: ${REQUIRED_BUCKETS.join(", ")}`);
  }
}

async function readRemoteStats(remote, execute) {
  const output = await execute(
    ["size", remote, "--json"],
    { captureOutput: true, label: `${remote} size` },
  );
  return parseRcloneSize(output, remote);
}

export async function executeStorageBackupPlan({
  plan,
  timestamp,
  completedAt,
  execute,
}) {
  assertRequiredPlanCoverage(plan);
  const buckets = [];

  for (const item of plan) {
    for (const operation of createRcloneBackupOperations(item)) {
      await execute(operation.args, { captureOutput: false, label: operation.label });
    }

    const source = await readRemoteStats(item.source, execute);
    const snapshot = await readRemoteStats(item.snapshot, execute);
    const current = await readRemoteStats(item.current, execute);
    assertBackupVerified({ bucket: item.bucket, source, snapshot, current });

    buckets.push({
      bucket: item.bucket,
      objects: source.count,
      bytes: source.bytes,
      snapshot: item.snapshot,
      current: item.current,
    });
  }

  return {
    schemaVersion: 1,
    status: "verified",
    backupTimestamp: timestamp,
    completedAt: completedAt ?? new Date().toISOString(),
    buckets,
  };
}
