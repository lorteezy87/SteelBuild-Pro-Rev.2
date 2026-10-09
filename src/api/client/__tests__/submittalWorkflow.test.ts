import { beforeEach, describe, expect, it, vi } from 'vitest';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }));
import { applySubmittalWorkflow, validateSubmittalCreate, type SubmittalReview, type WorkflowResult } from '../submittalWorkflow';
import { setActiveOrgId } from '@/lib/activeOrg';
const review: SubmittalReview = { id: 'sub-1', updated_at: '2026-10-09T00:00:00.000001Z', status: 'Draft', current_round_id: null, submittal_type: 'Shop Drawing' };
const result: WorkflowResult = { submittal: { ...review, status: 'Submitted' }, round: { id: 'round-1' }, evidence: [] };
beforeEach(() => { rpc.mockReset(); setActiveOrgId('org-1'); rpc.mockResolvedValue({ data: result, error: null }); });
describe('atomic submittal client', () => {
  it('commits a reviewed transition through one RPC, with microsecond expectations and exact revisions', async () => {
    expect(await applySubmittalWorkflow({ review, revisionIds: ['rev-b', 'rev-a'], patch: { status: 'Submitted' } })).toEqual(result);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith('apply_submittal_round_workflow', expect.objectContaining({ p_submittal_id: 'sub-1', p_expected_updated_at: review.updated_at, p_expected_status: 'Draft', p_expected_current_round_id: null, p_expected_revision_ids: ['rev-a', 'rev-b'], p_patch: { status: 'Submitted' }, p_new_round: false }));
  });
  it('recovers a lost response with the same identity and changes identity when the reviewed revision changes', async () => {
    rpc.mockRejectedValueOnce(new Error('Network lost'));
    const input = { review, revisionIds: ['rev-a'], patch: { status: 'Submitted' } };
    await expect(applySubmittalWorkflow(input)).rejects.toMatchObject({ outcomeUnknown: true });
    await applySubmittalWorkflow({ ...input, patch: { status: 'Submitted' } });
    expect(rpc.mock.calls[0][1].p_request_id).toBe(rpc.mock.calls[1][1].p_request_id);
    await applySubmittalWorkflow({ ...input, revisionIds: ['rev-b'] });
    expect(rpc.mock.calls[2][1].p_request_id).not.toBe(rpc.mock.calls[1][1].p_request_id);
  });
  it('never treats a rejection or malformed result as success', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '40001', message: 'Review changed' } });
    await expect(applySubmittalWorkflow({ review, revisionIds: ['rev-a'], patch: { status: 'Approved' } })).rejects.toMatchObject({ outcomeUnknown: false });
    rpc.mockResolvedValueOnce({ data: {}, error: null });
    await expect(applySubmittalWorkflow({ review, revisionIds: ['rev-a'], patch: { status: 'Approved' } })).rejects.toMatchObject({ outcomeUnknown: true });
  });
  it('rejects absent review or revision evidence before any write', async () => {
    await expect(applySubmittalWorkflow({ review: { ...review, updated_at: undefined }, revisionIds: ['rev-a'], patch: { status: 'Submitted' } })).rejects.toThrow(/Refresh/);
    await expect(applySubmittalWorkflow({ review, revisionIds: [], patch: { status: 'Submitted' } })).rejects.toThrow(/revision/);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('rejects imported drawing approvals without changing their meaning; other types retain their creation behavior', () => {
    expect(() => validateSubmittalCreate({ submittal_type: 'Shop Drawing', status: 'Approved' })).toThrow(/Draft/);
    expect(() => validateSubmittalCreate({ status: 'Submitted' })).toThrow(/Draft/);
    expect(() => validateSubmittalCreate({ submittal_type: 'Product Data', status: 'Submitted' })).not.toThrow();
    expect(() => validateSubmittalCreate({ submittal_type: 'Shop Drawing', status: 'Draft' })).not.toThrow();
  });
  it('does not attach Shop Drawing revision evidence to a linked Product Data workflow', async () => {
    await applySubmittalWorkflow({ review: { ...review, submittal_type: 'Product Data' }, revisionIds: ['linked-drawing-revision'], patch: { status: 'Submitted', ball_in_court: 'EOR', submitted_date: '2026-10-09' } });
    expect(rpc).toHaveBeenCalledWith('apply_submittal_round_workflow', expect.objectContaining({ p_expected_revision_ids: [] }));
  });
});
