import React, { createContext, useState, useContext, useEffect, type ReactNode } from 'react';
import type { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export type AppUser = {
  id: string;
  email: string | undefined;
  full_name: string | undefined;
  role: string;
  // Spread of user_metadata — keep open for arbitrary keys
  [key: string]: unknown;
};

export type AuthError = {
  type: 'auth_required';
  message: string;
};

export type LoginResult =
  | { success: true }
  | { success: false; error: AuthError };

export type AuthContextValue = {
  user: AppUser | null;
  isAuthenticated: boolean;
  isLoadingAuth: boolean;
  isLoadingPublicSettings: boolean;
  authError: AuthError | null;
  appPublicSettings: unknown;
  logout: () => Promise<void>;
  loginWithPassword: (creds: { email: string; password: string }) => Promise<LoginResult>;
  navigateToLogin: () => void;
  checkAppState: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type AuthProviderProps = { children: ReactNode };

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  // Kept for API compatibility with components that read this flag
  const [isLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState<AuthError | null>(null);
  // Kept for API compatibility; no longer populated
  const [appPublicSettings] = useState<unknown>(null);

  const mapSupabaseUser = async (sbUser: SupabaseUser | null | undefined): Promise<AppUser | null> => {
    if (!sbUser) return null;
    // Fetch role from user_profiles (server-authoritative) rather than client-modifiable user_metadata
    let role = 'user';
    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', sbUser.id)
        .maybeSingle();
      if (profile?.role) role = profile.role;
    } catch {
      // Fall back to 'user' if profile fetch fails
    }
    const meta = (sbUser.user_metadata ?? {}) as Record<string, unknown>;
    const fullName =
      (typeof meta.full_name === 'string' && meta.full_name) ||
      (typeof meta.name === 'string' && meta.name) ||
      sbUser.email ||
      undefined;
    return {
      id: sbUser.id,
      email: sbUser.email,
      full_name: fullName,
      role,
      ...meta,
    };
  };

  // Listen for Supabase auth state changes
  useEffect(() => {
    const handleSession = async (session: Session | null) => {
      try {
        if (session?.user) {
          setUser(await mapSupabaseUser(session.user));
          setIsAuthenticated(true);
          setAuthError(null);
        } else {
          // Session is null/expired — try refreshing before giving up
          try {
            const { data: refreshData } = await supabase.auth.refreshSession();
            if (refreshData?.session?.user) {
              setUser(await mapSupabaseUser(refreshData.session.user));
              setIsAuthenticated(true);
              setAuthError(null);
              return;
            }
          } catch {
            // Refresh failed — fall through to logout
          }
          setUser(null);
          setIsAuthenticated(false);
          setAuthError({ type: 'auth_required', message: 'Authentication required' });
        }
      } catch {
        setUser(null);
        setIsAuthenticated(false);
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
      } finally {
        setIsLoadingAuth(false);
      }
    };

    // Get initial session — handles expired/invalid tokens by returning null session
    supabase.auth.getSession()
      .then(({ data: { session } }) => handleSession(session))
      .catch(() => {
        setIsLoadingAuth(false);
        setIsAuthenticated(false);
        setAuthError({ type: 'auth_required', message: 'Unable to reach authentication server.' });
      });

    // Subscribe to future auth changes (token refresh, sign-out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      handleSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const loginWithPassword = async ({ email, password }: { email: string; password: string }): Promise<LoginResult> => {
    setAuthError(null);
    setIsLoadingAuth(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setUser(await mapSupabaseUser(data.user));
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
      return { success: true };
    } catch (error: unknown) {
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      // Distinguish network/config errors from auth errors
      const err = error as { message?: string; status?: number } | undefined;
      let message = err?.message || 'Login failed';
      if (error instanceof TypeError && /fetch/i.test(message)) {
        message = 'Unable to reach authentication server. Check your network connection or contact your administrator.';
      } else if (err?.status === 400) {
        message = 'Invalid email or password.';
      }
      const authErr: AuthError = { type: 'auth_required', message };
      setAuthError(authErr);
      return { success: false, error: authErr };
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setIsAuthenticated(false);
  };

  const navigateToLogin = () => {
    // In Supabase apps login is handled locally — AuthenticatedApp renders LocalLoginForm
    // Nothing to do here; the auth state change will trigger the UI update.
  };

  const checkAppState = async () => {
    setIsLoadingAuth(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      setUser(await mapSupabaseUser(session.user));
      setIsAuthenticated(true);
      setAuthError(null);
    } else {
      // Try refreshing the session before giving up
      try {
        const { data: refreshData } = await supabase.auth.refreshSession();
        if (refreshData?.session?.user) {
          setUser(await mapSupabaseUser(refreshData.session.user));
          setIsAuthenticated(true);
          setAuthError(null);
          setIsLoadingAuth(false);
          return;
        }
      } catch {
        // Refresh failed — fall through to auth required
      }
      setAuthError({ type: 'auth_required', message: 'Authentication required' });
    }
    setIsLoadingAuth(false);
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      logout,
      loginWithPassword,
      navigateToLogin,
      checkAppState,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
