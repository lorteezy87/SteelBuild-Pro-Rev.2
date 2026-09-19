import { isAbsolute } from "node:path";

export function rcloneRetryFlags(args) {
  const sourceRead = args[1]?.startsWith("supabase:") && (
    ["size", "lsjson"].includes(args[0]) ||
    (args[0] === "copy" && isAbsolute(args[2] ?? ""))
  );
  // Read retries cannot create extra retained versions. Destination writes remain single-attempt.
  return ["--retries", "1", "--low-level-retries", sourceRead ? "3" : "1"];
}

const REQUIRED_BUCKETS = ["app-files", "email-attachments"];
const REQUIRED_ENV_KEYS = [
  "OFFSITE_RCLONE_CONFIG_B64",
  "OFFSITE_ROOT",
  "SUPABASE_EXPECTED_PROJECT_REF",
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

function isReservedRcloneFlagEnv(key) {
  return /^rclone_/i.test(key) && !/^rclone_config(?:_|$)/i.test(key);
}

export function createRcloneChildEnvironment(environment) {
  const childEnvironment = { ...environment };
  for (const key of Object.keys(childEnvironment)) {
    if (REQUIRED_ENV_KEYS.includes(key.toUpperCase()) || isReservedRcloneFlagEnv(key) || /^rclone_config_/i.test(key)) {
      delete childEnvironment[key];
    }
  }
  return Object.assign(childEnvironment, createRcloneSourceEnvironment(environment));
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
    current: `${normalizedRoot}/current/${bucket}`,
  }));
}

export function decodeOffsiteRcloneConfig(encodedConfig) {
  const normalizedConfig = encodedConfig?.replace(/\s/g, "") ?? "";
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

  let endpoint;
  try {
    endpoint = new URL(environment.SUPABASE_S3_ENDPOINT);
  } catch {
    throw new Error("SUPABASE_S3_ENDPOINT must be a valid HTTPS URL");
  }
  if (endpoint.protocol !== "https:") {
    throw new Error("SUPABASE_S3_ENDPOINT must use HTTPS");
  }
  const expectedProjectRef = environment.SUPABASE_EXPECTED_PROJECT_REF.trim().toLowerCase();
  if (!/^[a-z0-9]{20}$/.test(expectedProjectRef)) {
    throw new Error("SUPABASE_EXPECTED_PROJECT_REF must be a valid Supabase project ref");
  }
  const expectedHostname = `${expectedProjectRef}.storage.supabase.co`;
  if (endpoint.hostname.toLowerCase() !== expectedHostname) {
    throw new Error("SUPABASE_S3_ENDPOINT hostname does not match SUPABASE_EXPECTED_PROJECT_REF");
  }
  decodeOffsiteRcloneConfig(environment.OFFSITE_RCLONE_CONFIG_B64);
  createStorageBackupPlan({
    destinationRoot: environment.OFFSITE_ROOT,
    timestamp: "20000101T000000Z",
  });

  return {
    destinationRoot: normalizeRemoteRoot(environment.OFFSITE_ROOT),
    source: {
      provider: "supabase-storage",
      projectRef: expectedProjectRef,
    },
  };
}
