import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { entities } from '@/api/supabaseClient';
import { resolveFileUrl } from '@/api/client/storage';
import { getSubmittalRevisionCoverage, reconcileSubmittalEvidence, type SubmittalReview, type SubmittalRevisionCoverage } from '@/api/client/submittalWorkflow';
import { roleAtLeast, useProjectRole } from '@/hooks/useProjectRole';
import { invalidateEntity } from '@/services/cacheRegistry';
import { revisionCoverageBlockMessage } from '@/lib/submittalRevisionEvidence';

interface RevisionDocument { id: string; revision_code: string; file_url: string | null; pdf_page: number | null }
interface ReviewProps {
  coverage?: SubmittalRevisionCoverage; revisions: RevisionDocument[]; error?: string; loading?: boolean;
  submittedDate?: string | null;
  canReconcile: boolean; busy?: boolean; onReconcile: (attestation: string) => void | Promise<void>;
  onOpenDocument: (file: string, page: number | null) => void | Promise<void>;
}
export function RevisionEvidenceReview({ coverage, revisions, error, loading, submittedDate, canReconcile, busy, onReconcile, onOpenDocument }: ReviewProps) {
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const [reviewedTransmittal, setReviewedTransmittal] = useState(false);
  const [attestation, setAttestation] = useState('');
  if (error) return <p role="alert" style={{ color: 'var(--status-error)' }}>Revision evidence unavailable: {error}. Workflow decisions remain blocked.</p>;
  if (loading || !coverage) return <p role="status">Loading exact revision evidence…</p>;
  const stale = coverage.stale_revision_ids.length > 0;
  const missing = coverage.missing_revision_ids.length;
  const canAttest = canReconcile && !!submittedDate && !['Draft', 'Void'].includes(coverage.submittal_status) && !coverage.ok && !stale && coverage.evidence.length === 0 && coverage.current_revision_ids.length > 0 && coverage.missing_current_drawing_ids.length === 0 && coverage.foreign_drawing_set_ids.length === 0 && coverage.empty_drawing_set_ids.length === 0;
  const allReviewed = coverage.current_revision_ids.every(id => reviewedIds.has(id) && revisions.some(row => row.id === id && !!row.file_url));
  return <section aria-label="Exact revision evidence" style={{ border: '1px solid var(--border-default)', borderRadius: 4, padding: 12, marginBlock: 12, color: 'var(--text-primary)', fontSize: 12 }}>
    <h3 style={{ fontFamily: 'var(--font-display)', margin: '0 0 8px', fontSize: 15 }}>Revision evidence</h3>
    <p style={{ color: coverage.ok ? 'var(--status-success)' : 'var(--status-warning)', margin: '0 0 8px' }}>
      {coverage.ok ? 'Exact revision evidence verified' : revisionCoverageBlockMessage(coverage)}
    </p>
    <p style={{ color: 'var(--text-secondary)' }}>{coverage.captured_revision_ids.length} captured · {coverage.current_revision_ids.length} current · {missing} missing · {coverage.stale_revision_ids.length} superseded</p>
    {stale && <p role="status">Captured revisions have changed. Use a new review round; an earlier approval cannot authorize the current PDFs.</p>}
    {!!coverage.missing_current_drawing_ids.length && <p role="alert">{coverage.missing_current_drawing_ids.length} sheets lack a current PDF revision. Resolve them in the Drawing Register.</p>}
    {!!coverage.foreign_drawing_set_ids.length && <p role="alert">The package contains drawing sets outside this project. Resolve the package links before continuing.</p>}
    {!!coverage.empty_drawing_set_ids.length && <p role="alert">The package contains empty drawing sets. Add the transmitted sheets before capturing evidence.</p>}
    {!coverage.ok && !submittedDate && !['Draft', 'Void'].includes(coverage.submittal_status) && <p role="alert">The original submission date is missing, so legacy evidence cannot be attested. Create a new review package to submit these PDFs with a recorded date and recipient.</p>}
    {coverage.evidence.length > 0 && <ul style={{ paddingLeft: 18 }}>{coverage.evidence.map(row => <li key={row.id} style={{ marginBlock: 5 }}>
      <button type="button" onClick={() => void onOpenDocument(row.file_url, row.pdf_page)} style={{ color: 'var(--accent)', background: 'transparent', border: 0, textDecoration: 'underline', cursor: 'pointer' }}>Revision {row.revision_code || 'unmarked'} · page {row.pdf_page ?? 'unknown'}</button>
      {' · '}{row.capture_kind === 'legacy_attestation' ? 'PM attestation' : 'Submitted snapshot'}
    </li>)}</ul>}
    {!coverage.ok && !canAttest && !stale && <p>Review the linked PDFs and submit a new review round, or have a project manager reconcile eligible legacy evidence.</p>}
    {canAttest && <div style={{ display: 'grid', gap: 10, borderTop: '1px solid var(--border-default)', paddingTop: 10 }}>
      <strong>Reconcile legacy evidence</strong>
      <p style={{ margin: 0 }}>Personally compare every current PDF against the original transmitted package. This records evidence and does not approve a revision, clear a hold, or authorize fabrication.</p>
      {coverage.current_revision_ids.map(id => {
        const revision = revisions.find(row => row.id === id);
        return <div key={id} style={{ display: 'grid', gap: 5 }}>
          {revision?.file_url ? <button type="button" onClick={() => void onOpenDocument(revision.file_url!, revision.pdf_page)} style={{ justifySelf: 'start', color: 'var(--accent)', background: 'transparent', border: 0, textDecoration: 'underline', cursor: 'pointer' }}>Open revision {revision.revision_code} · page {revision.pdf_page ?? 'unknown'}</button> : <span role="alert">Current PDF {id} is unavailable for review.</span>}
          <label style={{ display: 'flex', gap: 8 }}><input type="checkbox" checked={reviewedIds.has(id)} disabled={busy || !revision?.file_url} onChange={event => setReviewedIds(previous => { const next = new Set(previous); if (event.target.checked) next.add(id); else next.delete(id); return next; })} />I reviewed PDF revision {revision?.revision_code || id} against the transmitted sheet.</label>
        </div>;
      })}
      <label style={{ display: 'flex', gap: 8 }}><input type="checkbox" checked={reviewedTransmittal} disabled={busy} onChange={event => setReviewedTransmittal(event.target.checked)} />I reviewed the original transmittal and confirmed these exact revisions were included.</label>
      <label style={{ display: 'grid', gap: 5 }}>Review record — transmittal reference, PDF pages and basis<textarea value={attestation} disabled={busy} rows={3} onChange={event => setAttestation(event.target.value)} style={{ width: '100%', minWidth: 0, background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-default)', borderRadius: 4, padding: 8 }} /></label>
      <button type="button" disabled={busy || !allReviewed || !reviewedTransmittal || attestation.trim().length < 20} onClick={() => void onReconcile(attestation)} style={{ justifySelf: 'start', background: 'var(--accent)', color: 'var(--on-accent)', padding: '8px 12px', borderRadius: 4, border: 0 }}>{busy ? 'Recording evidence…' : 'Attest reviewed evidence'}</button>
    </div>}
  </section>;
}
export default function SubmittalRevisionEvidence({ submittal }: { submittal: SubmittalReview & { project_id?: string } }) {
  const qc = useQueryClient();
  const { role } = useProjectRole(submittal.project_id);
  const coverage = useQuery({ queryKey: ['submittal-revision-coverage', submittal.id, submittal.updated_at], queryFn: () => getSubmittalRevisionCoverage(submittal.id), retry: false });
  const ids = coverage.data?.current_revision_ids ?? [];
  const revisions = useQuery({ queryKey: ['submittal-revision-documents', submittal.id, ids], enabled: ids.length > 0, queryFn: async () => {
    // Small bounded requests avoid URL limits while filterAll detects no silent row cap.
    const rows: RevisionDocument[] = [];
    for (let start = 0; start < ids.length; start += 100) rows.push(...await entities.DrawingRevision.filterAll({ project_id: submittal.project_id, id: ids.slice(start, start + 100) }) as RevisionDocument[]);
    return rows;
  } });
  const reconcile = useMutation({ mutationFn: async (attestation: string) => {
    if (!coverage.data) throw new Error('Load and review exact revision evidence first.');
    return reconcileSubmittalEvidence({ review: submittal, revisionIds: coverage.data.current_revision_ids, attestation });
  }, onSuccess: async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: ['submittal-revision-coverage', submittal.id] }), invalidateEntity(qc, 'submittal', submittal.project_id), invalidateEntity(qc, 'drawing', submittal.project_id)]);
    toast.success('Reviewed revision evidence recorded. Status and release authority are unchanged.');
  }, onError: (error: Error) => toast.error(error.message) });
  const openDocument = async (file: string, page: number | null) => {
    try { const url = await resolveFileUrl(file.replace(/^app-files\//, '')); if (!url) throw new Error('This PDF is unavailable or outside trusted project storage.'); window.open(`${url}${page ? `#page=${page}` : ''}`, '_blank', 'noopener,noreferrer'); }
    catch (error) { toast.error(error instanceof Error ? error.message : String(error)); }
  };
  return <RevisionEvidenceReview key={`${submittal.id}:${submittal.updated_at}:${ids.join(',')}`} coverage={coverage.data} submittedDate={submittal.submitted_date} revisions={revisions.data ?? []} error={coverage.error?.message || revisions.error?.message} loading={coverage.isPending} canReconcile={roleAtLeast(role, 'pm')} busy={reconcile.isPending} onReconcile={attestation => reconcile.mutate(attestation)} onOpenDocument={openDocument} />;
}
