import { test, expect } from "@playwright/test";
import { signInAsTestUser, signInAsViewerOrNull } from "./fixtures/supabaseUser";
import { assertDisposableMutationEnvironment } from "./environment";

/**
 * e2e/fab-release-gate.spec.ts — the mutation-aware fab-release gate contract.
 *
 * Proves the SERVER arbitrates fab release end-to-end (client → RLS → BEFORE
 * INSERT trigger), the one path the Vitest suite can't reach because it mocks
 * supabase. Mirrors what src/lib/fabRelease/releaseStatus.ts#recordFabRelease
 * does (a guarded insert into public.fab_release_log), so this is the real
 * boundary, not a stub.
 *
 * Gate contract (supabase/migrations/20260612131000_fab_release_gate_enforcement.sql):
 *   • open RFI on a package sheet + no override_reason  → raise FAB_RELEASE_BLOCKED
 *   • same package + override_reason                     → inserts; server snapshots
 *                                                          blocking_rfi_numbers
 *   • package with no open RFIs                          → clean insert, blocking empty
 *   • RLS: insert requires pm+ role on the project       → viewer is rejected
 *
 * fab_release_log is APPEND-ONLY by design (no update/delete RLS policy — it's the
 * audit trail), so this spec does NOT tear down its rows; it asserts on the rows it
 * inserted by id. Run against the TEST org only.
 *
 * One-time fixture (owner; see e2e/README.md "Fab-release gate fixture"):
 *   E2E_FAB_PROJECT_ID     a project in the test org where the test user is pm+
 *   E2E_BLOCKED_DRAWING_ID a drawing in that project whose sheet has an OPEN RFI
 *   E2E_CLEAN_DRAWING_ID   a drawing in that project with NO open RFI
 */

const PROJECT_ID = process.env.E2E_FAB_PROJECT_ID || "";
const BLOCKED_DRAWING_ID = process.env.E2E_BLOCKED_DRAWING_ID || "";
const CLEAN_DRAWING_ID = process.env.E2E_CLEAN_DRAWING_ID || "";

const FAB_RELEASE_BLOCKED_PREFIX = "FAB_RELEASE_BLOCKED";

// Skip the whole file (don't fail) when the fixture isn't provisioned, so the
// gate spec is opt-in like the rest of the E2E harness.
test.describe("fab-release gate (server-arbitrated)", () => {
  test.skip(
    process.env.E2E_MUTATIONS_ENABLED !== "true",
    "Mutation E2E is explicitly opt-in and staging-only.",
  );
  test.beforeAll(() => assertDisposableMutationEnvironment());
  test.skip(
    !PROJECT_ID || !BLOCKED_DRAWING_ID || !CLEAN_DRAWING_ID,
    "Set E2E_FAB_PROJECT_ID / E2E_BLOCKED_DRAWING_ID / E2E_CLEAN_DRAWING_ID to run. See e2e/README.md.",
  );

  test("BLOCKED: open RFI + no override is refused by the server", async () => {
    const { supabase } = await signInAsTestUser();
    const { data, error } = await supabase
      .from("fab_release_log")
      .insert({
        project_id: PROJECT_ID,
        package_kind: "fab_release",
        package_name: "E2E blocked package",
        drawing_ids: [BLOCKED_DRAWING_ID],
        drawing_count: 1,
        override_reason: null,
      })
      .select()
      .single();

    expect(data, "insert should have been refused, not succeeded").toBeNull();
    expect(error, "expected a gate error").not.toBeNull();
    const blob = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`;
    expect(blob, "server must raise the FAB_RELEASE_BLOCKED gate exception").toContain(
      FAB_RELEASE_BLOCKED_PREFIX,
    );
    // The message lists the blocking RFI(s) in the final parenthetical.
    expect(blob).toMatch(/\([^)]*RFI[^)]*\)|\([^)]+\)/i);
  });

  test("OVERRIDE: same package with a reason inserts and snapshots the blocking set", async () => {
    const { supabase } = await signInAsTestUser();
    const { data, error } = await supabase
      .from("fab_release_log")
      .insert({
        project_id: PROJECT_ID,
        package_kind: "fab_release",
        package_name: "E2E override package",
        drawing_ids: [BLOCKED_DRAWING_ID],
        drawing_count: 1,
        override_reason: "E2E: released past gate to hold schedule (test)",
      })
      .select()
      .single();

    expect(error, `override insert should succeed: ${error?.message}`).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.override_reason).toContain("E2E");
    // Server computed the blocking snapshot — client never supplied it.
    expect(
      Array.isArray(data!.blocking_rfi_numbers) && data!.blocking_rfi_numbers.length > 0,
      "server must snapshot the open RFIs that were overridden",
    ).toBe(true);
    expect(data!.released_at).toBeTruthy();
  });

  test("CLEAN: package with no open RFIs releases with an empty blocking set", async () => {
    const { supabase } = await signInAsTestUser();
    const { data, error } = await supabase
      .from("fab_release_log")
      .insert({
        project_id: PROJECT_ID,
        package_kind: "fab_release",
        package_name: "E2E clean package",
        drawing_ids: [CLEAN_DRAWING_ID],
        drawing_count: 1,
        override_reason: null,
      })
      .select()
      .single();

    expect(error, `clean release should succeed: ${error?.message}`).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.override_reason).toBeNull();
    expect(data!.blocking_rfi_numbers ?? []).toHaveLength(0);
  });

  test("RLS: a viewer-role user cannot record a release", async () => {
    const viewer = await signInAsViewerOrNull();
    test.skip(!viewer, "Set E2E_VIEWER_USER / E2E_VIEWER_PASS to run the RLS-deny check.");

    const { data, error } = await viewer!.supabase
      .from("fab_release_log")
      .insert({
        project_id: PROJECT_ID,
        package_kind: "fab_release",
        package_name: "E2E viewer should be denied",
        drawing_ids: [CLEAN_DRAWING_ID],
        drawing_count: 1,
        override_reason: null,
      })
      .select()
      .single();

    expect(data, "viewer insert must not succeed").toBeNull();
    expect(error, "RLS must reject a sub-pm role").not.toBeNull();
    // PostgREST surfaces an RLS violation (42501 / "row-level security").
    const blob = `${error?.message ?? ""} ${error?.code ?? ""}`;
    expect(blob).toMatch(/row-level security|42501|violates/i);
  });
});
