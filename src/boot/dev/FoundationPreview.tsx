/**
 * Development-only browser acceptance of actual shell primitives. This HTML
 * entry is not a Vite production input, never imports instrument/auth/API code,
 * and grants no access to the real application or its data.
 */
import { Suspense, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, useSearchParams } from 'react-router-dom';
import { ThemeProvider, useTheme } from '@/components/shared/ThemeContext';
import PageErrorBoundary from '@/components/shared/ErrorBoundary';
import PageLoader from '@/boot/PageLoader';
import { lazyWithRetry } from '@/lib/lazyRetry';
import '@/globals.css';

const Details = lazyWithRetry(() => import('./FoundationDetails'));
const buttonStyle: CSSProperties = {
  border: '1px solid var(--border-default)', borderRadius: 6,
  background: 'var(--bg-surface)', color: 'var(--text-primary)',
  padding: '10px 14px', minHeight: 44, cursor: 'pointer',
};

function RecoverySection({ broken }: { broken: boolean }) {
  if (broken) throw new Error('[M0 fixture] Intentional render failure');
  return <p role="status">Section ready</p>;
}

function FoundationPreview() {
  const [search] = useSearchParams();
  const { theme, toggleTheme } = useTheme();
  const [broken, setBroken] = useState(false);
  const details = search.get('view') === 'details';
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)', color: 'var(--text-primary)', padding: 20 }}>
      <a className="foundation-skip" href="#verification">Skip to verification</a>
      <style>{`.foundation-skip{position:absolute;left:-10000px}.foundation-skip:focus{position:static}#verification:focus{outline:2px solid var(--accent);outline-offset:4px}`}</style>
      <header style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', margin: '0 0 8px' }}>Foundation verification</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>Development fixture · no project data or backend connection</p>
        </div>
        <button type="button" style={buttonStyle} onClick={toggleTheme}>
          Switch to {theme === 'dark' ? 'light' : 'dark'} mode
        </button>
      </header>
      <nav aria-label="Fixture navigation" style={{ display: 'flex', gap: 20, margin: '24px 0' }}>
        <Link to="/dev/foundation.html" aria-current={!details ? 'page' : undefined}>Overview</Link>
        <Link to="/dev/foundation.html?view=details" aria-current={details ? 'page' : undefined}>Details</Link>
      </nav>
      <main id="verification" tabIndex={-1} style={{ maxWidth: 960, padding: 16, border: '1px solid var(--border-default)', borderRadius: 8 }}>
        {details ? (
          <PageErrorBoundary label="Fixture details">
            <Suspense fallback={<PageLoader />}><Details /></Suspense>
          </PageErrorBoundary>
        ) : (
          <section>
            <h2>Recovery check</h2>
            <p>Trigger a render error, clear its cause, then retry the section.</p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
              <button type="button" style={buttonStyle} onClick={() => setBroken(true)}>Trigger render error</button>
              <button type="button" style={buttonStyle} onClick={() => setBroken(false)}>Clear error cause</button>
            </div>
            <PageErrorBoundary label="Fixture recovery"><RecoverySection broken={broken} /></PageErrorBoundary>
          </section>
        )}
      </main>
    </div>
  );
}

// Defense in depth if this entry is ever accidentally added to a build input.
if (import.meta.env.DEV) {
  const root = document.getElementById('root');
  if (root) createRoot(root).render(
    <ThemeProvider>
      <BrowserRouter useTransitions>
        <FoundationPreview />
      </BrowserRouter>
    </ThemeProvider>,
  );
}
