import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20260718040000_piece_control_slice4.sql',
);
const sql = fs.readFileSync(migrationPath, 'utf8');

describe('Slice 4 migration contract', () => {
  it('marks roll-up containers and permits production only on active leaves', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "is_container"');
    expect(sql).toContain('Only an active actionable leaf lot can be split');
    expect(sql).toContain('Production actions are allowed only on actionable leaf lots');
    expect(sql).toContain('"is_container" = false');
  });

  it('conserves split quantity and prevents terminal-state splits', () => {
    expect(sql).toContain('v_total_quantity <> v_source.quantity');
    expect(sql).toContain('Child quantities must sum exactly to the source quantity');
    expect(sql).toContain("ARRAY['shipped', 'delivered', 'erected']");
    expect(sql).toContain("'lot_split'");
  });

  it('inherits relationships, material mappings, and station history', () => {
    expect(sql).toContain('INSERT INTO "public"."piece_drawings"');
    expect(sql).toContain('INSERT INTO "public"."piece_material_requirements"');
    expect(sql).toContain('"inherited_from_completion_id"');
    expect(sql).toContain("'inherited_by_lot_split', true");
  });

  it('enforces six ordered stations and exactly 100 earned percent', () => {
    expect(sql).toContain("'ready_to_ship', 'Ready to Ship', 6, 10");
    expect(sql).toContain('v_percent_total <> 100');
    expect(sql).toContain('must total exactly 100');
    expect(sql).toContain('v_count <> 6');
  });

  it('enforces release, hold, sequence, override, and terminal hard blocks', () => {
    expect(sql).toContain('Work package must have an active canonical release');
    expect(sql).toContain('v_piece.on_hold = true');
    expect(sql).toContain('Previous production stations must be completed');
    expect(sql).toContain('requires a non-empty override reason');
    expect(sql).toContain('A shipped, delivered, or erected lot cannot advance');
  });

  it('maps final station to fabricated and repeats idempotently', () => {
    expect(sql).toContain("THEN 'fabricated'");
    expect(sql).toContain("ELSE 'in_fabrication'");
    expect(sql).toContain("'unchanged', true");
  });

  it('allows browser reads but restricts all writes to authorized RPCs', () => {
    expect(sql).toContain(
      'REVOKE ALL ON TABLE "public"."piece_station_completions" FROM PUBLIC, "anon", "authenticated"',
    );
    expect(sql).toContain(
      'GRANT SELECT ON TABLE "public"."piece_station_completions" TO "authenticated"',
    );
    expect(sql).toContain(
      'GRANT EXECUTE ON FUNCTION "public"."split_piece_lot"',
    );
    expect(sql).toContain(
      'GRANT EXECUTE ON FUNCTION "public"."advance_piece_station"',
    );
  });
});
