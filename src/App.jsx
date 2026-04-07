import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import LocalLoginForm from '@/components/LocalLoginForm';
import { ThemeProvider } from '@/components/shared/ThemeContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import Landing from './pages/Landing';
import RFIHub from './pages/RFIHub';
import Dashboard from './pages/Dashboard';
import ErrorBoundary from '@/components/ErrorBoundary';

const { Pages, Layout } = pagesConfig;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
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
            <Dashboard />
          </LayoutWrapper>
        }
      />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <Page />
            </LayoutWrapper>
          }
        />
      ))}
      <Route path="/Landing" element={<LayoutWrapper currentPageName="Landing"><Landing /></LayoutWrapper>} />
      <Route path="/RFIHub" element={<LayoutWrapper currentPageName="RFIHub"><RFIHub /></LayoutWrapper>} />
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
              <AuthenticatedApp />
            </Router>
            <Toaster />
          </QueryClientProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App
