// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { Submittal } from '../types';

vi.mock('@/components/collaboration/CommentThread', () => ({ default: (): null => null }));
vi.mock('@/components/submittals/RoundTimeline', () => ({ default: (): null => null }));
vi.mock('@/components/submittals/ResponseMatrix', () => ({ default: (): null => null }));
vi.mock('@/components/submittals/SubmittalReviewStrip', () => ({ default: (): null => null }));
vi.mock('@/components/submittals/ApprovalChainPanel', () => ({ default: (): null => null }));
vi.mock('@/components/submittals/ApproverNotesPanel', () => ({ default: (): null => null }));
vi.mock('@/components/submittals/CommentDispositionChecklist', () => ({ default: (): null => null }));
vi.mock('@/components/submittals/LinkedEntities', () => ({ LinkedRFIs: (): null => null, LinkedTasks: (): null => null }));
vi.mock('../LinkedDrawingSets', () => ({ LinkedDrawingSets: (): null => null }));
vi.mock('../SubmittalRevisionEvidence', () => ({ default: () => <section aria-label="Exact revision evidence" /> }));
vi.mock('@/components/submittals/IfcIssueDialog', () => ({ default: ({ open, onConfirm }: { open: boolean; onConfirm: (value: unknown) => void }) => open
  ? <div role="dialog" aria-label="Issue for construction"><button onClick={() => onConfirm({ checklist: {}, overrideReason: null })}>Confirm reviewed IFC</button></div> : null }));

import { SubmittalDetail, type SubmittalDetailProps } from '../SubmittalDetail';

const row = (submittal_type: string | null, changes: Partial<Submittal> = {}): Submittal => ({
  id: 'submittal-1', project_id: 'project-1', title: 'Steel package', submittal_number: 'S-001',
  submittal_type, status: 'Approved', ball_in_court: 'GC', ...changes,
});
function props(submittal: Submittal): SubmittalDetailProps {
  return { submittal, onClose: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onStatusChange: vi.fn(),
    onBICChange: vi.fn(), onFieldChange: vi.fn(), onReturnRound: vi.fn(), onAdvance: vi.fn() };
}
const detail = (value: SubmittalDetailProps) => <MemoryRouter><SubmittalDetail {...value} /></MemoryRouter>;

describe('submittal fabrication action authority', () => {
  it.each([null, '', 'Product Data', 'Calculation', 'Shop drawing'])('offers no fabrication action for %s', async type => {
    const value = props(row(type));
    render(detail(value));
    expect(screen.queryByRole('button', { name: /release.*fab|issue for construction|send for scrub/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Issue for construction' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Revise and Resubmit' }));
    expect(value.onStatusChange).toHaveBeenCalledWith('Revise and Resubmit');
    expect(value.onAdvance).not.toHaveBeenCalled();
  });
  it('retains ordinary Product Data approval and resubmission', async () => {
    const value = props(row('Product Data', { status: 'Submitted', ball_in_court: 'EOR' }));
    const view = render(detail(value));
    await userEvent.click(screen.getByRole('button', { name: 'Log Return (BFA) →' }));
    expect(value.onAdvance).toHaveBeenCalledWith(expect.objectContaining({ nextStatus: 'Approved as Noted' }));
    view.rerender(detail({ ...value, submittal: row('Product Data', { status: 'Revise and Resubmit' }) }));
    await userEvent.click(screen.getByRole('button', { name: 'Resubmit for Approval (OFA) →' }));
    expect(value.onAdvance).toHaveBeenLastCalledWith(expect.objectContaining({ nextStatus: 'Submitted' }));
  });
  it('retains the typed Shop Drawing release path for its authoritative write gate', async () => {
    const value = props(row('Shop Drawing'));
    render(detail(value));
    await userEvent.click(screen.getByRole('button', { name: 'Release for Fabrication →' }));
    expect(value.onAdvance).toHaveBeenCalledWith(expect.objectContaining({ nextStatus: 'Released for Fabrication', nextStage: 'Released' }));
    expect(screen.getByRole('region', { name: 'Exact revision evidence' })).toBeVisible();
  });
  it('does not carry an open Shop Drawing IFC confirmation onto a different untyped record', async () => {
    const value = props(row('Shop Drawing', { ball_in_court: 'Detailer' }));
    const view = render(detail(value));
    await userEvent.click(screen.getByRole('button', { name: 'Issue for Construction (IFC) →' }));
    expect(screen.getByRole('dialog', { name: 'Issue for construction' })).toBeVisible();
    view.rerender(detail({ ...value, submittal: row(null, { id: 'legacy-2' }) }));
    expect(screen.queryByRole('dialog', { name: 'Issue for construction' })).not.toBeInTheDocument();
    expect(value.onAdvance).not.toHaveBeenCalled();
  });
});
