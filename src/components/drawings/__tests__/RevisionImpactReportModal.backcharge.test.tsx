// @vitest-environment jsdom
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { setActiveOrgId } from '@/lib/activeOrg';

const mocks = vi.hoisted(() => ({ create: vi.fn(), error: vi.fn(), submit: null as null | ((form: Record<string, unknown>) => Promise<void>) }));
vi.mock('@/api/supabaseClient', () => ({ entities: { DrawingRevision: { filter: async (): Promise<Record<string, unknown>[]> => [] } } }));
vi.mock('@/components/shared/useAppSecurity', () => ({ useAppSecurity: () => ({ user: { id: 'pm' } }) }));
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: React.PropsWithChildren<{ open: boolean }>) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogHeader: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogTitle: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock('@/lib/backcharge/repository', () => ({ createBackcharge: (...args: unknown[]) => mocks.create(...args), listBackcharges: async (): Promise<Record<string, unknown>[]> => [] }));
vi.mock('@/lib/pdfRasterize', () => ({ rasterizePageToPngBase64: vi.fn() }));
vi.mock('@/lib/exports/revisionImpactPDF', () => ({ downloadRevisionImpactPdf: vi.fn() }));
vi.mock('@/lib/rfiFromDelta', () => ({ buildRfiPrefillFromDelta: vi.fn(), createRfiAndLink: vi.fn() }));
vi.mock('@/components/rfis/RFIFormModal', () => ({ default: (): null => null }));
vi.mock('@/lib/revisionPackageReport', () => ({
  selectChangedSheets: () => [{ sheetNumber: 'S1', drawing: { id: 'drawing-1' }, downstream: 'fabricated', renderable: true, fromRevisionId: 'r1', toRevisionId: 'r2' }],
  summarizePackageReport: () => ({ totalDeltas: 1, sheetsDiffed: 1, sheetsChanged: 1, downstreamExposure: 1, bySeverity: { high: 1 } }),
}));
vi.mock('@/lib/revisionSnapshotDiff', () => ({
  generateRevisionDiff: vi.fn(), setDeltaDismissed: vi.fn(), sortDeltasBySeverity: (deltas: unknown) => deltas,
  loadComparisonWithDeltas: async () => ({ comparison: { compare_status: 'complete' }, deltas: [{ id: 'delta-1', severity: 'high', description: 'Connection changed' }] }),
}));
vi.mock('@/components/drawings/RevisionDeltaCard', () => ({ default: (): null => null, SEV_COLOR: {} }));
vi.mock('@/pages/Backcharges', () => ({ BackchargeFormModal: ({ onSubmit, busy, recoveryPending }: { onSubmit: (form: Record<string, unknown>) => Promise<void>; busy: boolean; recoveryPending: boolean }) => {
  mocks.submit = onSubmit;
  return <><button disabled={busy} onClick={() => onSubmit({ title: 'Original rework', amount: 125, metadata: { original: true } })}>Save backcharge</button>
    <button disabled={busy} onClick={() => onSubmit({ title: 'Changed rework', amount: 999 })}>Retry changed draft</button>
    {recoveryPending && <p>Recover original backcharge</p>}</>;
} }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: (...args: unknown[]) => mocks.error(...args) } }));
import RevisionImpactReportModal from '../RevisionImpactReportModal';

beforeEach(() => { setActiveOrgId('org-a'); mocks.create.mockReset().mockResolvedValue({ id: 'bc-1' }); mocks.error.mockReset(); });
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const tree = (projectId = 'p1') => <QueryClientProvider client={client}><RevisionImpactReportModal open projectId={projectId} set={{ setId: 'set-1', name: 'Steel' }} onClose={vi.fn()} /></QueryClientProvider>;
  return { ...render(tree()), tree };
}
async function openDraft() {
  fireEvent.click(await screen.findByRole('button', { name: /Run report/ }));
  fireEvent.click(await screen.findByRole('button', { name: /Log backcharge/ }));
}
it('passes retained operation and exact revision metadata through ambiguous retries', async () => {
  mocks.create.mockRejectedValueOnce(Object.assign(new Error('Reply lost'), { outcomeUnknown: true }));
  mount(); await openDraft();
  fireEvent.click(screen.getByRole('button', { name: 'Save backcharge' }));
  await waitFor(() => expect(mocks.error).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: 'Retry changed draft' }));
  await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
  expect(mocks.create.mock.calls[0][1]?.clientOperationId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(mocks.create.mock.calls[1]).toEqual(mocks.create.mock.calls[0]);
  expect(mocks.create.mock.calls[0][0].metadata).toMatchObject({ original: true, source_type: 'revision_delta', source_delta_id: 'delta-1', sheet_number: 'S1' });
});
it('rejects a saved callback after the report project changes', async () => {
  const mounted = mount(); await openDraft(); const stale = mocks.submit!;
  mounted.rerender(mounted.tree('p2'));
  await act(async () => { await stale({ title: 'Stale rework', amount: 125 }); });
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.error).toHaveBeenCalledWith(expect.stringMatching(/project changed/i));
});
