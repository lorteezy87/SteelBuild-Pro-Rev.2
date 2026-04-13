import { Suspense, lazy } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { PAGES } from '@/config/routes';
import { BrowserRouter as Router, Route, Routes, Outlet, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import LocalLoginForm from '@/components/LocalLoginForm';
import { ThemeProvider } from '@/components/shared/ThemeContext';
import { ProjectProvider } from '@/components/shared/ProjectContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import PageErrorBoundary from '@/components/shared/ErrorBoundary';
import Layout from './Layout';

// ── Lazy with retry (mirrors lazyWithRetry in routes.js) ────────────
// Catches stale chunk 404s after Vercel deploys and reloads once.
const RELOAD_KEY = "__steelbuild_chunk_reload";
function lazyRetry(importFn) {
  return lazy(() =>
    importFn().catch((err) => {
      if (!sessionStorage.getItem(RELOAD_KEY)) {
        sessionStorage.setItem(RELOAD_KEY, "1");
        window.location.reload();
        return new Promise(() => {});
      }
      throw err;
    })
  );
}

const Dashboard = lazyRetry(() => import('./pages/Dashboard'));
const Landing = lazyRetry(() => import('./pages/Landing'));

// ── Suspense loading indicator ───────────────────────────────────────
function PageLoader() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading page"
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        minHeight: 200, width: "100%",
      }}>
      <div aria-hidden="true" style={{
        width: 24, height: 24,
        border: "2px solid var(--border-default)",
        borderTop: "2px solid var(--accent)",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
      }} />
      <span className="sr-only">Loading page…</span>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Layout Route ─────────────────────────────────────────────────────
// Layout mounts ONCE and stays mounted across all page navigations.
// Only the <Outlet> (page content) swaps when the route changes.
function LayoutRoute() {
  const location = useLocation();
  // Derive currentPageName from URL path (e.g. "/Drawings" → "Drawings")
  const currentPageName = location.pathname.replace(/^\//, '') || 'Dashboard';

  return (
    <PageErrorBoundary label="Layout" key="layout-boundary">
      <Layout currentPageName={currentPageName}>
        <Outlet />
      </Layout>
    </PageErrorBoundary>
  );
}

// ── Main authenticated app ───────────────────────────────────────────
const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, loginWithPassword } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label="Loading application"
        style={{
          position: "fixed", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "var(--bg-page)",
        }}>
        <div aria-hidden="true" style={{
          width: 32, height: 32,
          border: "3px solid var(--border-default)",
          borderTop: "3px solid var(--accent)",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }} />
        <span style={{
          position: "absolute",
          width: 1, height: 1, padding: 0, margin: -1,
          overflow: "hidden", clip: "rect(0,0,0,0)",
          whiteSpace: "nowrap", border: 0,
        }}>Loading application…</span>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (authError?.type === 'auth_required') {
    return (
      <LocalLoginForm
        onSubmit={loginWithPassword}
        isSubmitting={isLoadingAuth}
        errorMessage={authError?.message !== 'Authentication required' ? authError?.message : null}
      />
    );
  }

  return (
    <Routes>
      {/* All pages share a single Layout instance via layout route */}
      <Route element={<LayoutRoute />}>
        {/* Home route */}
        <Route
          index
          element={
            <Suspense fallback={<PageLoader />}>
              <PageErrorBoundary label="Dashboard" key="Dashboard">
                <Dashboard />
              </PageErrorBoundary>
            </Suspense>
          }
        />

        {/* All registered page routes — lazy loaded */}
        {Object.entries(PAGES).map(([path, Page]) => (
          <Route
            key={path}
            path={path}
            element={
              <Suspense fallback={<PageLoader />}>
                <PageErrorBoundary label={path} key={path}>
                  <Page />
                </PageErrorBoundary>
              </Suspense>
            }
          />
        ))}

        {/* Landing page */}
        <Route
          path="Landing"
          element={
            <Suspense fallback={<PageLoader />}>
              <PageErrorBoundary label="Landing" key="Landing">
                <Landing />
              </PageErrorBoundary>
            </Suspense>
          }
        />
      </Route>

      {/* 404 — outside layout */}
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <QueryClientProvider client={queryClientInstance}>
            <Router>
              <ProjectProvider>
                <AuthenticatedApp />
              </ProjectProvider>
            </Router>
          </QueryClientProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
