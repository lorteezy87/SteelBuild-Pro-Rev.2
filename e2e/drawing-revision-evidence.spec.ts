import { expect, type Page, type Response } from '@playwright/test';
import { acceptanceOptions, observeReadOnlyPage, visitRegister } from './acceptance';
import { test } from './drawing-evidence-test';

interface Coverage {
  submittal_id: string;
  submittal_status: string;
  round_id: string | null;
  ok: boolean;
  current_revision_ids: string[];
  captured_revision_ids: string[];
  missing_revision_ids: string[];
  stale_revision_ids: string[];
  missing_current_drawing_ids: string[];
  foreign_drawing_set_ids: string[];
  empty_drawing_set_ids: string[];
  evidence: unknown[];
}

function coverageRead(value: unknown): Coverage {
  if (!value || typeof value !== 'object') throw new Error('Missing revision coverage object');
  const row = value as Record<string, unknown>;
  if (typeof row.submittal_id !== 'string' || typeof row.submittal_status !== 'string'
    || typeof row.ok !== 'boolean' || !(row.round_id === null || typeof row.round_id === 'string')
    || !Array.isArray(row.evidence)) throw new Error('Invalid revision coverage identity');
  for (const key of ['current_revision_ids', 'captured_revision_ids', 'missing_revision_ids',
    'stale_revision_ids', 'missing_current_drawing_ids', 'foreign_drawing_set_ids', 'empty_drawing_set_ids']) {
    if (!Array.isArray(row[key]) || row[key].some(id => typeof id !== 'string' || !id)) {
      throw new Error('Invalid revision coverage roster');
    }
  }
  return row as unknown as Coverage;
}

/** Inspect real app reads only; no direct RPC invocation or credential output. */
function collectCoverage(page: Page, supabaseUrl: string) {
  const origin = new URL(supabaseUrl).origin;
  const batch = new Map<string, Coverage>();
  const single = new Map<string, Coverage>();
  const pending = new Set<Promise<void>>();
  const failures: string[] = [];
  const listener = (response: Response) => {
    const url = new URL(response.url());
    if (url.origin !== origin || response.request().method() !== 'POST'
      || !['/rest/v1/rpc/get_submittal_revision_coverage', '/rest/v1/rpc/get_submittal_revision_coverages'].includes(url.pathname)) return;
    const read = (async () => {
      try {
        if (!response.ok()) throw new Error('Coverage RPC failed');
        const body: unknown = await response.json();
        if (url.pathname.endsWith('/get_submittal_revision_coverages')) {
          if (!Array.isArray(body)) throw new Error('Invalid coverage batch');
          const requested = response.request().postDataJSON()?.p_submittal_ids as unknown;
          if (!Array.isArray(requested) || requested.length > 200 || requested.length !== body.length) throw new Error('Incomplete coverage batch');
          const records = body.map(coverageRead);
          if (new Set(records.map(row => row.submittal_id)).size !== requested.length
            || records.some(row => !requested.includes(row.submittal_id))) throw new Error('Mismatched coverage batch');
          for (const row of records) batch.set(row.submittal_id, row);
        } else {
          const row = coverageRead(body);
          if (row.submittal_id !== response.request().postDataJSON()?.p_submittal_id) throw new Error('Mismatched detail coverage');
          single.set(row.submittal_id, row);
        }
      } catch {
        // Payloads and transport errors can contain sensitive information.
        failures.push('A revision coverage response failed its acceptance contract');
      }
    })();
    pending.add(read);
    void read.finally(() => pending.delete(read));
  };
  page.on('response', listener);
  return { batch, single, async settle() {
    await Promise.all([...pending]);
    expect(failures, 'All observed revision evidence reads must be complete and valid').toEqual([]);
  } };
}

test.beforeAll(() => {
  expect(process.env.E2E_TARGET, 'This acceptance is staging-only').toBe('staging');
  expect(process.env.E2E_BASE_URL, 'Serve the exact candidate locally').toBe('http://127.0.0.1:4173');
  expect(process.env.E2E_EXPECTED_SUPABASE_REF).toBe('ndyfjffsulfbwpmwdmic');
});

test('drawing register, exact revision evidence and approval matrix agree', async ({ page }, testInfo) => {
  const submittalOptions = acceptanceOptions('submittals');
  const drawingOptions = acceptanceOptions('drawings');
  const coverage = collectCoverage(page, submittalOptions.supabaseUrl);
  const probe = await observeReadOnlyPage(page, submittalOptions.supabaseUrl, submittalOptions.projectId);
  await visitRegister(page, 'submittals', submittalOptions);
  const fixtureRows = probe.rows.get('submittals')?.filter(row => row.title === submittalOptions.fixtureText) || [];
  expect(fixtureRows.length, 'The existing Shop Drawing fixture must be unambiguous').toBe(1);
  const submittal = fixtureRows[0];
  expect(submittal.submittal_type, 'Never infer Shop Drawing authority from a legacy NULL type').toBe('Shop Drawing');
  const submittalId = String(submittal.id);
  await expect.poll(() => coverage.batch.has(submittalId), { message: 'Register must load authoritative revision coverage' }).toBe(true);
  await coverage.settle();
  const list = page.getByRole('region', { name: 'Submittal register list', exact: true });
  await list.getByRole('button', { name: /^Open submittal / })
    .filter({ has: page.getByText(submittalOptions.fixtureText!, { exact: true }) }).click();

  const details = page.getByRole('region', { name: 'Submittal details', exact: true });
  const panel = details.getByRole('region', { name: 'Exact revision evidence', exact: true });
  await expect(panel).toBeVisible();
  await expect.poll(() => coverage.single.has(submittalId), { message: 'Detail must load its own exact revision evidence' }).toBe(true);
  await probe.settle();
  await coverage.settle();
  const detailCoverage = coverage.single.get(submittalId)!;
  const batchCoverage = coverage.batch.get(submittalId)!;
  expect(detailCoverage.submittal_status).toBe(submittal.status);
  expect(detailCoverage.round_id).toBe(submittal.current_round_id ?? null);
  expect(detailCoverage.ok).toBe(batchCoverage.ok);
  expect([...detailCoverage.current_revision_ids].sort()).toEqual([...batchCoverage.current_revision_ids].sort());
  await expect(panel.getByText(`${detailCoverage.captured_revision_ids.length} captured · ${detailCoverage.current_revision_ids.length} current · ${detailCoverage.missing_revision_ids.length} missing · ${detailCoverage.stale_revision_ids.length} superseded`, { exact: true })).toBeVisible();
  if (detailCoverage.ok) {
    expect(detailCoverage.round_id).toBeTruthy();
    expect(detailCoverage.current_revision_ids.length).toBeGreaterThan(0);
    expect([...detailCoverage.current_revision_ids].sort()).toEqual([...detailCoverage.captured_revision_ids].sort());
    expect([...detailCoverage.missing_revision_ids, ...detailCoverage.stale_revision_ids,
      ...detailCoverage.missing_current_drawing_ids, ...detailCoverage.foreign_drawing_set_ids,
      ...detailCoverage.empty_drawing_set_ids]).toEqual([]);
    await expect(panel.getByText('Exact revision evidence verified', { exact: true })).toBeVisible();
  } else {
    await expect(panel.getByText('Exact revision evidence verified', { exact: true })).toHaveCount(0);
    const attest = panel.getByRole('button', { name: 'Attest reviewed evidence', exact: true });
    if (await attest.count()) await expect(attest).toBeDisabled();
  }
  await panel.screenshot({ path: testInfo.outputPath('revision-evidence.png') });
  probe.assertHealthy();

  await visitRegister(page, 'drawings', drawingOptions);
  const sets = probe.rows.get('drawing_sets')?.filter(row => row.set_name === drawingOptions.fixtureText) || [];
  expect(sets.length, 'The drawing set fixture must be unambiguous').toBe(1);
  expect(submittal.drawing_set_ids, 'The selected fixtures must describe the same review package').toContain(sets[0].id);
  await page.getByRole('main', { name: 'Main content', exact: true })
    .screenshot({ path: testInfo.outputPath('drawing-register.png') });
  await page.goto('/DrawingSubmittalHub?hub_tab=matrix');
  const matrix = page.getByRole('table', { name: 'Approval matrix', exact: true });
  await expect(matrix).toBeVisible();
  const row = matrix.getByRole('row').filter({ has: page.getByRole('button', { name: drawingOptions.fixtureText!, exact: true }) });
  await expect(row).toBeVisible();
  await expect(row.getByRole('link', { name: String(submittal.submittal_number), exact: true })).toBeVisible();
  if (submittal.status === 'Draft') {
    await expect(row.getByText('Draft', { exact: true })).toBeVisible();
    await expect(row.getByText('IFA', { exact: true })).toBeVisible();
    await expect(row.getByText(/^(Approved|Approved as Noted|Released for Fabrication|IFC|Released)$/i)).toHaveCount(0);
    expect(detailCoverage.ok, 'A Draft without reviewed submission cannot be release evidence').toBe(false);
  } else if (!detailCoverage.ok && (submittal.status === 'Released for Fabrication'
    || (['Approved', 'Approved as Noted'].includes(String(submittal.status)) && ['GC', 'Owner'].includes(String(submittal.ball_in_court))))) {
    await expect(row.getByText('Revision evidence required', { exact: true })).toBeVisible();
  }
  const disclosure = row.getByRole('button', { name: drawingOptions.fixtureText!, exact: true });
  await disclosure.click();
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
  await probe.settle();
  await coverage.settle();
  probe.assertHealthy();
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await page.getByRole('main', { name: 'Main content', exact: true })
    .screenshot({ path: testInfo.outputPath('approval-matrix.png') });
});

test('legacy untyped approval is excluded from drawing authority', async ({ page }, testInfo) => {
  const options = { ...acceptanceOptions('submittals'), fixtureText: 'Staging erection drawings' };
  const coverage = collectCoverage(page, options.supabaseUrl);
  const probe = await observeReadOnlyPage(page, options.supabaseUrl, options.projectId);
  await visitRegister(page, 'submittals', options);
  const rows = probe.rows.get('submittals')?.filter(row => row.title === options.fixtureText) || [];
  expect(rows).toHaveLength(1);
  const legacy = rows[0];
  expect(legacy.submittal_type).toBeNull();
  expect(legacy.status).toBe('Approved');
  const list = page.getByRole('region', { name: 'Submittal register list', exact: true });
  await list.getByRole('button', { name: /^Open submittal / })
    .filter({ has: page.getByText(options.fixtureText, { exact: true }) }).click();
  const details = page.getByRole('region', { name: 'Submittal details', exact: true });
  await expect(details.getByText(/This legacy record has no submittal type and cannot govern drawing approval/)).toBeVisible();
  await expect(details.getByRole('region', { name: 'Exact revision evidence', exact: true })).toHaveCount(0);
  await details.screenshot({ path: testInfo.outputPath('legacy-unclassified.png') });

  await page.goto('/DrawingSubmittalHub?hub_tab=matrix');
  const matrix = page.getByRole('table', { name: 'Approval matrix', exact: true });
  await expect(matrix).toBeVisible();
  const row = matrix.getByRole('row').filter({ has: page.getByRole('button', { name: 'STG Erection Drawings', exact: true }) });
  await expect(row).toBeVisible();
  await expect(row.getByRole('link', { name: String(legacy.submittal_number), exact: true })).toHaveCount(0);
  await expect(row.getByText('Approved', { exact: true })).toHaveCount(0);
  await expect(row.getByText('from sheets', { exact: true })).toBeVisible();
  await expect(row.getByRole('link', { name: 'Create submittal for STG Erection Drawings', exact: true })
    .or(row.getByText('No submittal', { exact: true }))).toBeVisible();
  await probe.settle();
  await coverage.settle();
  expect(coverage.batch.has(String(legacy.id))).toBe(false);
  expect(coverage.single.has(String(legacy.id))).toBe(false);
  probe.assertHealthy();
  await row.screenshot({ path: testInfo.outputPath('legacy-no-governing-submittal.png') });
});
