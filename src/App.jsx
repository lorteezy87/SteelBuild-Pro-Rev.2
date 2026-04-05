import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { ThemeProvider } from '@/components/shared/ThemeContext';
import Landing from './pages/Landing';
import RFIHub from './pages/RFIHub';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, isAuthenticated } = useAuth();

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

  // User exists but not registered in this app
  if (authError?.type === 'user_not_registered') {
    return <UserNotRegisteredError />;
  }

  // Any auth error or simply not authenticated → go to login
  if (authError || !isAuthenticated) {
    navigateToLogin();
    return null;
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
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
      <Route path="/Landing" element={<Landing />} />
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