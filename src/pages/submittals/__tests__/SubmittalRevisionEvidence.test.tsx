// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RevisionEvidenceReview } from '../SubmittalRevisionEvidence';
import type { SubmittalRevisionCoverage } from '@/api/client/submittalWorkflow';
const coverage: SubmittalRevisionCoverage = { project_id: 'p', submittal_status: 'Approved', submittal_updated_at: '2026-10-09T00:00:00Z', empty_drawing_set_ids: [], submittal_id: 's', round_id: 'r', ok: false, reason: 'Missing exact revisions', current_revision_ids: ['rev1'], captured_revision_ids: [], missing_revision_ids: ['rev1'], stale_revision_ids: [], missing_current_drawing_ids: [], foreign_drawing_set_ids: [], evidence: [] };
describe('legacy exact revision review', () => {
  it('keeps reconciliation blocked until each PDF, the transmittal, and a written attestation are reviewed', async () => {
    const reconcile = vi.fn();
    render(<RevisionEvidenceReview coverage={coverage} submittedDate="2026-10-01" revisions={[{ id: 'rev1', revision_code: 'B', file_url: 'p/drawing.pdf', pdf_page: 4 }]} canReconcile onReconcile={reconcile} onOpenDocument={vi.fn()} />);
    const submit = screen.getByRole('button', { name: 'Attest reviewed evidence' });
    expect(submit).toBeDisabled();
    await userEvent.click(screen.getByLabelText(/I reviewed PDF revision B/));
    await userEvent.click(screen.getByLabelText(/I reviewed the original transmittal/));
    await userEvent.type(screen.getByLabelText(/Review record/), 'Reviewed transmittal T-104 and sheet S1 revision B, page 4, against the signed PDF.');
    expect(submit).toBeEnabled();
    await userEvent.click(submit);
    expect(reconcile).toHaveBeenCalledWith(expect.stringContaining('T-104'));
    expect(screen.getByText(/does not approve/)).toBeInTheDocument();
  });
  it('never offers reconciliation for stale captured revisions or a viewer', () => {
    render(<RevisionEvidenceReview coverage={{ ...coverage, stale_revision_ids: ['older-rev'] }} revisions={[]} canReconcile onReconcile={vi.fn()} onOpenDocument={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Attest reviewed evidence' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('an earlier approval cannot authorize the current PDFs');
  });
  it('offers explicit legacy review when the historical submission has no round, but not for a draft', () => {
    const props = { revisions: [], submittedDate: '2026-10-01', canReconcile: true, onReconcile: vi.fn(), onOpenDocument: vi.fn() };
    const view = render(<RevisionEvidenceReview {...props} coverage={{ ...coverage, round_id: null }} />);
    expect(screen.getByRole('button', { name: 'Attest reviewed evidence' })).toBeDisabled();
    view.rerender(<RevisionEvidenceReview {...props} coverage={{ ...coverage, round_id: null, submittal_status: 'Draft' }} />);
    expect(screen.queryByRole('button', { name: 'Attest reviewed evidence' })).not.toBeInTheDocument();
  });
  it('blocks legacy attestation without an actual submission date and explains the recovery path', () => {
    render(<RevisionEvidenceReview coverage={coverage} revisions={[]} canReconcile onReconcile={vi.fn()} onOpenDocument={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Attest reviewed evidence' })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('original submission date is missing');
  });
  it('does not claim readiness when evidence cannot be loaded', () => {
    render(<RevisionEvidenceReview error="Evidence read failed" revisions={[]} canReconcile={false} onReconcile={vi.fn()} onOpenDocument={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Evidence read failed');
    expect(screen.queryByText('Exact revision evidence verified')).not.toBeInTheDocument();
  });
});
