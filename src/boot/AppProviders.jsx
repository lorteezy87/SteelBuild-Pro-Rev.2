import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter as Router } from "react-router-dom";
import { queryClientInstance } from "@/lib/query-client";
import { AuthProvider } from "@/lib/AuthContext";
import { ThemeProvider } from "@/components/shared/ThemeContext";
import { OutboxProvider } from "@/lib/field/OutboxContext";
import ErrorBoundary from "@/components/ErrorBoundary";

/**
 * AppProviders - production provider stack.
 *
 * Order matters:
 * - ErrorBoundary: catches provider-level crashes.
 * - ThemeProvider: sets html theme attributes before children render.
 * - AuthProvider: resolves Supabase auth before the app shell mounts.
 * - QueryClientProvider: scopes React Query under auth.
 * - OutboxProvider: the single app-wide offline field-capture outbox (drains
 *   on reconnect from any page); needs QueryClient, sits above the Router.
 * - Router: provides route matching, navigation, and URL state.
 *
 * ProjectProvider mounts inside AuthenticatedApp after auth succeeds, so
 * project data is not loaded before authentication resolves.
 */
export default function AppProviders({ children }) {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <QueryClientProvider client={queryClientInstance}>
            <OutboxProvider>
              <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                {children}
              </Router>
            </OutboxProvider>
          </QueryClientProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
