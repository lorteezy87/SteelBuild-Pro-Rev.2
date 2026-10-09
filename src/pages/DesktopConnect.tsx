import { useEffect } from 'react';

/** Old bookmarks get a clear destination; no auth, crypto or handoff code loads. */
export default function DesktopConnect() {
  useEffect(() => { window.history.replaceState(window.history.state, '', window.location.pathname); }, []);
  return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
    <section style={{ maxWidth: 480 }}>
      <h1>Desktop companion discontinued</h1>
      <p>The Desktop Command Center companion app is no longer available. Continue your work in SteelBuild Pro.</p>
      <a className="sbd-btn sbd-btn-primary" href="/">Open SteelBuild Pro</a>
    </section>
  </main>;
}
