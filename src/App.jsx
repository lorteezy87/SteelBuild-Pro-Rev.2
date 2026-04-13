import { pagesConfig } from './pages.config'
import { Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { useAuth } from '@/lib/AuthContext';
import LocalLoginForm from '@/components/LocalLoginForm';
import AppProviders from '@/components/AppProviders';
import PageErrorBoundary from '@/components/shared/ErrorBoundary';
import Landing from './pages/Landing';
import RFIHub from './pages/RFIHub';
import Dashboard from './pages/Dashboard';

const { Pages, Layout } = pagesConfig;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <PageErrorBoundary label="Layout" key="layout-boundary">
    <Layout currentPageName={currentPageName}>{children}</Layout>
  </PageErrorBoundary>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, loginWithPassword } = useAuth();

  // Show loading spinner while checking auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-page)",
      }}>
        <div style={{
          width: "32px",
          height: "32px",
          border: "3px solid var(--border-default)",
          borderTop: `3px solid var(--accent)`,
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }} />
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Show login form when not authenticated
  if (authError?.type === 'auth_required') {
    return (
      <LocalLoginForm
        onSubmit={loginWithPassword}
        isSubmitting={isLoadingAuth}
        errorMessage={authError?.message !== 'Authentication required' ? authError?.message : null}
      />
    );
  }

  // Render the main app
  return (
    <Routes>
      <Route
        path="/"
        element={
          <LayoutWrapper currentPageName="Dashboard">
            <PageErrorBoundary label="Dashboard" key="Dashboard">
              <Dashboard />
            </PageErrorBoundary>
          </LayoutWrapper>
        }
      />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <PageErrorBoundary label={path} key={path}>
                <Page />
              </PageErrorBoundary>
            </LayoutWrapper>
          }
        />
      ))}
      <Route path="/Landing" element={<LayoutWrapper currentPageName="Landing"><PageErrorBoundary label="Landing" key="Landing"><Landing /></PageErrorBoundary></LayoutWrapper>} />
      <Route path="/RFIHub" element={<LayoutWrapper currentPageName="RFIHub"><PageErrorBoundary label="RFIHub" key="RFIHub"><RFIHub /></PageErrorBoundary></LayoutWrapper>} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {
  return (
    <AppProviders>
      <AuthenticatedApp />
    </AppProviders>
  )
}

export default App
