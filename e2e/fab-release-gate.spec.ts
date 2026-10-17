import { test, expect } from "@playwright/test";
import { signInAsTestUser, signInAsViewerOrNull } from "./fixtures/supabaseUser";
import { assertDisposableMutationEnvironment } from "./environment";
import { createStagingFabPackage } from './fixtures/stagingFabPackage.js';
import { randomUUID } from 'node:crypto';
import { allowsStagingBrowserRequest, APP_ORIGIN, STAGING_ORIGIN, isLocalTelemetryDiscard } from './stagingNetworkGuard.js';
import { registerDrawingDeleteAcceptance } from './fixtures/drawingRegisterDeleteAcceptance.js';

registerDrawingDeleteAcceptance();

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
let cleanDrawingId = CLEAN_DRAWING_ID;

const FAB_RELEASE_BLOCKED_PREFIX = "FAB_RELEASE_BLOCKED";

// Skip the whole file (don't fail) when the fixture isn't provisioned, so the
// gate spec is opt-in like the rest of the E2E harness.
test.describe("fab-release gate (server-arbitrated)", () => {
  test.skip(
    process.env.E2E_MUTATIONS_ENABLED !== "true",
    "Mutation E2E is explicitly opt-in and staging-only.",
  );
  test.beforeAll(async () => {
    assertDisposableMutationEnvironment();
    if (PROJECT_ID === '6573ede6-e29d-4d15-8855-403029735231' && CLEAN_DRAWING_ID) {
      const { supabase } = await signInAsTestUser();
      cleanDrawingId = await createStagingFabPackage(supabase, PROJECT_ID, CLEAN_DRAWING_ID);
    }
  });
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
        drawing_ids: [cleanDrawingId],
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
        drawing_ids: [cleanDrawingId],
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

// Use fresh synthetic records and normal PM Auth/RLS. Never reset an existing
// approval to reproduce an error. These records retain their audit history.
test.describe('rejected submittal advance recovery (staging only)', () => {
  test.use({ serviceWorkers: 'block' });
  test.skip(process.env.E2E_MUTATIONS_ENABLED !== 'true' || !PROJECT_ID || !CLEAN_DRAWING_ID,
    'Requires the disposable staging fixture');
  for (const scenario of ['concurrent-release', 'changed-revision'] as const) {
    test(scenario, async ({ page }, info) => {
      test.setTimeout(120_000);
      assertDisposableMutationEnvironment();
      const { supabase } = await signInAsTestUser();
      const sheetId = await createStagingFabPackage(supabase, PROJECT_ID, CLEAN_DRAWING_ID);
      const sheetReply = await supabase.from('drawings').select('drawing_set_id').eq('id', sheetId).eq('project_id', PROJECT_ID).single();
      expect(sheetReply.error).toBeNull();
      const setId = sheetReply.data!.drawing_set_id;
      const parentReply = await supabase.from('submittals').select('id,submittal_number,status,updated_at,current_round_id')
        .eq('project_id', PROJECT_ID).contains('drawing_set_ids', [setId]).single();
      expect(parentReply.error).toBeNull();
      const parent = parentReply.data!;
      expect(parent.status).toBe('Approved');
      const manifest = await supabase.from('submittal_round_revision_evidence').select('*').eq('submittal_id', parent.id);
      expect(manifest.error).toBeNull();
      expect(manifest.data).toHaveLength(1);

      if (scenario === 'changed-revision') {
        const revision = await supabase.from('drawing_revisions').select('file_url,pdf_page,revision_code,version_number,sheet_number,sheet_title')
          .eq('drawing_id', sheetId).eq('project_id', PROJECT_ID).eq('is_current', true).single();
        expect(revision.error).toBeNull();
        const nextId = randomUUID();
        // A new revision identity using the retained synthetic PDF suffices to
        // invalidate the captured roster; do not alter original source bytes.
        const insert = await supabase.from('drawing_revisions').insert({ ...revision.data!, id: nextId,
          project_id: PROJECT_ID, drawing_id: sheetId, revision_code: 'B', version_number: 2, is_current: false });
        expect(insert.error).toBeNull();
        const publish = await supabase.rpc('publish_drawing_revision', { p_revision_id: nextId, p_release_status: 'released_for_shop' });
        expect(publish.error).toBeNull();
      }

      let commands = 0;
      let coverageReads = 0;
      const violations: string[] = [];
      page.on('response', response => {
        if (response.ok() && response.url() === `${STAGING_ORIGIN}/rest/v1/rpc/get_submittal_revision_coverage`
          && response.request().postDataJSON()?.p_submittal_id === parent.id) coverageReads++;
      });
      await page.context().routeWebSocket('**/*', socket => {
        const url = new URL(socket.url());
        if (url.origin !== STAGING_ORIGIN.replace('https:', 'wss:') || url.pathname !== '/realtime/v1/websocket') violations.push('forbidden-websocket');
        socket.close({ code: 1000, reason: 'Realtime disabled for explicit-read acceptance' });
      });
      let requests = 0;
      await page.context().route('**/*', async route => {
        if (++requests > 1000) { violations.push('request-budget'); await route.abort(); return; }
        const request = route.request();
        const url = new URL(request.url());
        if (url.username || url.password || url.hash) { violations.push('invalid-url'); await route.abort(); return; }
        const forward = async () => {
          const reply = await route.fetch({ maxRedirects: 0 });
          try {
            if (reply.status() >= 300 && reply.status() < 400) {
              violations.push('redirect'); await route.abort(); return;
            }
            await route.fulfill({ response: reply });
          } finally { await reply.dispose(); }
        };
        if (isLocalTelemetryDiscard(url.href, request.method())) { await route.fulfill({ status: 204 }); return; }
        if (url.origin === STAGING_ORIGIN && !url.search && request.method() === 'OPTIONS'
          && ['/rest/v1/rpc/apply_submittal_round_workflow', '/rest/v1/rpc/submittal_blocking_rfis'].includes(url.pathname)) {
          await forward(); return;
        }
        const rpc = url.origin === STAGING_ORIGIN && request.method() === 'POST' && !url.search;
        const command = rpc && url.pathname === '/rest/v1/rpc/apply_submittal_round_workflow';
        if (command) {
          commands++;
          const body = request.postDataJSON();
          if (commands !== 1 || body.p_submittal_id !== parent.id || body.p_patch?.status !== 'Released for Fabrication') {
            violations.push('unexpected-workflow-command'); await route.abort(); return;
          }
          if (scenario === 'concurrent-release') {
            // Commit another legitimate command only after the browser has
            // formed its reviewed payload, guaranteeing an authentic race.
            const coverage = await supabase.rpc('get_submittal_revision_coverage', { p_submittal_id: parent.id });
            expect(coverage.error).toBeNull();
            expect(coverage.data.ok).toBe(true);
            const released = await supabase.rpc('apply_submittal_round_workflow', {
              p_submittal_id: parent.id, p_request_id: randomUUID(), p_expected_updated_at: parent.updated_at,
              p_expected_status: parent.status, p_expected_current_round_id: parent.current_round_id,
              p_expected_revision_ids: coverage.data.current_revision_ids,
              p_patch: { status: 'Released for Fabrication', ball_in_court: null }, p_new_round: false,
            });
            expect(released.error).toBeNull();
          }
          await forward(); return;
        }
        if (rpc && url.pathname === '/rest/v1/rpc/submittal_blocking_rfis'
          && request.postDataJSON()?.p_submittal_id === parent.id) { await forward(); return; }
        const app = url.origin === 'https://steelbuild-pro-staging.n-lortz1987.workers.dev';
        const guarded = app ? `${APP_ORIGIN}${url.pathname}${url.search}` : url.href;
        if (allowsStagingBrowserRequest(guarded, request.method())) { await forward(); return; }
        violations.push('unexpected-network-route'); await route.abort();
      });
      await page.goto('/Submittals');
      await expect.poll(() => page.evaluate(() => localStorage.getItem('activeProjectId'))).toBe(PROJECT_ID);
      await page.getByRole('region', { name: 'Submittal register list', exact: true })
        .getByRole('button', { name: `Open submittal ${parent.submittal_number}`, exact: true }).click();
      const panel = page.getByRole('region', { name: 'Exact revision evidence', exact: true });
      await expect(panel).toBeVisible();
      if (scenario === 'concurrent-release') await expect(panel.getByText('Exact revision evidence verified', { exact: true })).toBeVisible();
      else await expect(panel.getByText('1 captured · 1 current · 1 missing · 1 superseded', { exact: true })).toBeVisible();
      const beforeReads = coverageReads;
      const rejection = page.waitForResponse(response => response.url() === `${STAGING_ORIGIN}/rest/v1/rpc/apply_submittal_round_workflow`);
      await page.getByRole('button', { name: 'Release for Fabrication →', exact: true }).click();
      const response = await rejection;
      expect(response.ok()).toBe(false);
      const error = await response.json();
      expect(error.message).toContain(scenario === 'concurrent-release' ? 'ROUND_STALE:' : 'ROUND_LEGACY_RECONCILIATION_REQUIRED:');
      await expect.poll(() => coverageReads).toBeGreaterThan(beforeReads);
      if (scenario === 'concurrent-release') await expect(page.getByRole('button', { name: 'Released for Fab', exact: true })).toBeDisabled();
      else {
        await expect(page.getByText(/^Revision evidence blocked this change\./)).toBeVisible();
        await expect(panel.getByText('1 captured · 1 current · 1 missing · 1 superseded', { exact: true })).toBeVisible();
      }
      expect(commands).toBe(1);
      const saved = await supabase.from('submittals').select('status,current_round_id').eq('id', parent.id).eq('project_id', PROJECT_ID).single();
      expect(saved.error).toBeNull();
      expect(saved.data!.status).toBe(scenario === 'concurrent-release' ? 'Released for Fabrication' : 'Approved');
      expect(saved.data!.current_round_id).toBe(parent.current_round_id);
      const after = await supabase.from('submittal_round_revision_evidence').select('*').eq('submittal_id', parent.id);
      expect(after.error).toBeNull();
      expect(after.data).toEqual(manifest.data);
      const finalCoverage = await supabase.rpc('get_submittal_revision_coverage', { p_submittal_id: parent.id });
      expect(finalCoverage.error).toBeNull();
      expect(finalCoverage.data.ok).toBe(scenario === 'concurrent-release');
      await info.attach('rejection-summary', { contentType: 'application/json', body: JSON.stringify({
        scenario, submittalId: parent.id, status: saved.data!.status, browserCommands: commands,
        coverageReadsBefore: beforeReads, coverageReadsAfter: coverageReads,
        serverError: scenario === 'concurrent-release' ? 'ROUND_STALE' : 'ROUND_LEGACY_RECONCILIATION_REQUIRED',
        coverageReason: finalCoverage.data.reason, originalManifestUnchanged: true,
      }) });
      expect(violations).toEqual([]);
      await page.screenshot({ path: info.outputPath(`${scenario}.png`), fullPage: true });
    });
  }
});
