// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { loadDrawingCommands } from '@/lib/drawingCommands/journal';
import { createTestDrawingLocks, deferred, owner, resultFixture } from '@/lib/drawingCommands/__tests__/fixtures';
import { setActiveOrgId } from '@/lib/activeOrg';

const m = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), drawings: vi.fn(), revisions: vi.fn(), getSet: vi.fn(),
  upload: vi.fn(), extract: vi.fn(), count: vi.fn(), invalidate: vi.fn(), legacy: vi.fn(), complete: vi.fn(), sourceToken: 'a'.repeat(64) }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: m.rpc, auth: { getUser: m.getUser, onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } } }));
vi.mock('@/api/supabaseClient', () => ({ entities: {
  Drawing: { filterAll: m.drawings, create: m.legacy, update: m.legacy },
  DrawingSet: { get: m.getSet, update: m.legacy },
  DrawingRevision: { filterAll: m.revisions, create: m.legacy, update: m.legacy },
} }));
vi.mock('@/lib/drawingHub', () => ({ createNewRevisionAndCarryZones: m.legacy, ensureCurrentRevision: m.legacy }));
vi.mock('@/api/client/uploads', () => ({ UploadDrawingFile: m.upload }));
vi.mock('@/services/cacheRegistry', () => ({ invalidateEntities: m.invalidate }));
vi.mock('@/lib/docControl/pdfPageCount', () => ({ readPdfPageCount: m.count }));
vi.mock('@/components/shared/OrgContext', () => ({ useOptionalOrg: () => ({ currentOrg: { id: '22222222-2222-4222-8222-222222222222' } }) }));
vi.mock('@/lib/AuthContext', async () => {
  const React = await import('react');
  const user = { id: '66666666-6666-4666-8666-666666666666', full_name: 'Reviewer' };
  return { AuthContext: React.createContext({ user }), useAuth: () => ({ user }) };
});
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../revisionUploadHelpers', async (original) => ({ ...await original<typeof import('../revisionUploadHelpers')>(), extractRevisionSheets: m.extract }));
import RevisionUploadModalComponent from '../RevisionUploadModal';
import type { ComponentType } from 'react';
import type { RevisionUploadHandoffProps } from '../revisionUploadHandoff';
import type { ReviseSetRequest } from '@/lib/drawingCommands/types';
import { buildReviewedRevisionPayload } from '../revisionUploadHandoff';
const RevisionUploadModal = RevisionUploadModalComponent as unknown as ComponentType<RevisionUploadHandoffProps>;

const sourcePath = `${owner.orgId}/uploads/${owner.projectId}/review.pdf`;
const setId = '33333333-3333-4333-8333-333333333333';
const drawingId = '44444444-4444-4444-8444-444444444444';
const revisionId = '55555555-5555-4555-8555-555555555555';
const stamp = '2026-10-15T12:00:00Z';
const set = { id: setId, project_id: owner.projectId, set_name: 'SHOP', revision: 'A', updated_at: stamp };
const oldSheet = { id: drawingId, project_id: owner.projectId, drawing_set_id: setId, sheet_number: 'S1', title: 'Framing', updated_at: stamp, revision_number: 'A', stage: 'For Approval', file_url: 'original.pdf', pdf_page: 1, extracted_text: 'Original evidence', callouts: [{ text: 'W12' }] };
const incoming = { sheetNumber: 'S1', sheetTitle: 'Revised framing', revision: 'B', pdfPage: 1, extractedText: 'new page 1', callouts: [{ text: 'W14' }] };
const flags = { contract_version: 1, new_set: true, revision: true, write_boundary: true, source_protection: true, receipt_lookup: true };
const createNewRevisionAndCarryZones = m.legacy;
let committed = false;
let lostResponse = false;
let rejection = '';
let received: { p_request_id: string; p_request: ReviseSetRequest } | null = null;
function result(id: string) { return { ...resultFixture(id), operation: 'revise_set', added: 0, revised: 1, source_pages: [{ drawing_id: drawingId, revision_id: '88888888-8888-4888-8888-888888888888', file_path: sourcePath, pdf_page: 1 }] }; }
beforeEach(() => {
  vi.resetAllMocks(); committed = false; lostResponse = false; rejection = ''; received = null; m.sourceToken = 'a'.repeat(64);
  vi.stubGlobal('indexedDB', new IDBFactory()); Object.defineProperty(navigator, 'locks', { configurable: true, value: createTestDrawingLocks() });
  setActiveOrgId(owner.orgId);
  m.getUser.mockResolvedValue({ data: { user: { id: owner.actorId } }, error: null });
  m.getSet.mockResolvedValue(set); m.drawings.mockResolvedValue([oldSheet]);
  m.revisions.mockResolvedValue([{ id: revisionId, drawing_id: drawingId, project_id: owner.projectId, is_current: true, archived_at: null }]);
  m.upload.mockResolvedValue({ path: sourcePath }); m.count.mockResolvedValue(2);
  m.extract.mockResolvedValue([incoming]); m.invalidate.mockResolvedValue(undefined);
  m.rpc.mockImplementation(async (name: string, args: { p_request_id: string; p_request: ReviseSetRequest }) => {
    if (name === 'get_drawing_command_capabilities') return { data: flags, error: null };
    if (name === 'get_drawing_revision_sources') return { data: [{ path: sourcePath, token: m.sourceToken }], error: null };
    if (name === 'get_drawing_command_receipt') return { data: committed ? { state: 'committed', result: result(args.p_request_id) } : { state: 'not_committed' }, error: null };
    received = args;
    if (rejection) return { data: null, error: { code: '22023', message: rejection } };
    committed = true;
    if (lostResponse) throw new Error('response lost');
    return { data: result(args.p_request_id), error: null };
  });
});
function mount(issueDate = '2026-10-15', usePreflight = true, selectedSet = set) {
  const file = new File(['%PDF'], 'review.pdf', { type: 'application/pdf' });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = (open: boolean) => <QueryClientProvider client={client}>
    <RevisionUploadModal open={open} onClose={() => {}} onComplete={m.complete} activeProject={{ id: owner.projectId }} preSelectedSet={selectedSet} drawingSets={[selectedSet]}
      initialPdfFile={file} initialReview={usePreflight ? { sheets: [incoming], pageCount: 2, revisionLabel: 'B', issueDate, scanned: false, setMeta: null, sourcePages: { S1: 1 }, issuedBy: '' } : null} />
  </QueryClientProvider>;
  const ui = render(view(true));
  return { ...ui, setOpen: (open: boolean) => ui.rerender(view(open)) };
}
async function review() {
  fireEvent.click(screen.getByRole('button', { name: /Upload PDF/ }));
  fireEvent.click(screen.getByRole('button', { name: /Extract|Compare/ }));
  await screen.findByRole('button', { name: /Apply Revision/ });
}
async function apply() {
  fireEvent.click(screen.getByLabelText(/I reviewed S1/));
  fireEvent.click(screen.getByRole('button', { name: /Apply Revision/ }));
}
it('applies the complete frozen reviewed roster and renders receipt counts and source pages', async () => {
  mount(); await review(); m.getSet.mockResolvedValue({ ...set, updated_at: '2026-10-16T12:00:00Z' });
  await apply(); expect(await screen.findByText('Revision Applied')).toBeTruthy();
  expect(received?.p_request).toMatchObject({ expected_set_updated_at: stamp, issued_date: '2026-10-15', sheets: [{ expected_updated_at: stamp, expected_revision_id: revisionId }] });
  expect(screen.getByText(/1 drawing records updated/)).toBeTruthy(); expect(screen.getByText(/PDF page 1/)).toBeTruthy();
  expect(m.legacy).not.toHaveBeenCalled(); expect(await loadDrawingCommands(owner)).toEqual([]);
});
it('historyFailureLeavesOriginalSources', async () => {
  const before = { evidence: structuredClone(oldSheet) }; rejection = 'DRAWING_REVISION_EXTRACTION: history failure';
  mount(); await review(); await apply(); expect(await screen.findByText(/zero sheets committed/i)).toBeTruthy();
  const after = { evidence: oldSheet }; expect(after.evidence).toEqual(before.evidence); expect(createNewRevisionAndCarryZones).not.toHaveBeenCalled();
});
it('changedStorageSnapshotRejects', async () => {
  mount(); await review(); m.sourceToken = 'b'.repeat(64); await apply();
  expect(await screen.findByText(/source identity.*changed/i)).toBeTruthy(); expect(received).toBeNull();
});
it('missingRosterIsNotRemoval', async () => {
  m.drawings.mockResolvedValue([oldSheet, { ...oldSheet, id: owner.actorId, sheet_number: 'S2' }]);
  mount(); await review(); await apply(); await waitFor(() => expect(received).not.toBeNull());
  expect(received?.p_request.sheets).toContainEqual({ action: 'same', drawing_id: owner.actorId, sheet_number: 'S2', expected_updated_at: stamp, expected_revision_id: null });
});
it('incompleteLegacyTrackingStaysHeld', async () => {
  m.revisions.mockResolvedValue([]); mount(); await review(); await apply();
  expect(await screen.findByText(/tracking.*required/i)).toBeTruthy(); expect(received).toBeNull(); expect(m.legacy).not.toHaveBeenCalled();
});
it('pageChangeDropsOldExtraction and requires fresh manual review', async () => {
  mount(); await review(); fireEvent.click(screen.getByLabelText(/I reviewed S1/));
  fireEvent.change(screen.getByLabelText('PDF page for S1'), { target: { value: '2' } });
  expect((screen.getByLabelText(/I reviewed S1/) as HTMLInputElement).checked).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: /Apply Revision/ }));
  expect(received).toBeNull(); await apply(); await waitFor(() => expect(received).not.toBeNull());
  expect(received?.p_request.sheets[0]).toMatchObject({ pdf_page: 2, extraction: { text: { state: 'unavailable' }, callouts: { state: 'unavailable' } } });
  expect(received?.p_request.source_objects).toEqual([{ path: sourcePath, token: 'a'.repeat(64) }]);
});
it('responseLostAfterCommitDoesNotCloneAgain', async () => {
  lostResponse = true; mount(); await review(); await apply(); expect(await screen.findByText(/may have committed/i)).toBeTruthy();
  expect(await loadDrawingCommands(owner)).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: /Reconcile saved receipt/i }));
  expect(await screen.findByText('Revision Applied')).toBeTruthy();
  expect(m.rpc.mock.calls.filter(([name]) => name === 'apply_drawing_set_revision')).toHaveLength(1); expect(m.legacy).not.toHaveBeenCalled();
});
it('unknown date stays blank and is held until a reviewed actual issue date is entered', async () => {
  mount(''); expect((screen.getByLabelText('Issue Date *') as HTMLInputElement).value).toBe('');
  await review(); await apply(); expect(await screen.findByText(/actual revision issue date/i)).toBeTruthy(); expect(received).toBeNull();
});
it('does not automatically choose an unreviewed revision label or offer unsupported reference disposition', () => {
  mount('', false);
  expect((screen.getByPlaceholderText('e.g. IFC Rev 1') as HTMLInputElement).value).toBe('');
  expect(screen.queryByText('Keep as Reference Only')).toBeNull();
});
it('failed complete roster loading cannot present an incomplete comparison', async () => {
  m.drawings.mockRejectedValue(new Error('page failed')); mount();
  fireEvent.click(screen.getByRole('button', { name: /Upload PDF/ })); fireEvent.click(screen.getByRole('button', { name: /Extract|Compare/ }));
  expect(await screen.findByText(/complete.*roster|complete.*sheets/i)).toBeTruthy(); expect(screen.queryByRole('button', { name: /Apply Revision/ })).toBeNull();
});
it('known committed receipt truth survives failed follow-up and pending reconciliation', async () => {
  m.invalidate.mockRejectedValue(new Error('cache failed')); mount(); await review(); await apply();
  expect(await screen.findByText('Revision Applied')).toBeTruthy();
  m.rpc.mockImplementation(async () => ({ data: { state: 'pending' }, error: null }));
  fireEvent.click(screen.getByRole('button', { name: /Reconcile saved receipt/i }));
  await screen.findByText(/follow-up.*incomplete/i);
  expect(screen.getByText('Revision Applied')).toBeTruthy(); expect(screen.getByText(/1 drawing records updated/)).toBeTruthy();
  expect(screen.queryByText(/may have committed/i)).toBeNull(); expect(await loadDrawingCommands(owner)).toHaveLength(1);
});
it('closing during source verification prevents preparation or late completion', async () => {
  const late = deferred<{ data: { path: string; token: string }[]; error: null }>();
  const ui = mount(); await review(); m.rpc.mockReturnValue(late.promise); await apply(); ui.unmount();
  await act(async () => late.resolve({ data: [{ path: sourcePath, token: 'a'.repeat(64) }], error: null }));
  expect(await loadDrawingCommands(owner)).toEqual([]); expect(m.complete).not.toHaveBeenCalled();
});
it('AI outage uses physical bounds and explicit manual values without inventing extraction', async () => {
  m.extract.mockRejectedValue(new Error('AI unavailable')); mount('', false);
  fireEvent.change(screen.getByLabelText('New Revision Label *'), { target: { value: 'B' } });
  fireEvent.change(screen.getByLabelText('Issue Date *'), { target: { value: '2026-10-15' } });
  await review();
  expect(m.count).toHaveBeenCalledOnce();
  expect((screen.getByLabelText('PDF page for manual sheet') as HTMLInputElement).value).toBe('');
  expect((screen.getByLabelText('Revision code for manual sheet') as HTMLInputElement).value).toBe('');
  fireEvent.change(screen.getByLabelText('Sheet number for manual sheet'), { target: { value: 'S1' } });
  fireEvent.change(screen.getByLabelText('Title for S1'), { target: { value: 'Human framing' } });
  fireEvent.change(screen.getByLabelText('Revision code for S1'), { target: { value: 'B' } });
  fireEvent.change(screen.getByLabelText('PDF page for S1'), { target: { value: '2' } });
  await apply(); await waitFor(() => expect(received).not.toBeNull());
  expect(received?.p_request.sheets[0]).toMatchObject({ sheet_title: 'Human framing', pdf_page: 2, revision_code: 'B', extraction: { text: { state: 'unavailable' }, callouts: { state: 'unavailable' } } });
});
it('a missing roster entry cannot become an implicit removal', () => {
  expect(() => buildReviewedRevisionPayload({ projectId: owner.projectId,
    roster: { set, sheets: [{ ...oldSheet, expected_revision_id: revisionId }, { ...oldSheet, id: owner.actorId, sheet_number: 'S2', expected_revision_id: null }] },
    matches: [{ change: 'revised', oldSheet, newSheet: { ...incoming, reviewed: true, sourceFileUrl: sourcePath, sourceSnapshot: { path: sourcePath, token: 'a'.repeat(64) } } }],
    removeUnlisted: true, revisionLabel: 'B', issueDate: '2026-10-15', issuedBy: '', notes: '', sources: [{ path: sourcePath, token: 'a'.repeat(64) }], sourcePages: { [sourcePath]: 2 },
  })).toThrow(/missing sheets are not removals/);
});
it('closed standalone modal without Auth or Org does not dispatch', async () => {
  render(<QueryClientProvider client={new QueryClient()}><RevisionUploadModal open={false} onClose={() => {}} activeProject={{ id: owner.projectId }} /></QueryClientProvider>);
  await act(async () => {}); expect(m.rpc).not.toHaveBeenCalled();
});
it('late roster read after close cannot overwrite a reopened review', async () => {
  const late = deferred<typeof set>(); m.getSet.mockReturnValue(late.promise);
  const ui = mount(); fireEvent.click(screen.getByRole('button', { name: /Upload PDF/ }));
  fireEvent.click(screen.getByRole('button', { name: /Extract|Compare/ }));
  await waitFor(() => expect(m.getSet).toHaveBeenCalledOnce()); ui.setOpen(false);
  await act(async () => late.resolve(set)); ui.setOpen(true);
  expect(screen.queryByText(/Could not load the complete/i)).toBeNull();
  expect(screen.queryByRole('button', { name: /Apply Revision/ })).toBeNull();
});
it('a consumer closing on completion does not leave a committed journal stuck', async () => {
  const ui = mount(); m.complete.mockImplementation(() => ui.setOpen(false));
  await review(); await apply();
  await waitFor(() => expect(committed).toBe(true));
  await waitFor(async () => expect(await loadDrawingCommands(owner)).toEqual([]));
  expect(m.complete).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'View Drawing Log' }));
  await waitFor(() => expect(m.complete).toHaveBeenCalledOnce());
  expect(m.complete).toHaveBeenCalledWith({ complete: true, failed: 0, historyFailed: 0, setId, setName: 'SHOP', revisionLabel: 'B' });
  ui.setOpen(true);
  expect(screen.getByRole('button', { name: /Upload PDF/ })).toBeTruthy();
});
it('parent callback failure after acknowledgement never replays a drawing command', async () => {
  m.complete.mockRejectedValue(new Error('navigation failed')); mount(); await review(); await apply();
  await screen.findByText('Revision Applied');
  await waitFor(() => expect((screen.getByRole('button', { name: 'View Drawing Log' }) as HTMLButtonElement).disabled).toBe(false));
  await waitFor(async () => expect(await loadDrawingCommands(owner)).toEqual([]));
  fireEvent.click(screen.getByRole('button', { name: 'View Drawing Log' }));
  expect(await screen.findByText(/parent screen could not finish/i)).toBeTruthy();
  expect(screen.getByText('Revision Applied')).toBeTruthy();
  expect(m.rpc.mock.calls.filter(([name]) => name === 'apply_drawing_set_revision')).toHaveLength(1);
  expect(await loadDrawingCommands(owner)).toEqual([]);
});
it('recovering saved set A while set B is selected never completes package B', async () => {
  lostResponse = true; const ui = mount(); await review(); await apply();
  await screen.findByText(/may have committed/i); ui.unmount();
  mount('2026-10-15', true, { ...set, id: owner.orgId, set_name: 'Other package' });
  fireEvent.click(await screen.findByRole('button', { name: 'Reconcile saved receipt' }));
  expect(await screen.findByText(/receipt belongs to a different set/i)).toBeTruthy();
  await waitFor(() => expect((screen.getByRole('button', { name: 'View Drawing Log' }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'View Drawing Log' }));
  expect(m.complete).not.toHaveBeenCalled(); expect(await loadDrawingCommands(owner)).toEqual([]);
});
