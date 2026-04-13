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

// Eagerly loaded pages (critical path — no lazy overhead)
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Landing = lazy(() => import('./pages/Landing'));

// ── Suspense loading indicator ───────────────────────────────────────
function PageLoader() {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      minHeight: 200, width: "100%",
    }}>
      <div style={{
        width: 24, height: 24,
        border: "2px solid var(--border-default)",
        borderTop: "2px solid var(--accent)",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
      }} />
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
      <div style={{
        position: "fixed", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "var(--bg-page)",
      }}>
        <div style={{
          width: 32, height: 32,
          border: "3px solid var(--border-default)",
          borderTop: "3px solid var(--accent)",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }} />
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
