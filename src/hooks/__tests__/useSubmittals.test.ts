import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ filterRound: vi.fn(), directCreate: vi.fn(), directUpdate: vi.fn(), directDelete: vi.fn(), workflow: vi.fn(), coverage: vi.fn(), rfis: vi.fn(), comments: vi.fn(), triggers: vi.fn(), audit: vi.fn() }));
vi.mock('@/api/supabaseClient', () => ({ entities: { SubmittalRound: { filter: mocks.filterRound, create: mocks.directCreate, update: mocks.directUpdate, delete: mocks.directDelete }, Submittal: { update: mocks.directUpdate }, SubmittalCommentDisposition: { filter: mocks.comments } } }));
vi.mock('@/api/client/submittalWorkflow', () => ({ applySubmittalWorkflow: mocks.workflow, getSubmittalRevisionCoverage: mocks.coverage }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: mocks.rfis } }));
vi.mock('@/lib/submittalSmartTriggers', () => ({ runSubmittalStatusTriggers: mocks.triggers }));
vi.mock('@/services/auditLogger', () => ({ logTransition: mocks.audit }));
import { addSubmittalRound, planRoundWrite, TERMINAL_APPROVED_STATUSES } from '../useSubmittals';
import { FabReleaseBlockedError } from '@/lib/fabRelease/releaseStatus';
const base = { id: 's', project_id: 'p', updated_at: '2026-10-09T00:00:00.000001Z', current_round_id: 'r', status: 'Draft', revision: 'A', submittal_type: 'Shop Drawing' };
const checklist = { comments_addressed: true, markups_incorporated: true, sheets_ready: true, authorized_to_issue: true };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.filterRound.mockResolvedValue([]); mocks.comments.mockResolvedValue([]);
  mocks.coverage.mockResolvedValue({ current_revision_ids: ['rev-a'] });
  mocks.workflow.mockImplementation(async ({ review, patch }) => ({ submittal: { ...review, ...patch }, round: { id: 'r' }, evidence: [] }));
  mocks.rfis.mockResolvedValue({ data: [], error: null });
});
describe('round planning display compatibility', () => {
  it('preserves terminal approved vocabulary', () => {
    expect([...TERMINAL_APPROVED_STATUSES]).toEqual(expect.arrayContaining(['Approved', 'Approved as Noted', 'Released for Fabrication']));
    expect(TERMINAL_APPROVED_STATUSES.has('Void')).toBe(false);
  });
  it('plans a new send, continues an open send and closes an existing cycle', () => {
    expect(planRoundWrite(null, 'Submitted')).toMatchObject({ action: 'insert', roundNumber: 1 });
    const open = { id: 'r', round_number: 2, submitted_date: '2026-10-01', returned_date: null };
    expect(planRoundWrite(open, 'Under Review')).toMatchObject({ action: 'update', roundId: 'r', setReturned: false });
    expect(planRoundWrite(open, 'Approved')).toMatchObject({ action: 'update', roundId: 'r', setReturned: true });
    expect(planRoundWrite({ ...open, returned_date: '2026-10-02' }, 'Submitted')).toMatchObject({ action: 'insert', roundNumber: 3 });
  });
});
describe('atomic reviewed submittal workflow', () => {
  it('sends the original review and exact revision roster to one atomic operation', async () => {
    const saved = await addSubmittalRound({ submittal: base, status: 'Submitted', ball_in_court: 'EOR', submitted_date: '2026-10-09' });
    expect(saved.status).toBe('Submitted');
    expect(mocks.workflow).toHaveBeenCalledWith(expect.objectContaining({ review: base, revisionIds: ['rev-a'], patch: expect.objectContaining({ status: 'Submitted', submitted_date: '2026-10-09' }) }));
    expect(mocks.directCreate).not.toHaveBeenCalled(); expect(mocks.directUpdate).not.toHaveBeenCalled(); expect(mocks.directDelete).not.toHaveBeenCalled();
  });
  it('uses a previously reviewed roster rather than silently fetching a newer roster', async () => {
    await addSubmittalRound({ submittal: base, status: 'Submitted', revisionIds: ['reviewed-old'], requestId: 'stable-retry' });
    expect(mocks.coverage).not.toHaveBeenCalled();
    expect(mocks.workflow).toHaveBeenCalledWith(expect.objectContaining({ revisionIds: ['reviewed-old'], requestId: 'stable-retry' }));
  });
  it('advances linked Product Data without requiring or transmitting a Shop Drawing manifest', async () => {
    await addSubmittalRound({ submittal: { ...base, submittal_type: 'Product Data', drawing_set_ids: ['set-1'] }, status: 'Submitted', revisionIds: ['drawing-rev'] });
    expect(mocks.coverage).not.toHaveBeenCalled();
    expect(mocks.workflow).toHaveBeenCalledWith(expect.objectContaining({ revisionIds: [] }));
  });
  it('fails closed if coverage cannot be read', async () => {
    mocks.coverage.mockRejectedValueOnce(new Error('Evidence unavailable'));
    await expect(addSubmittalRound({ submittal: base, status: 'Submitted' })).rejects.toThrow('Evidence unavailable');
    expect(mocks.workflow).not.toHaveBeenCalled();
  });
  it('preserves new-round intent but never invents round ids or counters', async () => {
    await addSubmittalRound({ submittal: base, status: 'Submitted', newRound: true, bumpRevision: true });
    const input = mocks.workflow.mock.calls[0][0];
    expect(input.newRound).toBe(true); expect(input.patch).not.toHaveProperty('current_round_id'); expect(input.patch).not.toHaveProperty('total_rounds'); expect(input.patch).not.toHaveProperty('round_number');
  });
  it('keeps dates and revision identical after a lost response even if the server round has advanced', async () => {
    const input = { submittal: { ...base, status: 'Revise and Resubmit' }, status: 'Submitted', ball_in_court: 'EOR', submitted_date: '2026-10-09', bumpTextRevision: true, revisionIds: ['rev-b'] };
    mocks.workflow.mockRejectedValueOnce(new Error('Network lost'));
    await expect(addSubmittalRound(input)).rejects.toThrow('Network lost');
    mocks.filterRound.mockResolvedValue([{ id: 'new-round', submitted_date: '2026-10-09', metadata: { revision: 'B' } }]);
    await addSubmittalRound(input);
    expect(mocks.workflow.mock.calls[1][0]).toEqual(mocks.workflow.mock.calls[0][0]);
    expect(mocks.filterRound).not.toHaveBeenCalled();
  });
  it('bumps text revision for a resubmission without changing preserved historical evidence', async () => {
    mocks.filterRound.mockResolvedValue([{ id: 'r', returned_date: '2026-10-08', metadata: { revision: 'A' } }]);
    await addSubmittalRound({ submittal: { ...base, status: 'Revise and Resubmit' }, status: 'Submitted', ball_in_court: 'EOR', submitted_date: '2026-10-09', bumpTextRevision: true });
    expect(mocks.workflow.mock.calls[0][0].patch.revision).toBe('B');
    expect(mocks.directUpdate).not.toHaveBeenCalled();
  });
  it.each([
    [{ status: 'Submitted', ball_in_court: 'EOR' }, /submission date/],
    [{ status: 'Submitted', submitted_date: '2026-10-09' }, /recipient/],
  ])('blocks incomplete R&R evidence (%j)', async (patch, error) => {
    await expect(addSubmittalRound({ submittal: { ...base, status: 'Revise and Resubmit' }, ...patch })).rejects.toThrow(error);
    expect(mocks.workflow).not.toHaveBeenCalled();
  });
  it('rejects the same revision being resubmitted after R&R', async () => {
    mocks.filterRound.mockResolvedValue([{ id: 'r', metadata: { revision: 'A' } }]);
    await expect(addSubmittalRound({ submittal: { ...base, status: 'Revise and Resubmit' }, status: 'Submitted', ball_in_court: 'EOR', submitted_date: '2026-10-09' })).rejects.toThrow(/next revision/);
  });
  it('requires the OFS checklist and resolved required comments before IFC', async () => {
    const input = { submittal: { ...base, status: 'Approved as Noted', ball_in_court: 'Detailer' }, status: 'Approved as Noted', ball_in_court: 'GC', nextStage: 'IFC' };
    await expect(addSubmittalRound(input)).rejects.toThrow(/OFS_IFC_BLOCKED/);
    await expect(addSubmittalRound({ ...input, ofsChecklist: checklist, commentDispositions: [{ id: 'c', status: 'Unreviewed', is_required: true }] })).rejects.toThrow(/COMMENT_DISPOSITION_BLOCKED/);
    await addSubmittalRound({ ...input, ofsChecklist: checklist, commentDispositions: [{ id: 'c', status: 'Complete', is_required: true }] });
    expect(mocks.workflow.mock.calls[0][0].patch.metadata).toMatchObject({ ofs_checklist: checklist, workflow_substatus: 'ifc_issued' });
  });
  it('does not let a status choice bypass OFS or the status graph', async () => {
    await expect(addSubmittalRound({ submittal: { ...base, status: 'Approved as Noted', ball_in_court: 'Detailer' }, status: 'Released for Fabrication' })).rejects.toThrow(/OFS_SKIP_BLOCKED/);
    await expect(addSubmittalRound({ submittal: base, status: 'Released for Fabrication' })).rejects.toThrow(/Cannot move/);
    expect(mocks.workflow).not.toHaveBeenCalled();
  });
  it('pre-blocks fabrication release when an open RFI exists', async () => {
    mocks.rfis.mockResolvedValueOnce({ data: [{ rfi_number: 'RFI-9' }], error: null });
    await expect(addSubmittalRound({ submittal: { ...base, status: 'Approved', ball_in_court: 'GC' }, status: 'Released for Fabrication' })).rejects.toBeInstanceOf(FabReleaseBlockedError);
    expect(mocks.workflow).not.toHaveBeenCalled();
  });
  it('passes the explicit trimmed fabrication exception to the server gate', async () => {
    await addSubmittalRound({ submittal: { ...base, status: 'Approved', ball_in_court: 'GC' }, status: 'Released for Fabrication', fabReleaseOverrideReason: '  Reviewed RFI-9 exception  ' });
    expect(mocks.rfis).not.toHaveBeenCalled();
    expect(mocks.workflow.mock.calls[0][0].patch).toMatchObject({ fab_release_override_reason: 'Reviewed RFI-9 exception', ball_in_court: null });
  });
  it('leaves rollback to the transaction on server rejection; no compensating client mutations', async () => {
    mocks.workflow.mockRejectedValueOnce(new Error('FAB_RELEASE_BLOCKED: open RFI-9'));
    await expect(addSubmittalRound({ submittal: { ...base, status: 'Approved', ball_in_court: 'GC' }, status: 'Released for Fabrication' })).rejects.toBeInstanceOf(FabReleaseBlockedError);
    expect(mocks.directCreate).not.toHaveBeenCalled(); expect(mocks.directUpdate).not.toHaveBeenCalled(); expect(mocks.directDelete).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled();
  });
  it('propagates an atomic failure without false completion side effects', async () => {
    mocks.workflow.mockRejectedValueOnce(new Error('permission denied'));
    await expect(addSubmittalRound({ submittal: { ...base, status: 'Under Review' }, status: 'Approved' })).rejects.toThrow('permission denied');
    expect(mocks.audit).not.toHaveBeenCalled(); expect(mocks.triggers).not.toHaveBeenCalled();
  });
});
