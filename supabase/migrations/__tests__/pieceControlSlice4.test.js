import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL("../20260718040000_piece_control_slice4.sql", import.meta.url),
);
const sql = readFileSync(migrationPath, "utf8");

describe("piece control Slice 4 migration contract", () => {
  it("establishes station RLS before deferred trigger and seed events", () => {
    const configurationRlsIndex = sql.indexOf(
      'ALTER TABLE "public"."piece_station_configurations" ENABLE ROW LEVEL SECURITY;',
    );
    const completionRlsIndex = sql.indexOf(
      'ALTER TABLE "public"."piece_station_completions" ENABLE ROW LEVEL SECURITY;',
    );
    const configurationPolicyIndex = sql.indexOf(
      'CREATE POLICY "piece_station_configuration_read"',
    );
    const completionPolicyIndex = sql.indexOf(
      'CREATE POLICY "piece_station_completion_read"',
    );
    const deferredTriggerIndex = sql.indexOf(
      'CREATE CONSTRAINT TRIGGER "validate_piece_station_configuration_deferred"',
    );
    const seedExecutionIndex = sql.indexOf(
      'SELECT "public"."seed_default_piece_stations"("id", NULL)',
    );

    expect(configurationRlsIndex).toBeGreaterThan(-1);
    expect(completionRlsIndex).toBeGreaterThan(-1);
    expect(configurationPolicyIndex).toBeGreaterThan(configurationRlsIndex);
    expect(completionPolicyIndex).toBeGreaterThan(completionRlsIndex);
    expect(deferredTriggerIndex).toBeGreaterThan(configurationPolicyIndex);
    expect(deferredTriggerIndex).toBeGreaterThan(completionPolicyIndex);
    expect(seedExecutionIndex).toBeGreaterThan(deferredTriggerIndex);
  });
});
