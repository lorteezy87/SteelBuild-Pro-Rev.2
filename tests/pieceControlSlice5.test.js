import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/20260718050000_piece_control_slice5.sql",
);
const sql = fs.readFileSync(migrationPath, "utf8");

function functionBody(name) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION "public"."${name}"`);
  const next = sql.indexOf("CREATE OR REPLACE FUNCTION", start + 1);
  return sql.slice(start, next === -1 ? sql.length : next);
}

describe("Slice 5 migration contract", () => {
  it("provides only the three valid lifecycle commands", () => {
    expect(sql).toContain('"ship_piece_lots"');
    expect(sql).toContain('"deliver_piece_lots"');
    expect(sql).toContain('"erect_piece_lots"');
    expect(functionBody("ship_piece_lots")).toContain("'fabricated'");
    expect(functionBody("ship_piece_lots")).toContain("'shipped'");
    expect(functionBody("deliver_piece_lots")).toContain("'delivered'");
    expect(functionBody("erect_piece_lots")).toContain("'erected'");
  });

  it("has no override or administrative bypass parameter", () => {
    for (const command of ["ship_piece_lots", "deliver_piece_lots", "erect_piece_lots"]) {
      expect(functionBody(command)).not.toMatch(/p_override|override_reason|admin_bypass/i);
    }
  });

  it("atomically rejects held, container, deleted, and cross-project selections", () => {
    const body = functionBody("transition_piece_lots_canonical");
    expect(body).toContain("v_piece.is_deleted = true");
    expect(body).toContain("v_piece.is_container = true");
    expect(body).toContain("v_piece.on_hold = true");
    expect(body).toContain("v_locked <> v_expected");
    expect(body).toContain("'atomic', true");
  });

  it("requires project authorization and piece-control mode", () => {
    const body = functionBody("transition_piece_lots_canonical");
    expect(body).toContain('"user_has_project_role_at_least"(p_project_id, \'field\')');
    expect(body).toContain("v_mode = 'off'");
    expect(body).toContain("errcode = '42501'");
  });

  it("writes complete immutable event audit records", () => {
    expect(sql).toContain('"guard_piece_event_immutable"');
    expect(sql).toContain('BEFORE UPDATE ON "public"."piece_events"');
    expect(sql).toContain('BEFORE DELETE ON "public"."piece_events"');
    const body = functionBody("transition_piece_lots_canonical");
    expect(body).toContain('"created_by", "created_at"');
    expect(body).toContain("'reference_data', p_reference_data");
    expect(body).toContain("'piece_control'");
  });

  it("keeps legacy deliveries and dashboards untouched", () => {
    expect(sql).not.toMatch(/UPDATE\s+"public"\."deliveries"/i);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+"public"\."deliveries"/i);
    expect(sql).not.toMatch(/model_elements|dashboard/i);
  });
});

