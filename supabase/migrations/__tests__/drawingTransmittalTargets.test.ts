import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../20260913090000_drawing_transmittal_targets.sql", import.meta.url),
  "utf8",
);

describe("drawing transmittal targets migration", () => {
  it("backfills drawing targets before enforcing exactly one target", () => {
    expect(migration).toMatch(
      /set drawing_id = revision\.drawing_id[\s\S]*item\.gc_drawing_id is null/i,
    );
    expect(migration).toMatch(
      /drawing_transmittal_items_one_target[\s\S]*num_nonnulls\(drawing_id, gc_drawing_id\) = 1/i,
    );
    expect(migration).toMatch(
      /foreign key \(drawing_id\)[\s\S]*references public\.drawings\(id\)/i,
    );
    expect(migration).toMatch(
      /alter column drawing_revision_id drop not null/i,
    );
  });
});
