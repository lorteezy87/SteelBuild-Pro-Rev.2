import React, { createContext, useState, useContext, useEffect, useRef, type ReactNode } from 'react';
import type { Session, User as SupabaseUser } from '@supabase/supabase-js';
import * as Sentry from '@sentry/react';
import { supabase } from '@/lib/supabase';
import { stripPrivilegeMeta } from '@/lib/authMeta';
import { queryClientInstance } from '@/lib/query-client';

// Clear every trace of the previous user's tenant data from the browser so it
// can never render for the next user on a shared device (M38): the React Query
// cache and any offline field-capture outboxes in localStorage.
function clearTenantClientState(): void {
  queryClientInstance.clear();
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sbp:field:outbox:')) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // localStorage may be unavailable (private mode / SSR) — best-effort.
  }
}

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

export type SignUpResult =
  | { success: true; needsConfirmation: boolean }
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
  signUpWithPassword: (creds: { email: string; password: string; fullName?: string }) => Promise<SignUpResult>;
  // H22 — self-serve credential recovery/rotation.
  isPasswordRecovery: boolean;
  sendPasswordReset: (email: string) => Promise<{ success: boolean; error?: string }>;
  updatePassword: (newPassword: string) => Promise<{ success: boolean; error?: string }>;
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
  // True while the user is in a Supabase PASSWORD_RECOVERY session (arrived via
  // the emailed reset link). AuthenticatedApp renders the set-new-password screen
  // instead of the normal app so the recovery session is used only to set a new
  // password, then cleared. (H22)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

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
    // user_metadata is client-writable — strip privilege keys and place the
    // server-authoritative fields LAST so metadata can never override `role`
    // (which would otherwise open the client admin gates).
    return {
      ...stripPrivilegeMeta(meta),
      id: sbUser.id,
      email: sbUser.email,
      full_name: fullName,
      role,
    };
  };

  // Tracks the id of the currently signed-in user across auth events so we can
  // detect a user CHANGE (a different person signs in on a shared device) and
  // wipe the previous user's cached tenant data before theirs renders (M38).
  const currentUserIdRef = useRef<string | null>(null);

  // Attribute Sentry events to an OPAQUE user id (no email / PII — M15) when
  // signed in, and clear it on sign-out. Also wipes the previous user's client
  // state whenever the signed-in identity changes or clears (M38).
  const syncIdentity = (nextUserId: string | null): void => {
    const prevUserId = currentUserIdRef.current;
    if (nextUserId) {
      if (prevUserId && prevUserId !== nextUserId) {
        // Different user signed in on this device — drop the old tenant's data.
        clearTenantClientState();
      }
      Sentry.setUser({ id: nextUserId });
    } else if (prevUserId) {
      // Session ended — clear attribution and cached tenant data.
      Sentry.setUser(null);
      clearTenantClientState();
    }
    currentUserIdRef.current = nextUserId;
  };

  // Listen for Supabase auth state changes
  useEffect(() => {
    const handleSession = async (session: Session | null, event?: string) => {
      try {
        if (session?.user) {
          syncIdentity(session.user.id);
          setUser(await mapSupabaseUser(session.user));
          setIsAuthenticated(true);
          setAuthError(null);
        } else {
          // Session is null/expired — try refreshing before giving up
          try {
            const { data: refreshData } = await supabase.auth.refreshSession();
            if (refreshData?.session?.user) {
              syncIdentity(refreshData.session.user.id);
              setUser(await mapSupabaseUser(refreshData.session.user));
              setIsAuthenticated(true);
              setAuthError(null);
              return;
            }
          } catch {
            // Refresh failed — fall through to logout
          }
          // Real sign-out (explicit SIGNED_OUT event or unrecoverable session):
          // clear Sentry attribution + the previous user's client state.
          if (event === 'SIGNED_OUT' || currentUserIdRef.current) {
            syncIdentity(null);
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // The emailed reset link establishes a recovery session and fires this
      // event; flag it so the app shows the set-new-password screen (H22).
      if (event === 'PASSWORD_RECOVERY') setIsPasswordRecovery(true);
      handleSession(session, event);
    });

    return () => subscription.unsubscribe();
  }, []);

  const loginWithPassword = async ({ email, password }: { email: string; password: string }): Promise<LoginResult> => {
    setAuthError(null);
    setIsLoadingAuth(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      syncIdentity(data.user?.id ?? null);
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

  const signUpWithPassword = async (
    { email, password, fullName }: { email: string; password: string; fullName?: string },
  ): Promise<SignUpResult> => {
    try {
      // Record provable acceptance of the Terms of Service + Privacy Policy at
      // sign-up (H12). These land in user_metadata alongside full_name so each
      // account carries a durable, per-user acceptance timestamp + version.
      const signUpMeta: Record<string, unknown> = {
        terms_accepted_at: new Date().toISOString(),
        terms_version: '2026-07-01',
      };
      if (fullName) signUpMeta.full_name = fullName;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
          data: signUpMeta,
        },
      });
      if (error) throw error;
      // With email confirmation ON, signUp returns no session until the user clicks
      // the emailed link — stay on Landing (do NOT clear authError, that's what keeps
      // the sign-in screen mounted). With it OFF, a session is returned: sign them in.
      if (!data.session) {
        return { success: true, needsConfirmation: true };
      }
      syncIdentity(data.user?.id ?? null);
      setUser(await mapSupabaseUser(data.user));
      setIsAuthenticated(true);
      setAuthError(null);
      return { success: true, needsConfirmation: false };
    } catch (error: unknown) {
      const err = error as { message?: string; status?: number } | undefined;
      let message = err?.message || 'Sign-up failed';
      if (error instanceof TypeError && /fetch/i.test(message)) {
        message = 'Unable to reach the authentication server. Check your connection.';
      } else if (/already registered|already exists|user already/i.test(message)) {
        message = 'An account with that email already exists — try signing in.';
      }
      return { success: false, error: { type: 'auth_required', message } };
    }
  };

  // Send the password-reset email. `redirectTo` must be on the Supabase Auth
  // "Redirect URLs" allowlist (dashboard) — see docs/runbooks/owner-checklist.md.
  const sendPasswordReset = async (email: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const redirectTo =
        typeof window !== 'undefined' ? `${window.location.origin}/update-password` : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      return { success: true };
    } catch (error: unknown) {
      const err = error as { message?: string } | undefined;
      let message = err?.message || 'Could not send the reset email.';
      if (error instanceof TypeError && /fetch/i.test(message)) {
        message = 'Unable to reach the authentication server. Check your connection.';
      }
      return { success: false, error: message };
    }
  };

  // Set a new password. Used both from the recovery screen (H22) and from
  // Settings → Profile for a signed-in user rotating their credential.
  const updatePassword = async (newPassword: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setIsPasswordRecovery(false);
      return { success: true };
    } catch (error: unknown) {
      const err = error as { message?: string } | undefined;
      return { success: false, error: err?.message || 'Could not update your password.' };
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    // Clear Sentry attribution + wipe the previous user's cached tenant data /
    // offline outboxes so nothing carries over on a shared device (M38).
    syncIdentity(null);
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
      syncIdentity(session.user.id);
      setUser(await mapSupabaseUser(session.user));
      setIsAuthenticated(true);
      setAuthError(null);
    } else {
      // Try refreshing the session before giving up
      try {
        const { data: refreshData } = await supabase.auth.refreshSession();
        if (refreshData?.session?.user) {
          syncIdentity(refreshData.session.user.id);
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
      signUpWithPassword,
      isPasswordRecovery,
      sendPasswordReset,
      updatePassword,
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
