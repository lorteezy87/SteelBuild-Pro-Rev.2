import type { PayApplicationReconciliation } from '@/lib/payapp/reconciliation';
import './payAppReconciliation.css';

interface Props {
  result: PayApplicationReconciliation | null;
  linesError: boolean;
  liveState: 'loading' | 'error' | 'ready';
  historical: boolean;
  busy: boolean;
  onRefresh: () => void;
}
export default function PayAppReconciliationPanel({ result, linesError, liveState, historical, busy, onRefresh }: Props) {
  return <section className="payapp-checks" aria-label="Pay application reconciliation">
    <div className="payapp-checks-heading"><h3>Reconciliation</h3><button type="button" onClick={onRefresh} disabled={busy}>Refresh checks</button></div>
    <div className="payapp-checks-columns">
      <div>
        <strong>{linesError ? 'Certificate check unavailable' : !result ? 'Checking certificate…' : result.certificateProblems.length ? 'Certificate needs review' : 'Certificate totals agree'}</strong>
        {linesError ? <p role="alert">Could not load certificate lines. Retry before using these figures.</p>
          : !result ? <p role="status">Loading complete G703 evidence.</p>
          : result.certificateProblems.length ? <ul>{result.certificateProblems.map((problem, index) => <li key={index}>{problem}</li>)}</ul>
          : <p>Stored header, G703 totals, and line retainage agree to the cent.</p>}
      </div>
      <div>
        <strong>{historical ? 'Current SOV comparison' : 'Current SOV and contract'}</strong>
        {liveState === 'error' ? <p role="alert">Current SOV, contract, or approved change orders could not be loaded. Comparison unavailable.</p>
          : liveState !== 'ready' || !result ? <p role="status">Waiting for current contract evidence.</p>
          : result.liveProblems?.length ? <ul>{result.liveProblems.map((problem, index) => <li key={index}>{problem}</li>)}</ul>
          : <p>Certificate allocations agree with the current SOV and contract.</p>}
        {historical && <p>Later SOV or contract changes do not invalidate an issued certificate. Review differences in their billing-period context.</p>}
      </div>
    </div>
    <p className="payapp-checks-note">Diagnostic checks only. Review discrepancies before submitting; figures are not changed automatically. Prior certificates and payment history are not verified here.</p>
  </section>;
}
