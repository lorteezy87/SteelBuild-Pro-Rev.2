import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { runDetailingValidation } from '@/lib/detailingValidation/repository';
import { VALIDATION_RULES } from '@/lib/detailingValidation/rules';
import { toUserErrorMessage } from '@/lib/mutations/standardMutation';
import './detailingValidation.css';

export default function DetailingValidationPanel({ projectId }: { projectId: string | null }) {
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState('all');
  const [recordType, setRecordType] = useState('all');
  const [rule, setRule] = useState('all');
  const query = useQuery({
    queryKey: ['detailing-validation', projectId],
    queryFn: () => runDetailingValidation(projectId || ''),
    enabled: false, retry: false,
  });
  const report = query.isSuccess && !query.isFetching ? query.data : null;
  const rows = report?.findings.filter(finding =>
    (recordType === 'all' || finding.recordType === recordType) &&
    (severity === 'all' || finding.severity === severity) && (rule === 'all' || finding.rule === rule) &&
    `${finding.recordLabel} ${finding.set} ${finding.label} ${finding.detail}`.toLowerCase().includes(search.trim().toLowerCase()),
  ) || [];
  if (!projectId) return <p>Select a project to validate its drawing records.</p>;
  return <section className="detailing-validation" aria-label="Detailing validation">
    <div className="detailing-validation__heading">
      <div><h2>Drawing and piece validation</h2><p>Find missing drawing information, incomplete piece lots, and drawing holds affecting erected steel.</p></div>
      <button className="cmd-chip-btn" disabled={query.isFetching} onClick={() => query.refetch()}>{query.isFetching ? 'Checking…' : query.isError ? 'Retry validation' : report ? 'Re-run validation' : 'Run validation'}</button>
    </div>
    <p className="detailing-validation__scope">Checks sheet titles, revisions, PDF references and hold reasons; piece quantity, weight and active drawing links; and current drawing holds affecting erected lots. These checks do not verify file access or fabrication release eligibility.</p>
    {query.isFetching ? <p role="status">Loading complete sheet, revision, hold, piece, and relationship evidence…</p>
      : query.isError ? <p role="alert">Validation unavailable: {toUserErrorMessage(query.error)}. No result is certified from this failed run.</p>
      : !report ? <div className="detailing-validation__empty"><h3>Not run yet</h3><p>Run validation to check this project’s current sheets and actionable piece lots.</p></div>
      : <>
        <div className="detailing-validation__kpis">
          {[['Records checked', report.checked], ['Needs review', report.errors], ['Warnings only', report.warnings], ['No findings', report.clear]].map(([label,value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
        </div>
        <p className="detailing-validation__snapshot">{report.sheetsChecked} sheets · {report.piecesChecked} piece lots. Snapshot checked {new Date(report.checkedAt).toLocaleString()}. Re-run after changes.</p>
        <div className="detailing-validation__filters">
          <input type="search" aria-label="Search validation findings" placeholder="Search sheet, piece mark, set, or finding…" value={search} onChange={event => setSearch(event.target.value)} />
          <select aria-label="Validation record type" value={recordType} onChange={event => setRecordType(event.target.value)}><option value="all">Sheets and pieces</option><option value="sheet">Sheets</option><option value="piece">Piece lots</option></select>
          <select aria-label="Validation severity" value={severity} onChange={event => setSeverity(event.target.value)}><option value="all">All severities</option><option value="error">Needs review</option><option value="warning">Warnings</option></select>
          <select aria-label="Validation rule" value={rule} onChange={event => setRule(event.target.value)}><option value="all">All checks</option>{Object.entries(VALIDATION_RULES).map(([key, definition]) => <option key={key} value={key}>{definition.label}</option>)}</select>
        </div>
        <div className="cmd-table-wrap"><table className="cmd-table"><thead><tr><th>Severity</th><th>Type</th><th>Record</th><th>Set</th><th>Finding</th><th>Next action</th></tr></thead><tbody>
          {rows.map(finding => <tr key={finding.id}><td>{finding.severity === 'error' ? 'Review' : 'Warning'}</td><td>{finding.recordType === 'piece' ? 'Piece lot' : 'Sheet'}</td><td><Link to={finding.href}>{finding.recordLabel}</Link></td><td>{finding.set}</td><td>{finding.label}</td><td>{finding.detail}{finding.rule === 'hold_no_reason' && <> <Link to="?hub_tab=holds">Open Holds &amp; Blockers</Link></>}</td></tr>)}
          {!rows.length && <tr><td colSpan={6}>{report.findings.length ? 'No findings match these filters.' : report.checked ? `No findings in these ${Object.keys(VALIDATION_RULES).length} checks.` : 'No active sheets or actionable piece lots to check.'}</td></tr>}
        </tbody></table></div>
      </>}
  </section>;
}
