/** Keep incomplete workflow evidence out of counts, exports, and write controls. */
export default function WorkflowFetchState({ label, error, onRetry }: {
  label: string;
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <section role={error ? 'alert' : 'status'} aria-label={label} style={{ padding: 32, color: 'var(--text-primary)', background: 'var(--bg-surface)', borderRadius: 'var(--radius-card)' }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>{error ? `Unable to load ${label.toLowerCase()}` : `Loading ${label.toLowerCase()}…`}</h2>
      <p style={{ color: 'var(--text-secondary)' }}>
        {error ? 'Required project records could not be loaded. Retry to view the current workflow.' : 'Waiting for the project records needed to show the current workflow.'}
      </p>
      {error ? <button type="button" className="sbd-btn sbd-btn-secondary" onClick={onRetry}>Retry</button> : null}
    </section>
  );
}
