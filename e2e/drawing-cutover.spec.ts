import { test as base, expect } from '@playwright/test';
import { getDrawingRuntime } from '../scripts/drawing-cutover-staging.ts';
import { digest } from './drawing-cutover-setup.ts';
import { installDrawingBrowserGuard } from './drawingCutoverNetworkGuard.ts';
import { selectDrawingIntakeProject } from './drawingCutoverIntakeBindings.ts';

const test = base.extend<{ guardedContext: void }>({
  guardedContext: [async ({ context }, use) => {
    const guard = await installDrawingBrowserGuard(context, await getDrawingRuntime(), 'pm');
    await use();
    guard.assertNoRefusals();
  }, { auto: true }],
});

// Actual server requests only. Unimplemented matrix cases are absent, and the
// mandatory-case reporter therefore returns INCOMPLETE/nonzero, never acceptance.
test('drawing:preflight', async () => {
  const runtime = await getDrawingRuntime();
  const parents = await runtime.verifyParents(runtime.config.manifest.projects.map(p => p.id));
  expect(parents.length).toBe(4);
  const project = selectDrawingIntakeProject(runtime.config.manifest);
  const response = await runtime.request({ actor: 'pm', method: 'POST', path: '/rest/v1/rpc/get_drawing_command_capabilities', body: { p_project_id: project.id } });
  expect(response.status).toBe(200);
  const capabilities = await response.json() as Record<string, unknown>;
  expect(capabilities.contract_version === 1 && ['new_set', 'revision', 'write_boundary', 'source_protection', 'receipt_lookup'].every(k => capabilities[k] === true)).toBe(true);
});

test('drawing:protected-negative', async () => {
  const runtime = await getDrawingRuntime();
  const drawing = runtime.config.manifest.entities.find(e => e.table === 'drawings' && e.projectId === runtime.config.manifest.fab?.projectId);
  expect(Boolean(drawing)).toBe(true);
  // Complete exact-row readback stays in memory, never in evidence or assertion output.
  const path = `/rest/v1/drawings?id=eq.${drawing!.id}&select=*`;
  const before = await runtime.request({ actor: 'pm', method: 'GET', path });
  expect(before.status).toBe(200);
  const beforeRows: unknown = await before.json();
  expect(Array.isArray(beforeRows) && beforeRows.length === 1).toBe(true);
  expect(Array.isArray(beforeRows) && beforeRows[0].id === drawing!.id && beforeRows[0].project_id === drawing!.projectId).toBe(true);
  const snapshot = digest(JSON.stringify(beforeRows));
  for (const actor of ['viewer', 'field', 'foreign', 'removed', 'admin'] as const) {
    const countBefore = runtime.outcomes.filter(o => o.mutation).length;
    const response = await runtime.request({ actor, method: 'PATCH', path: `/rest/v1/drawings?id=eq.${drawing!.id}`, body: { revision_number: 'E2E DENY PROTECTED WRITE' }, representation: true });
    // A local refusal throws. It cannot satisfy this real server response assertion.
    const result: unknown = await response.json();
    const explicitDenial = [401, 403].includes(response.status);
    const zeroRowDenial = response.status === 200 && Array.isArray(result) && result.length === 0;
    expect(explicitDenial || zeroRowDenial).toBe(true);
    expect(runtime.outcomes.filter(o => o.mutation).length).toBe(countBefore + 1);
    const after = await runtime.request({ actor: 'pm', method: 'GET', path });
    expect(after.status).toBe(200);
    expect(digest(JSON.stringify(await after.json())) === snapshot).toBe(true);
  }
});
