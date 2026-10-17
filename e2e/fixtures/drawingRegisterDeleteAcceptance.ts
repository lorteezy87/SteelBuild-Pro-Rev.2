import { test, expect } from '@playwright/test';
import { createStagingFabPackage } from './stagingFabPackage.js';
import { signInAsTestUser, signInAsViewerOrNull } from './supabaseUser.js';
import { assertDisposableMutationEnvironment } from '../environment.js';
import { allowsStagingBrowserRequest, APP_ORIGIN, STAGING_ORIGIN, isLocalTelemetryDiscard } from '../stagingNetworkGuard.js';

/** Register only through the opted-in staging mutation suite. All created
 * records retain their source PDFs, revisions and approval audit trail. */
export function registerDrawingDeleteAcceptance() {
  test.describe('drawing register deletion and status (staging only)', () => {
    test.use({ serviceWorkers: 'block' });
    test.skip(process.env.E2E_MUTATIONS_ENABLED !== 'true', 'Disposable staging mutations only');
    for (const width of [1440, 390]) {
      test(`status, confirmed delete and Undo at ${width}px`, async ({ page }, info) => {
        test.setTimeout(120_000);
        assertDisposableMutationEnvironment();
        const projectId = process.env.E2E_FAB_PROJECT_ID || '';
        const { supabase } = await signInAsTestUser();
        const sheetId = await createStagingFabPackage(supabase, projectId, process.env.E2E_CLEAN_DRAWING_ID || '');
        const sheet = await supabase.from('drawings').select('id,sheet_number,drawing_set_id,is_deleted,stage')
          .eq('id', sheetId).eq('project_id', projectId).single();
        expect(sheet.error).toBeNull();
        expect(sheet.data!.is_deleted).toBe(false);
        const parent = await supabase.from('submittals').select('id').eq('project_id', projectId)
          .contains('drawing_set_ids', [sheet.data!.drawing_set_id]).single();
        expect(parent.error).toBeNull();
        const manifest = await supabase.from('submittal_round_revision_evidence').select('*').eq('submittal_id', parent.data!.id);
        const revisions = await supabase.from('drawing_revisions').select('*').eq('drawing_id', sheetId).eq('project_id', projectId);
        expect(manifest.error).toBeNull(); expect(revisions.error).toBeNull();
        expect(manifest.data).toHaveLength(1); expect(revisions.data).toHaveLength(1);
        const viewer = await signInAsViewerOrNull();
        expect(viewer, 'Viewer negative authorization fixture is required').not.toBeNull();
        const viewerRole = await viewer!.supabase.rpc('get_my_project_role', { p_project_id: projectId });
        expect(viewerRole.error).toBeNull(); expect(viewerRole.data).toBe('viewer');
        const visibleToViewer = await viewer!.supabase.from('drawings').select('id').eq('id', sheetId).eq('project_id', projectId).single();
        expect(visibleToViewer.error).toBeNull(); expect(visibleToViewer.data!.id).toBe(sheetId);
        const denied = await viewer!.supabase.from('drawings').update({ is_deleted: true, deleted_at: new Date().toISOString() })
          .eq('id', sheetId).select().single();
        expect(denied.error, 'A viewer must not delete the synthetic sheet').not.toBeNull();
        expect(['42501', 'PGRST116']).toContain(denied.error!.code);
        expect(denied.data).toBeNull();

        let writes = 0;
        let requests = 0;
        const violations: string[] = [];
        page.on('pageerror', () => violations.push('browser-runtime'));
        await page.context().routeWebSocket('**/*', socket => {
          const url = new URL(socket.url());
          if (url.origin !== STAGING_ORIGIN.replace('https:', 'wss:') || url.pathname !== '/realtime/v1/websocket') violations.push('forbidden-websocket');
          socket.close({ code: 1000, reason: 'Realtime disabled for explicit-read acceptance' });
        });
        await page.context().route('**/*', async route => {
          if (++requests > 1000) { violations.push('request-budget'); await route.abort(); return; }
          const request = route.request();
          const url = new URL(request.url());
          if (url.username || url.password || url.hash) { violations.push('invalid-url'); await route.abort(); return; }
          const forward = async () => {
            const reply = await route.fetch({ maxRedirects: 0, timeout: 15_000 }).catch(() => null);
            if (!reply) { violations.push('staging-forward-failed'); await route.abort(); return; }
            try {
              if (reply.status() >= 300 && reply.status() < 400) { violations.push('redirect'); await route.abort(); return; }
              await route.fulfill({ response: reply });
            } finally { await reply.dispose(); }
          };
          if (isLocalTelemetryDiscard(url.href, request.method())) { await route.fulfill({ status: 204 }); return; }
          const selectedSheet = url.origin === STAGING_ORIGIN && url.pathname === '/rest/v1/drawings'
            && url.searchParams.get('id') === `eq.${sheetId}`;
          if (selectedSheet && request.method() === 'OPTIONS') { await forward(); return; }
          if (selectedSheet && request.method() === 'PATCH') {
            writes++;
            const body = request.postDataJSON();
            const expectedDeleted = writes === 1;
            const allowed = writes <= 2 && body && Object.keys(body).every(key => ['is_deleted', 'deleted_at', 'updated_at'].includes(key))
              && body.is_deleted === expectedDeleted && typeof body.updated_at === 'string'
              && (expectedDeleted ? typeof body.deleted_at === 'string' && Number.isFinite(Date.parse(body.deleted_at)) : body.deleted_at === null);
            if (!allowed) { violations.push('unexpected-sheet-patch'); await route.abort(); return; }
            await forward(); return;
          }
          const app = url.origin === 'https://steelbuild-pro-staging.n-lortz1987.workers.dev';
          if (allowsStagingBrowserRequest(app ? `${APP_ORIGIN}${url.pathname}${url.search}` : url.href, request.method())) { await forward(); return; }
          violations.push('unexpected-route'); await route.abort();
        });
        await page.setViewportSize({ width, height: 900 });
        await page.goto('/DrawingSubmittalHub?hub_tab=drawings&hub_view=sheets');
        await expect.poll(() => page.evaluate(() => localStorage.getItem('activeProjectId'))).toBe(projectId);
        await page.getByPlaceholder('Filter sheet, title, discipline, set…', { exact: true }).fill(sheet.data!.sheet_number);
        const deletion = page.getByRole('button', { name: `Delete sheet ${sheet.data!.sheet_number}`, exact: true });
        const row = page.getByRole('row').filter({ has: deletion });
        await expect(row).toContainText('Package workflow: IFC');
        await expect(row).toContainText('Recorded sheet: Not Started');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Register scrolling must stay inside the page').toBe(true);
        await expect(page.getByRole('columnheader', { name: 'Status', exact: true })).toBeVisible();
        await deletion.click();
        const dialog = page.getByRole('alertdialog');
        await expect(dialog).toContainText('Its files, revision history and approval evidence are retained.');
        await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
        expect(writes).toBe(0);
        await expect(deletion).toBeVisible();
        await deletion.click();
        const patchResponse = () => page.waitForResponse(response => response.request().method() === 'PATCH'
          && new URL(response.url()).origin === STAGING_ORIGIN && new URL(response.url()).pathname === '/rest/v1/drawings');
        const removed = patchResponse();
        await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
        const removeResponse = await removed;
        expect(removeResponse.ok()).toBe(true);
        const removePayload = await removeResponse.json();
        expect(removePayload.id).toBe(sheetId); expect(removePayload.is_deleted).toBe(true);
        await expect(deletion).toHaveCount(0);
        const restored = patchResponse();
        await page.getByRole('button', { name: 'Undo', exact: true }).click();
        const restoreResponse = await restored;
        expect(restoreResponse.ok()).toBe(true);
        const restorePayload = await restoreResponse.json();
        expect(restorePayload.id).toBe(sheetId); expect(restorePayload.is_deleted).toBe(false);
        await expect(deletion).toBeVisible();
        await expect(row).toContainText('Package workflow: IFC');
        const afterManifest = await supabase.from('submittal_round_revision_evidence').select('*').eq('submittal_id', parent.data!.id);
        const afterRevisions = await supabase.from('drawing_revisions').select('*').eq('drawing_id', sheetId).eq('project_id', projectId);
        expect(afterManifest.error).toBeNull(); expect(afterRevisions.error).toBeNull();
        expect(afterManifest.data).toEqual(manifest.data); expect(afterRevisions.data).toEqual(revisions.data);
        expect(writes).toBe(2); expect(violations).toEqual([]);
        await info.attach('drawing-delete-summary', { contentType: 'application/json', body: JSON.stringify({
          width, sheetId, packageWorkflow: 'IFC', recordedSheet: 'Not Started', viewerDenied: true,
          cancelledWithoutWrite: true, softDeleteAcknowledged: true, undoAcknowledged: true,
          browserWrites: writes, revisionsAndApprovalEvidenceUnchanged: true,
        }) });
        await page.screenshot({ path: info.outputPath(`drawing-register-restored-${width}.png`), fullPage: true });
      });
    }
  });
}
