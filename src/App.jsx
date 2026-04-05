import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import AuthCallbackError from '@/components/AuthCallbackError';
import LocalLoginForm from '@/components/LocalLoginForm';
import { ThemeProvider } from '@/components/shared/ThemeContext';
import Landing from './pages/Landing';
import RFIHub from './pages/RFIHub';

const { Pages, Layout } = pagesConfig;
const mainPageKey = "Landing";
const MainPageComponent = Landing;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const hasStoredToken = () => {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(
      window.localStorage.getItem('base44_access_token') ||
      window.localStorage.getItem('token')
    );
  } catch (error) {
    console.error('Failed to inspect local auth token:', error);
    return false;
  }
};

const hasLoginAttempt = () => {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem('base44_login_attempted') === 'true';
  } catch (error) {
    console.error('Failed to inspect login attempt state:', error);
    return false;
  }
};

const isLocalDevHost = () => {
  if (typeof window === 'undefined') return false;
  return ['localhost', '127.0.0.1'].includes(window.location.hostname);
};

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, loginWithPassword } = useAuth();

  // Show loading spinner while checking app public settings or auth
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

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      if (isLocalDevHost()) {
        return (
          <LocalLoginForm
            onSubmit={loginWithPassword}
            isSubmitting={isLoadingAuth}
            errorMessage={authError?.message}
          />
        );
      }

      // Expired/rejected token — clear it and redirect to fresh login
      if (hasStoredToken()) {
        try {
          window.localStorage.removeItem('base44_access_token');
          window.localStorage.removeItem('token');
          window.sessionStorage.removeItem('base44_login_attempted');
        } catch {}
        navigateToLogin();
        return null;
      }

      if (hasLoginAttempt()) {
        return (
          <AuthCallbackError
            authError={authError}
            hasToken={hasStoredToken()}
            onRetry={navigateToLogin}
          />
        );
      }

      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route
        path="/"
        element={
          <LayoutWrapper currentPageName="Landing">
            <MainPageComponent />
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
  )
}

export default App
