import React from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter as Router } from "react-router-dom";
import { queryClientInstance } from "@/lib/query-client";
import { AuthProvider } from "@/lib/AuthContext";
import { ThemeProvider } from "@/components/shared/ThemeContext";
import { FeatureFlagProvider } from "@/lib/featureFlags";
import ErrorBoundary from "@/components/ErrorBoundary";
import { Toaster } from "@/components/ui/toaster";

/**
 * Single "providers" wrapper used by both the real app and tests.
 *
 * Composing them here keeps `App.jsx` flat (just routes) and lets test
 * harnesses render any page in the same provider stack as production by
 * importing this component.
 *
 * Order matters:
 *   ErrorBoundary    — outermost so a provider crash still shows the recovery UI
 *   ThemeProvider    — sets `data-theme` on <html> before children render
 *   AuthProvider     — gates the rest of the tree on auth state
 *   QueryClient      — must wrap anything that calls useQuery
 *   Router           — react-router-dom `<BrowserRouter>`
 *   Toaster          — sibling so toasts render above the route content
 */
export default function AppProviders({ children }) {
  return (
    <ErrorBoundary>
      <FeatureFlagProvider>
        <ThemeProvider>
          <AuthProvider>
            <QueryClientProvider client={queryClientInstance}>
              <Router>
                {children}
              </Router>
              <Toaster />
            </QueryClientProvider>
          </AuthProvider>
        </ThemeProvider>
      </FeatureFlagProvider>
    </ErrorBoundary>
  );
}
