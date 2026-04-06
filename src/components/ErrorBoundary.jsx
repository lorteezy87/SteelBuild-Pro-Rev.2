import React from 'react';

/**
 * Top-level error boundary. Catches unhandled React render errors and shows
 * a recovery UI instead of a blank screen.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Log to console so it shows in Supabase Edge Function logs / Sentry if wired up
    console.error('[ErrorBoundary] Uncaught render error:', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        position: 'fixed', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-page, #0a0f1e)',
        color: 'var(--text-primary, #e2e8f0)',
        fontFamily: 'system-ui, sans-serif',
        gap: 16, padding: 32, textAlign: 'center',
      }}>
        <img src="/steelbuild-pro-logo.png" alt="SteelBuild Pro" style={{ height: 40, marginBottom: 8, opacity: 0.8 }} />
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Something went wrong</h2>
        <p style={{ margin: 0, opacity: 0.6, maxWidth: 480, fontSize: 14 }}>
          An unexpected error occurred. Refresh the page to continue. If the problem persists, contact support.
        </p>
        <details style={{ marginTop: 8, fontSize: 12, opacity: 0.4, maxWidth: 600, textAlign: 'left', whiteSpace: 'pre-wrap' }}>
          <summary style={{ cursor: 'pointer', marginBottom: 4 }}>Error details</summary>
          {this.state.error?.toString()}
        </details>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: 8, padding: '8px 24px',
            background: 'var(--accent, #c9a84c)', color: '#0a0f1e',
            border: 'none', borderRadius: 6, cursor: 'pointer',
            fontWeight: 600, fontSize: 14,
          }}
        >
          Reload page
        </button>
      </div>
    );
  }
}
