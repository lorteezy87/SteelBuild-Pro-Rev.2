import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter as Router } from "react-router-dom";
import { queryClientInstance } from "@/lib/query-client";
import { AuthProvider } from "@/lib/AuthContext";
import { ThemeProvider } from "@/components/shared/ThemeContext";
import { ProjectProvider } from "@/components/shared/ProjectContext";
import ErrorBoundary from "@/components/ErrorBoundary";

/**
 * AppProviders — the production provider stack.
 *
 * Order matters and is load-bearing:
 *
 *   ErrorBoundary       — outermost so a provider crash still shows the
 *                         recovery UI.
 *   ThemeProvider       — sets `data-theme` on <html> before children render.
 *   AuthProvider        — gates the rest of the tree on auth state; consumers
 *                         downstream call `useAuth()`.
 *   QueryClientProvider — wraps everything that calls `useQuery`. Must be
 *                         INSIDE AuthProvider because react-query side-effects
 *                         (auto-refetch on mount) start firing as soon as
 *                         children mount, and we want those to see the auth
 *                         context.
 *   Router              — react-router-dom <BrowserRouter>; required for
 *                         `useLocation` / `useNavigate` in ProjectProvider
 *                         and downstream hooks.
 *   ProjectProvider     — exposes the active-project selection. Inside the
 *                         router because it reads/writes URL params via
 *                         downstream hooks.
 *
 * Sonner's <Toaster> is mounted inside Layout (not here) so toasts only
 * render once the chrome is up.
 */
export default function AppProviders({ children }) {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <QueryClientProvider client={queryClientInstance}>
            <Router>
              <ProjectProvider>
                {children}
              </ProjectProvider>
            </Router>
          </QueryClientProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
