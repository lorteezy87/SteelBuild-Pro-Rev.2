import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../20260919120000_gc_document_register.sql", import.meta.url),
  "utf8",
);

describe("gc document register migration", () => {
  it("records the owner's say-so, because CLAUDE.md forbids touching gc_drawings without it", () => {
    // The rule is "Without the owner's say-so, don't add migrations for
    // 2026-only tables or columns: gc_drawings, …". A future reader must be
    // able to see the authorisation from the file itself, not infer it.
    expect(migration).toMatch(/owner decision \(2026-09-19\)/i);
    expect(migration).toMatch(/SteelBuild-Pro-2026/);
  });

  it("adopts both tables idempotently so production is a no-op and a fresh reset replays", () => {
    expect(migration).toMatch(/create table if not exists public\.gc_drawing_sets/i);
    expect(migration).toMatch(/create table if not exists public\.gc_drawings/i);
    // The FK direction that makes a set own its sheets.
    expect(migration).toMatch(
      /gc_drawings_gc_drawing_set_id_fkey foreign key \(gc_drawing_set_id\)[\s\S]*references public\.gc_drawing_sets \(id\) on delete cascade/i,
    );
  });

  it("never re-declares sync_gc_drawing_set_counts, and skips its trigger when absent", () => {
    // The function body is md5-pinned by 20260913201900. Re-creating it here
    // would silently redefine a function this repo does not own.
    expect(migration).not.toMatch(/create\s+(or replace\s+)?function public\.sync_gc_drawing_set_counts/i);
    // Guarded so a Rev.2-only replay without the function degrades to a notice
    // rather than aborting the whole migration.
    expect(migration).toMatch(
      /to_regprocedure\('public\.sync_gc_drawing_set_counts\(\)'\) is not null/i,
    );
    expect(migration).toMatch(/raise notice[\s\S]*sync_gc_drawing_set_counts/i);
  });

  it("leaves the 20260912023827 grant-hardening exclusion alone", () => {
    // That file's test asserts sync_gc_drawing_set_counts is NOT revoked there.
    // Adding the revoke here instead would route around that decision without
    // arguing it; it needs its own forward migration.
    expect(migration).not.toMatch(/revoke[^;]*sync_gc_drawing_set_counts/i);
  });

  it("adds every new column additively, so a 2026-app insert that omits them still works", () => {
    expect(migration).toMatch(
      /alter table public\.gc_drawing_sets\s+add column if not exists doc_type text not null default 'gc_drawing'/i,
    );
    for (const col of ["doc_number", "received_date", "steel_impact", "impact_notes"]) {
      expect(migration).toMatch(new RegExp(`add column if not exists ${col}\\b`, "i"));
    }
    for (const col of ["is_superseded", "superseded_by_id"]) {
      expect(migration).toMatch(new RegExp(`add column if not exists ${col}\\b`, "i"));
    }
    // No destructive DDL against columns the sibling app writes.
    expect(migration).not.toMatch(/alter table public\.gc_draw\w*\s+drop column/i);
  });

  it("constrains doc_type to the GC-issuance vocabulary", () => {
    expect(migration).toMatch(
      /gc_drawing_sets_doc_type_check check \(doc_type = any \(array\[[\s\S]*'asi'::text[\s\S]*'addendum'::text[\s\S]*'bulletin'::text[\s\S]*'ccd'::text[\s\S]*'contract_document'::text/i,
    );
    // NOT VALID then VALIDATE: the same two-step 20260913090000 uses, so the
    // ADD does not take a full table lock while it scans.
    expect(migration).toMatch(
      /gc_drawing_sets_doc_type_check[\s\S]*not valid;[\s\S]*validate constraint gc_drawing_sets_doc_type_check/i,
    );
  });

  it("defaults steel_impact to unknown, never none", () => {
    // "Absence is not evidence" (CLAUDE.md). An ASI nobody has read yet has NOT
    // been cleared of steel impact — rendering it as "none" would tell a PM the
    // opposite of the truth.
    expect(migration).toMatch(
      /add column if not exists steel_impact text not null default 'unknown'/i,
    );
    expect(migration).not.toMatch(/steel_impact[^;]*default 'none'/i);
    expect(migration).toMatch(
      /gc_drawing_sets_steel_impact_check check \(steel_impact = any \(array\[[\s\S]*'unknown'::text[\s\S]*'pending_review'::text[\s\S]*'none'::text[\s\S]*'impacted'::text/i,
    );
  });

  it("makes supersession a real link that survives losing the successor", () => {
    expect(migration).toMatch(
      /gc_drawings_superseded_by_id_fkey foreign key \(superseded_by_id\)[\s\S]*references public\.gc_drawings \(id\) on delete set null/i,
    );
    expect(migration).toMatch(
      /gc_drawings_superseded_by_not_self[\s\S]*superseded_by_id <> id/i,
    );
    // is_superseded is the claim; superseded_by_id is only the pointer, and a
    // NULL pointer must not be read as "still current".
    expect(migration).toMatch(/add column if not exists is_superseded boolean not null default false/i);
  });

  it("re-declares RLS with explicit per-role policies and no blanket-true", () => {
    for (const policy of [
      "gc_drawing_sets_select",
      "gc_drawing_sets_insert",
      "gc_drawing_sets_update",
      "gc_drawings_select",
      "gc_drawings_insert",
      "gc_drawings_update",
    ]) {
      expect(migration).toMatch(new RegExp(`create policy ${policy}\\b`, "i"));
    }
    expect(migration).toMatch(/alter table public\.gc_drawing_sets enable row level security/i);
    expect(migration).toMatch(/alter table public\.gc_drawings enable row level security/i);
    expect(migration).not.toMatch(/using \(true\)|with check \(true\)/i);
    // Reads follow project access; writes need PM.
    expect(migration).toMatch(/user_has_project_access\(project_id\)/);
    expect(migration).toMatch(/user_has_project_role_at_least\(project_id, 'pm'::text\)/);
    // anon must hold nothing on either table.
    expect(migration).toMatch(/revoke all on table public\.gc_drawing_sets from public, anon/i);
    expect(migration).toMatch(/revoke all on table public\.gc_drawings from public, anon/i);
  });

  it("reloads the PostgREST schema cache so the new columns are selectable", () => {
    expect(migration.trimEnd()).toMatch(/notify pgrst, 'reload schema';$/i);
  });
});
