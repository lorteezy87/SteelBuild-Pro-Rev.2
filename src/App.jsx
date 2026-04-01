import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClientInstance } from "@/lib/query-client";
import { pagesConfig } from "./pages.config";
import { BrowserRouter as Router, Route, Routes, useLocation } from "react-router-dom";
import PageNotFound from "./lib/PageNotFound";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import UserNotRegisteredError from "@/components/UserNotRegisteredError";
import AuthCallbackError from "@/components/AuthCallbackError";
import LocalLoginForm from "@/components/LocalLoginForm";
import { ThemeProvider } from "@/components/shared/ThemeContext";

const { Pages, Layout, mainPage } = pagesConfig;
const MainPageComponent = Pages[mainPage];

const LayoutWrapper = ({ children, currentPageName }) =>
  Layout ? (
    <Layout currentPageName={currentPageName}>{children}</Layout>
  ) : (
    <>{children}</>
  );

const hasStoredToken = () => {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(
      window.localStorage.getItem("base44_access_token") ||
        window.localStorage.getItem("token")
    );
  } catch (error) {
    console.error("Failed to inspect local auth token:", error);
    return false;
  }
};

const hasLoginAttempt = () => {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem("base44_login_attempted") === "true";
  } catch (error) {
    console.error("Failed to inspect login attempt state:", error);
    return false;
  }
};

const isLocalDevHost = () => {
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
};

const AuthenticatedApp = () => {
  const location = useLocation();
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, loginWithPassword } =
    useAuth();

  const publicRoutes = new Set(["/", `/${mainPage}`]);
  const isPublicLandingRoute = publicRoutes.has(location.pathname);

  if ((isLoadingPublicSettings || isLoadingAuth) && !isPublicLandingRoute) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-page)",
        }}
      >
        <div
          style={{
            width: "32px",
            height: "32px",
            border: "3px solid var(--border-default)",
            borderTop: "3px solid var(--accent)",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (authError) {
    if (authError.type === "user_not_registered") {
      return <UserNotRegisteredError />;
    }

    if (authError.type === "auth_required") {
      if (isPublicLandingRoute) {
        return (
          <Routes>
            <Route path="/" element={<MainPageComponent />} />
            <Route path={`/${mainPage}`} element={<MainPageComponent />} />
            <Route path="*" element={<PageNotFound />} />
          </Routes>
        );
      }

      if (isLocalDevHost()) {
        return (
          <LocalLoginForm
            onSubmit={loginWithPassword}
            isSubmitting={isLoadingAuth}
            errorMessage={authError?.message}
          />
        );
      }

      if (hasStoredToken() || hasLoginAttempt()) {
        return (
          <AuthCallbackError
            authError={authError}
            hasToken={hasStoredToken()}
            onRetry={navigateToLogin}
          />
        );
      }

      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route path="/" element={<MainPageComponent />} />
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
  );
}

export default App;
