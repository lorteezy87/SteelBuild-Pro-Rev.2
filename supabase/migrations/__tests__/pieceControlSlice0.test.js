import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const migration = fs.readFileSync(
  path.join(here, "..", "20260718000000_piece_control_slice0.sql"),
  "utf8",
);

describe("piece-control slice 0 migration contract", () => {
  it("adds new schema objects additively", () => {
    const requiredFragments = [
      "ADD COLUMN IF NOT EXISTS \"piece_control_mode\"",
      "CREATE TABLE IF NOT EXISTS \"public\".\"pieces\"",
      "CREATE TABLE IF NOT EXISTS \"public\".\"piece_events\"",
      "ADD COLUMN IF NOT EXISTS \"piece_id\"",
    ];

    for (const fragment of requiredFragments) {
      expect(migration).toContain(fragment);
    }
  });

  it("defaults piece_control_mode to off", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS \"piece_control_mode\" text NOT NULL DEFAULT 'off';");
    expect(migration).toContain("\"piece_control_mode\" = ANY");
    expect(migration).toContain("'off'::\"text\"");
    expect(migration).toContain("'shadow'::\"text\"");
    expect(migration).toContain("'pilot'::\"text\"");
    expect(migration).toContain("'live'::\"text\"");
  });

  it("creates pieces and events with canonical status vocabularies", () => {
    expect(migration).toContain("pieces_lifecycle_status_check");
    expect(migration).toContain("'not_started'::\"text\"");
    expect(migration).toContain("'in_fabrication'::\"text\"");
    expect(migration).toContain("'fabricated'::\"text\"");
    expect(migration).toContain("'shipped'::\"text\"");
    expect(migration).toContain("'delivered'::\"text\"");
    expect(migration).toContain("'erected'::\"text\"");

    expect(migration).toContain("pieces_current_station_check");
    expect(migration).toContain("'cut'::\"text\"");
    expect(migration).toContain("'fit'::\"text\"");
    expect(migration).toContain("'weld'::\"text\"");
    expect(migration).toContain("'qc'::\"text\"");
    expect(migration).toContain("'paint'::\"text\"");
    expect(migration).toContain("'ready_to_ship'::\"text\"");

    expect(migration).toContain("piece_events_event_type_check");
    expect(migration).toContain("'imported'::\"text\"");
    expect(migration).toContain("'drawing_unlinked'::\"text\"");
    expect(migration).toContain("'erected'::\"text\"");
  });

  it("enables row-level security only and keeps authenticated policy to read", () => {
    expect(migration).toContain("ALTER TABLE \"public\".\"pieces\" ENABLE ROW LEVEL SECURITY;");
    expect(migration).toContain("ALTER TABLE \"public\".\"piece_events\" ENABLE ROW LEVEL SECURITY;");

    expect(migration).toContain("CREATE POLICY \"piece_read\" ON \"public\".\"pieces\"");
    expect(migration).toContain("CREATE POLICY \"piece_event_read\" ON \"public\".\"piece_events\"");
    expect(migration).toContain("FOR SELECT TO \"authenticated\"");
    expect(migration).not.toMatch(/FOR (INSERT|UPDATE|DELETE) TO \"authenticated\"/);
    expect(migration).not.toMatch(/TO \"anon\"/);
  });

  it("does not alter legacy piece-production or fab-release log tables in this slice", () => {
    expect(migration).not.toContain("piece_production");
    expect(migration).not.toContain("fab_release_log");
  });
});
