import { describe, expect, it } from "vitest";
import {
  assertBackupVerified,
  createRcloneBackupOperations,
  createRcloneChildEnvironment,
  createRcloneSourceEnvironment,
  createStorageBackupPlan,
  decodeOffsiteRcloneConfig,
  executeStorageBackupPlan,
  formatStorageBackupTimestamp,
  validateStorageBackupEnvironment,
} from "../lib/storageBackup.mjs";

describe("Storage backup planner", () => {
  it("covers both required buckets with current and timestamped destinations", () => {
    const plan = createStorageBackupPlan({
      destinationRoot: "offsite:steelbuild-pro-storage/",
      timestamp: "20260723T003000Z",
    });

    expect(plan).toEqual([
      {
        bucket: "app-files",
        source: "supabase:app-files",
        snapshot: "offsite:steelbuild-pro-storage/snapshots/20260723T003000Z/app-files",
        current: "offsite:steelbuild-pro-storage/current/app-files",
      },
      {
        bucket: "email-attachments",
        source: "supabase:email-attachments",
        snapshot: "offsite:steelbuild-pro-storage/snapshots/20260723T003000Z/email-attachments",
        current: "offsite:steelbuild-pro-storage/current/email-attachments",
      },
    ]);
  });

  it("rejects a destination that points back to the privileged source remote", () => {
    expect(() => createStorageBackupPlan({
      destinationRoot: "supabase:backup",
      timestamp: "20260723T003000Z",
    })).toThrow("offsite remote");
  });

  it("requires the destination to use the configured offsite remote", () => {
    expect(() => createStorageBackupPlan({
      destinationRoot: "backup:steelbuild-pro-storage",
      timestamp: "20260723T003000Z",
    })).toThrow("offsite remote");

    expect(() => createStorageBackupPlan({
      destinationRoot: "offsite:",
      timestamp: "20260723T003000Z",
    })).toThrow("container or bucket path");
  });
});

describe("Storage backup configuration", () => {
  it("fails closed and names every missing secret", () => {
    expect(() => validateStorageBackupEnvironment({})).toThrow(
      "Missing required Storage backup configuration: OFFSITE_RCLONE_CONFIG_B64, OFFSITE_ROOT, SUPABASE_EXPECTED_PROJECT_REF, SUPABASE_S3_ACCESS_KEY_ID, SUPABASE_S3_ENDPOINT, SUPABASE_S3_REGION, SUPABASE_S3_SECRET_ACCESS_KEY",
    );
  });

  it("accepts a complete server-side configuration without returning secrets", () => {
    const offsiteConfig = Buffer.from("[offsite]\ntype = azureblob\nsas_url = secret\n").toString("base64");
    const config = validateStorageBackupEnvironment({
      OFFSITE_RCLONE_CONFIG_B64: offsiteConfig,
      OFFSITE_ROOT: "offsite:steelbuild-pro-storage",
      SUPABASE_EXPECTED_PROJECT_REF: "exampleprojectref123",
      SUPABASE_S3_ACCESS_KEY_ID: "source-key",
      SUPABASE_S3_ENDPOINT: "https://exampleprojectref123.storage.supabase.co/storage/v1/s3",
      SUPABASE_S3_REGION: "us-east-1",
      SUPABASE_S3_SECRET_ACCESS_KEY: "source-secret",
    });

    expect(config).toEqual({
      destinationRoot: "offsite:steelbuild-pro-storage",
      source: {
        provider: "supabase-storage",
        projectRef: "exampleprojectref123",
      },
    });
    expect(JSON.stringify(config)).not.toContain("source-secret");
    expect(JSON.stringify(config)).not.toContain("sas_url");
  });

  it("rejects a missing expected Supabase project ref", () => {
    const offsiteConfig = Buffer.from("[offsite]\ntype = azureblob\n").toString("base64");

    expect(() => validateStorageBackupEnvironment({
      OFFSITE_RCLONE_CONFIG_B64: offsiteConfig,
      OFFSITE_ROOT: "offsite:steelbuild-pro-storage",
      SUPABASE_S3_ACCESS_KEY_ID: "source-key",
      SUPABASE_S3_ENDPOINT: "https://exampleprojectref123.storage.supabase.co/storage/v1/s3",
      SUPABASE_S3_REGION: "us-east-1",
      SUPABASE_S3_SECRET_ACCESS_KEY: "source-secret",
    })).toThrow("SUPABASE_EXPECTED_PROJECT_REF");
  });

  it("rejects a malformed expected Supabase project ref", () => {
    const offsiteConfig = Buffer.from("[offsite]\ntype = azureblob\n").toString("base64");

    expect(() => validateStorageBackupEnvironment({
      OFFSITE_RCLONE_CONFIG_B64: offsiteConfig,
      OFFSITE_ROOT: "offsite:steelbuild-pro-storage",
      SUPABASE_EXPECTED_PROJECT_REF: "not a project ref",
      SUPABASE_S3_ACCESS_KEY_ID: "source-key",
      SUPABASE_S3_ENDPOINT: "https://exampleprojectref123.storage.supabase.co/storage/v1/s3",
      SUPABASE_S3_REGION: "us-east-1",
      SUPABASE_S3_SECRET_ACCESS_KEY: "source-secret",
    })).toThrow("valid Supabase project ref");
  });

  it("rejects an HTTPS endpoint that is not the expected Supabase project", () => {
    const offsiteConfig = Buffer.from("[offsite]\ntype = azureblob\n").toString("base64");

    expect(() => validateStorageBackupEnvironment({
      OFFSITE_RCLONE_CONFIG_B64: offsiteConfig,
      OFFSITE_ROOT: "offsite:steelbuild-pro-storage",
      SUPABASE_EXPECTED_PROJECT_REF: "expectedprojectref12",
      SUPABASE_S3_ACCESS_KEY_ID: "source-key",
      SUPABASE_S3_ENDPOINT: "https://stagingprojectref123.storage.supabase.co/storage/v1/s3",
      SUPABASE_S3_REGION: "us-east-1",
      SUPABASE_S3_SECRET_ACCESS_KEY: "source-secret",
    })).toThrow("does not match SUPABASE_EXPECTED_PROJECT_REF");
  });

  it("accepts the intended Supabase endpoint with case-insensitive hostname matching", () => {
    const offsiteConfig = Buffer.from("[offsite]\ntype = azureblob\n").toString("base64");

    expect(validateStorageBackupEnvironment({
      OFFSITE_RCLONE_CONFIG_B64: offsiteConfig,
      OFFSITE_ROOT: "offsite:steelbuild-pro-storage",
      SUPABASE_EXPECTED_PROJECT_REF: "exampleprojectref123",
      SUPABASE_S3_ACCESS_KEY_ID: "source-key",
      SUPABASE_S3_ENDPOINT: "https://EXAMPLEPROJECTREF123.STORAGE.SUPABASE.CO/storage/v1/s3",
      SUPABASE_S3_REGION: "us-east-1",
      SUPABASE_S3_SECRET_ACCESS_KEY: "source-secret",
    }).source).toEqual({
      provider: "supabase-storage",
      projectRef: "exampleprojectref123",
    });
  });

  it("requires the decoded destination configuration to define the offsite remote", () => {
    const encoded = Buffer.from("[backup]\ntype = azureblob\n").toString("base64");

    expect(() => decodeOffsiteRcloneConfig(encoded)).toThrow("[offsite]");
  });

  it("rejects malformed base64 destination configuration", () => {
    expect(() => decodeOffsiteRcloneConfig("not-base64!"))
      .toThrow("valid base64");
  });
});

describe("Storage backup verification", () => {
  it("accepts a verified empty bucket", () => {
    expect(() => assertBackupVerified({
      bucket: "email-attachments",
      source: { count: 0, bytes: 0 },
      snapshot: { count: 0, bytes: 0 },
      current: { count: 0, bytes: 0 },
    })).not.toThrow();
  });

  it("fails when either destination differs from the source", () => {
    expect(() => assertBackupVerified({
      bucket: "app-files",
      source: { count: 10, bytes: 1200 },
      snapshot: { count: 10, bytes: 1200 },
      current: { count: 9, bytes: 1100 },
    })).toThrow("app-files current verification failed");
  });
});

describe("Storage backup execution", () => {
  it("creates a stable UTC path timestamp", () => {
    expect(formatStorageBackupTimestamp(new Date("2026-07-23T00:30:45.123Z")))
      .toBe("20260723T003045Z");
  });

  it("maps source credentials to an isolated rclone remote", () => {
    expect(createRcloneSourceEnvironment({
      SUPABASE_S3_ACCESS_KEY_ID: "source-key",
      SUPABASE_S3_ENDPOINT: "https://example.storage.supabase.co/storage/v1/s3",
      SUPABASE_S3_REGION: "us-east-1",
      SUPABASE_S3_SECRET_ACCESS_KEY: "source-secret",
    })).toEqual({
      RCLONE_CONFIG_SUPABASE_TYPE: "s3",
      RCLONE_CONFIG_SUPABASE_PROVIDER: "Other",
      RCLONE_CONFIG_SUPABASE_ACCESS_KEY_ID: "source-key",
      RCLONE_CONFIG_SUPABASE_SECRET_ACCESS_KEY: "source-secret",
      RCLONE_CONFIG_SUPABASE_ENDPOINT: "https://example.storage.supabase.co/storage/v1/s3",
      RCLONE_CONFIG_SUPABASE_REGION: "us-east-1",
      RCLONE_CONFIG_SUPABASE_NO_CHECK_BUCKET: "true",
    });
  });

  it("removes raw backup settings from the rclone child environment", () => {
    const childEnvironment = createRcloneChildEnvironment({
      PATH: "C:\\tools",
      OFFSITE_RCLONE_CONFIG_B64: "destination-secret",
      OFFSITE_ROOT: "offsite:steelbuild-pro-storage",
      SUPABASE_EXPECTED_PROJECT_REF: "exampleprojectref123",
      SUPABASE_S3_ACCESS_KEY_ID: "source-key",
      SUPABASE_S3_ENDPOINT: "https://example.storage.supabase.co/storage/v1/s3",
      SUPABASE_S3_REGION: "us-east-1",
      SUPABASE_S3_SECRET_ACCESS_KEY: "source-secret",
    });

    expect(childEnvironment.PATH).toBe("C:\\tools");
    expect(childEnvironment.OFFSITE_RCLONE_CONFIG_B64).toBeUndefined();
    expect(childEnvironment.OFFSITE_ROOT).toBeUndefined();
    expect(childEnvironment.SUPABASE_EXPECTED_PROJECT_REF).toBeUndefined();
    expect(childEnvironment.SUPABASE_S3_ACCESS_KEY_ID).toBeUndefined();
    expect(childEnvironment.SUPABASE_S3_ENDPOINT).toBeUndefined();
    expect(childEnvironment.SUPABASE_S3_REGION).toBeUndefined();
    expect(childEnvironment.SUPABASE_S3_SECRET_ACCESS_KEY).toBeUndefined();
    expect(childEnvironment.RCLONE_CONFIG_SUPABASE_ACCESS_KEY_ID).toBe("source-key");
    expect(childEnvironment.RCLONE_CONFIG_SUPABASE_SECRET_ACCESS_KEY).toBe("source-secret");
    expect(childEnvironment.RCLONE_CONFIG_SUPABASE_ENDPOINT)
      .toBe("https://example.storage.supabase.co/storage/v1/s3");
    expect(childEnvironment.RCLONE_CONFIG_SUPABASE_REGION).toBe("us-east-1");
  });

  it("removes case-insensitive raw backup settings from the rclone child environment", () => {
    const rawKeyVariants = {
      Offsite_Rclone_Config_B64: "destination-secret",
      offsite_root: "offsite:steelbuild-pro-storage",
      Supabase_S3_Access_Key_Id: "alternate-source-key",
      supabase_s3_endpoint: "https://alternate.storage.supabase.co/storage/v1/s3",
      Supabase_S3_Region: "alternate-region",
      supabase_s3_secret_access_key: "alternate-source-secret",
      supabase_expected_project_ref: "alternateprojectref12",
    };
    const childEnvironment = createRcloneChildEnvironment({
      PATH: "C:\\tools",
      OFFSITE_RCLONE_CONFIG_B64: "destination-secret",
      OFFSITE_ROOT: "offsite:steelbuild-pro-storage",
      SUPABASE_EXPECTED_PROJECT_REF: "exampleprojectref123",
      SUPABASE_S3_ACCESS_KEY_ID: "source-key",
      SUPABASE_S3_ENDPOINT: "https://example.storage.supabase.co/storage/v1/s3",
      SUPABASE_S3_REGION: "us-east-1",
      SUPABASE_S3_SECRET_ACCESS_KEY: "source-secret",
      ...rawKeyVariants,
    });

    expect(childEnvironment.PATH).toBe("C:\\tools");
    for (const rawKey of Object.keys(rawKeyVariants)) {
      expect(childEnvironment[rawKey]).toBeUndefined();
    }
  });

  it("copies immutable snapshots, syncs current mirrors, and checks both destinations", () => {
    const [item] = createStorageBackupPlan({
      destinationRoot: "offsite:steelbuild-pro-storage",
      timestamp: "20260723T003000Z",
    });

    expect(createRcloneBackupOperations(item)).toEqual([
      {
        label: "app-files snapshot copy",
        args: [
          "copy",
          "supabase:app-files",
          "offsite:steelbuild-pro-storage/snapshots/20260723T003000Z/app-files",
          "--immutable",
          "--metadata",
          "--fast-list",
          "--transfers",
          "8",
          "--checkers",
          "16",
          "--stats",
          "30s",
          "--stats-one-line",
        ],
      },
      {
        label: "app-files current sync",
        args: [
          "sync",
          "supabase:app-files",
          "offsite:steelbuild-pro-storage/current/app-files",
          "--metadata",
          "--fast-list",
          "--transfers",
          "8",
          "--checkers",
          "16",
          "--stats",
          "30s",
          "--stats-one-line",
        ],
      },
      {
        label: "app-files snapshot check",
        args: [
          "check",
          "supabase:app-files",
          "offsite:steelbuild-pro-storage/snapshots/20260723T003000Z/app-files",
          "--size-only",
        ],
      },
      {
        label: "app-files current check",
        args: [
          "check",
          "supabase:app-files",
          "offsite:steelbuild-pro-storage/current/app-files",
          "--size-only",
        ],
      },
    ]);
  });

  it("refuses to create a verified manifest without a validated source identity", async () => {
    const plan = createStorageBackupPlan({
      destinationRoot: "offsite:steelbuild-pro-storage",
      timestamp: "20260723T003000Z",
    });

    await expect(executeStorageBackupPlan({
      plan,
      timestamp: "20260723T003000Z",
      execute: async () => {
        throw new Error("rclone must not run without source identity");
      },
    })).rejects.toThrow("validated Supabase source identity");
  });

  it("returns a verified manifest only after both required buckets pass", async () => {
    const timestamp = "20260723T003000Z";
    const plan = createStorageBackupPlan({
      destinationRoot: "offsite:steelbuild-pro-storage",
      timestamp,
    });
    const calls = [];
    const stats = {
      "supabase:app-files": { count: 2, bytes: 300 },
      "offsite:steelbuild-pro-storage/snapshots/20260723T003000Z/app-files": { count: 2, bytes: 300 },
      "offsite:steelbuild-pro-storage/current/app-files": { count: 2, bytes: 300 },
      "supabase:email-attachments": { count: 0, bytes: 0 },
      "offsite:steelbuild-pro-storage/snapshots/20260723T003000Z/email-attachments": { count: 0, bytes: 0 },
      "offsite:steelbuild-pro-storage/current/email-attachments": { count: 0, bytes: 0 },
    };
    const execute = async (args) => {
      calls.push(args);
      return args[0] === "size" ? JSON.stringify(stats[args[1]]) : "";
    };

    const manifest = await executeStorageBackupPlan({
      plan,
      timestamp,
      completedAt: "2026-07-23T00:31:00.000Z",
      source: {
        provider: "supabase-storage",
        projectRef: "exampleprojectref123",
      },
      execute,
    });

    expect(calls.filter(([command]) => command === "check")).toHaveLength(4);
    expect(calls.filter(([command]) => command === "size")).toHaveLength(6);
    expect(manifest).toEqual({
      schemaVersion: 1,
      status: "verified",
      backupTimestamp: timestamp,
      completedAt: "2026-07-23T00:31:00.000Z",
      source: {
        provider: "supabase-storage",
        projectRef: "exampleprojectref123",
      },
      buckets: [
        {
          bucket: "app-files",
          objects: 2,
          bytes: 300,
          snapshot: "offsite:steelbuild-pro-storage/snapshots/20260723T003000Z/app-files",
          current: "offsite:steelbuild-pro-storage/current/app-files",
        },
        {
          bucket: "email-attachments",
          objects: 0,
          bytes: 0,
          snapshot: "offsite:steelbuild-pro-storage/snapshots/20260723T003000Z/email-attachments",
          current: "offsite:steelbuild-pro-storage/current/email-attachments",
        },
      ],
    });
  });

  it("fails closed when rclone size output is not valid JSON", async () => {
    const plan = createStorageBackupPlan({
      destinationRoot: "offsite:steelbuild-pro-storage",
      timestamp: "20260723T003000Z",
    });

    await expect(executeStorageBackupPlan({
      plan,
      timestamp: "20260723T003000Z",
      completedAt: "2026-07-23T00:31:00.000Z",
      source: {
        provider: "supabase-storage",
        projectRef: "exampleprojectref123",
      },
      execute: async (args) => args[0] === "size" ? "not-json" : "",
    })).rejects.toThrow("rclone size returned invalid JSON");
  });
});
