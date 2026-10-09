import React, { createContext, useState, useContext, useEffect, useRef, type ReactNode } from 'react';
import type { Session, User as SupabaseUser } from '@supabase/supabase-js';
import * as Sentry from '@sentry/react';
import { supabase } from '@/lib/supabase';
import { stripPrivilegeMeta } from '@/lib/authMeta';
import { queryClientInstance } from '@/lib/query-client';
import { clearPendingPhotos } from '@/lib/field/blobStore';
import { assertTermsAccepted, TERMS_VERSION } from '@/lib/signupClickwrap';
import { passwordResetRedirect } from '@/lib/authRedirects';
import { ACTIVE_PROJECT_ID_KEY, PROJECTS_CACHE_KEY } from '@/lib/projectSelection';
import { setActiveOrgId } from '@/lib/activeOrg';
import { isNativePlatform } from '@/lib/native/platform';

// Clear every trace of the previous user's tenant data from the browser so it
// can never render for the next user on a shared device (M38): the React Query
// cache, the offline field-capture outbox in localStorage, AND the pending
// photo blobs in IndexedDB (the outbox ops and their blobs must go together).
function clearTenantClientState(): void {
  queryClientInstance.clear();
  setActiveOrgId(null);
  try {
    // Only cached server data and identity selections; preserve user-created
    // local notes, crane libraries, and unrelated appearance preferences.
    for (const key of [PROJECTS_CACHE_KEY, ACTIVE_PROJECT_ID_KEY, 'sbp:current-org',
      '__steelbuild_recent_searches']) localStorage.removeItem(key);
    sessionStorage.removeItem('sbp-landing-redirected');
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sbp:field:outbox:')) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // localStorage may be unavailable (private mode / SSR) — best-effort.
  }
  // Fire-and-forget: async IndexedDB wipe of any offline photo blobs. Best-effort
  // and self-guarding (no-op when IndexedDB is unavailable).
  void clearPendingPhotos();
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
  /** True while a credential sign-in is in flight (distinct from bootstrap). */
  isLoggingIn: boolean;
  isLoadingPublicSettings: boolean;
  authError: AuthError | null;
  appPublicSettings: unknown;
  logout: () => Promise<void>;
  loginWithPassword: (creds: { email: string; password: string }) => Promise<LoginResult>;
  signUpWithPassword: (creds: {
    email: string;
    password: string;
    fullName?: string;
    termsAccepted?: boolean;
  }) => Promise<SignUpResult>;
  // H22 — self-serve credential recovery/rotation.
  isPasswordRecovery: boolean;
  sendPasswordReset: (email: string) => Promise<{ success: boolean; error?: string }>;
  updatePassword: (newPassword: string) => Promise<{ success: boolean; error?: string }>;
  // H23 — TOTP multi-factor auth. `mfaRequired` gates the app when the session
  // is aal1 but the user has a verified factor (must step up before entering).
  mfaRequired: boolean;
  /** Blocks entry while an unverified session's MFA status is unresolved. */
  isCheckingMfa: boolean;
  mfaStatusDegraded: boolean;
  mfaStatusMessage: string | null;
  retryMfaStatus: () => Promise<void>;
  listMfaFactors: () => Promise<Array<{ id: string; friendlyName: string; status: string }>>;
  enrollMfa: () => Promise<{ success: boolean; factorId?: string; qrCode?: string; secret?: string; uri?: string; error?: string }>;
  verifyMfaFactor: (factorId: string, code: string) => Promise<{ success: boolean; error?: string }>;
  completeMfaChallenge: (code: string) => Promise<{ success: boolean; error?: string }>;
  unenrollMfa: (factorId: string) => Promise<{ success: boolean; error?: string }>;
  navigateToLogin: () => void;
  checkAppState: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type AuthProviderProps = { children: ReactNode };

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const signOutInFlightRef = useRef(false);
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
  // True when the current session is aal1 but the user has a verified TOTP
  // factor (i.e. must complete an MFA challenge before entering the app). H23.
  const [mfaRequired, setMfaRequired] = useState(false);
  const [isCheckingMfa, setIsCheckingMfa] = useState(true);
  const mfaGenerationRef = useRef(0);
  const mfaSatisfiedUserRef = useRef<string | null>(null);
  const currentSessionAccessTokenRef = useRef<string | null>(null);
  const sessionGenerationRef = useRef(0);
  const [mfaStatusDegraded, setMfaStatusDegraded] = useState(false);
  const [mfaStatusMessage, setMfaStatusMessage] = useState<string | null>(null);

  // Recompute whether the session needs an MFA step-up. Fail closed on AAL
  // lookup errors: block app entry until the MFA state can be confirmed.
  const refreshMfaRequired = async (allowBackground = false): Promise<void> => {
    const generation = ++mfaGenerationRef.current;
    const checkingUserId = currentUserIdRef.current;
    // A routine renewal of the already-verified identity must not unmount
    // project forms. First sign-in, identity changes, and previous failures
    // still hold the app behind the MFA barrier until this request settles.
    const previouslySatisfied = Boolean(checkingUserId && mfaSatisfiedUserRef.current === checkingUserId);
    setIsCheckingMfa(!(allowBackground && previouslySatisfied));
    try {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error || !data || !data.currentLevel || !data.nextLevel) {
        throw error ?? new Error('MFA status unavailable');
      }
      if (generation !== mfaGenerationRef.current) return;
      const requiresChallenge = data.currentLevel === 'aal1' && data.nextLevel === 'aal2';
      mfaSatisfiedUserRef.current = requiresChallenge ? null : checkingUserId;
      setMfaRequired(requiresChallenge);
      setMfaStatusDegraded(false);
      setMfaStatusMessage(null);
    } catch {
      if (generation !== mfaGenerationRef.current) return;
      mfaSatisfiedUserRef.current = null;
      setMfaRequired(true);
      setMfaStatusDegraded(true);
      setMfaStatusMessage('We could not verify your MFA status. Retry to continue or sign out.');
    } finally {
      if (generation === mfaGenerationRef.current) setIsCheckingMfa(false);
    }
  };

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
      created_date: sbUser.created_at,
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
    if (prevUserId !== nextUserId) setSignOutFailed(false);
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

  // All ways of accepting a session share the same MFA barrier. Generation
  // checks prevent profile/MFA responses from a previous identity winning later.
  const publishSessionUser = async (sbUser: SupabaseUser, accessToken: string | null, allowBackground = false): Promise<void> => {
    const generation = ++sessionGenerationRef.current;
    ++mfaGenerationRef.current;
    const preserveVerifiedSession = allowBackground &&
      currentUserIdRef.current === sbUser.id && mfaSatisfiedUserRef.current === sbUser.id;
    if (!preserveVerifiedSession) mfaSatisfiedUserRef.current = null;
    setIsCheckingMfa(!preserveVerifiedSession);
    currentSessionAccessTokenRef.current = accessToken;
    syncIdentity(sbUser.id);
    const nextUser = await mapSupabaseUser(sbUser);
    if (generation !== sessionGenerationRef.current) return;
    setUser(nextUser);
    setIsAuthenticated(true);
    setAuthError(null);
    await refreshMfaRequired(preserveVerifiedSession);
  };

  const clearSessionUser = (): void => {
    mfaSatisfiedUserRef.current = null;
    currentSessionAccessTokenRef.current = null;
    ++sessionGenerationRef.current;
    ++mfaGenerationRef.current;
    syncIdentity(null);
    setUser(null);
    setIsAuthenticated(false);
    setIsCheckingMfa(false);
    setMfaRequired(false);
    setMfaStatusDegraded(false);
    setMfaStatusMessage(null);
  };

  // Listen for Supabase auth state changes
  useEffect(() => {
    const handleSession = async (session: Session | null, event?: string) => {
      const generation = sessionGenerationRef.current;
      try {
        if (event === 'SIGNED_OUT') {
          clearSessionUser();
          setAuthError({ type: 'auth_required', message: 'Authentication required' });
          return;
        }
        if (session?.user) {
          await publishSessionUser(
            session.user,
            session.access_token,
            event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED' ||
              // Supabase also emits SIGNED_IN when a tab regains focus.
              // Only an identical current session may reuse its prior proof;
              // a new same-user login still waits for its own MFA result.
              (event === 'SIGNED_IN' && Boolean(session.access_token) &&
                currentSessionAccessTokenRef.current === session.access_token),
          );
        } else {
          // Session is null/expired — try refreshing before giving up
          try {
            const { data: refreshData } = await supabase.auth.refreshSession();
            if (generation !== sessionGenerationRef.current) return;
            if (refreshData?.session?.user) {
              await publishSessionUser(refreshData.session.user, refreshData.session.access_token);
              return;
            }
          } catch {
            // Refresh failed — fall through to logout
          }
          if (generation !== sessionGenerationRef.current) return;
          clearSessionUser();
          setAuthError({ type: 'auth_required', message: 'Authentication required' });
        }
      } catch {
        if (generation !== sessionGenerationRef.current) return;
        clearSessionUser();
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
      } finally {
        setIsLoadingAuth(false);
      }
    };

    // Get initial session — handles expired/invalid tokens by returning null session
    const initialGeneration = sessionGenerationRef.current;
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (initialGeneration === sessionGenerationRef.current) return handleSession(session);
      })
      .catch(() => {
        if (initialGeneration !== sessionGenerationRef.current) return;
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

    return () => {
      ++sessionGenerationRef.current;
      ++mfaGenerationRef.current;
      subscription.unsubscribe();
    };
  }, []);

  const loginWithPassword = async ({ email, password }: { email: string; password: string }): Promise<LoginResult> => {
    setIsLoggingIn(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.user) throw new Error('Sign-in did not return a user.');
      await publishSessionUser(data.user, data.session?.access_token ?? null);
      return { success: true };
    } catch (error: unknown) {
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
    } finally {
      setIsLoggingIn(false);
    }
  };

  const signUpWithPassword = async (
    { email, password, fullName, termsAccepted }: {
      email: string;
      password: string;
      fullName?: string;
      termsAccepted?: boolean;
    },
  ): Promise<SignUpResult> => {
    try {
      // H12 clickwrap: Landing requires an affirmative checkbox before calling
      // us. Refuse to mint acceptance metadata unless that flag is true so a
      // non-UI caller cannot forge "accepted" without the UI gate.
      try {
        assertTermsAccepted(termsAccepted);
      } catch (gateErr) {
        const authErr: AuthError = {
          type: 'auth_required',
          message: gateErr instanceof Error ? gateErr.message : 'Terms acceptance required.',
        };
        return { success: false, error: authErr };
      }
      // Record provable acceptance of the Terms of Service + Privacy Policy at
      // sign-up (H12). These land in user_metadata alongside full_name so each
      // account carries a durable, per-user acceptance timestamp + version.
      const signUpMeta: Record<string, unknown> = {
        terms_accepted_at: new Date().toISOString(),
        terms_version: TERMS_VERSION,
        terms_acceptance: 'clickwrap',
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
      if (!data.user) throw new Error('Sign-up did not return a user.');
      await publishSessionUser(data.user, data.session?.access_token ?? null);
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
      const redirectTo = passwordResetRedirect(
        typeof window !== 'undefined' ? window.location.origin : undefined,
        isNativePlatform(),
      );
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

  // ── MFA (TOTP) — H23 ──────────────────────────────────────────────────────
  const listMfaFactors = async (): Promise<Array<{ id: string; friendlyName: string; status: string }>> => {
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      return (data?.totp ?? []).map((f) => ({ id: f.id, friendlyName: f.friendly_name ?? 'Authenticator', status: f.status }));
    } catch {
      return [];
    }
  };

  const enrollMfa = async (): Promise<{ success: boolean; factorId?: string; qrCode?: string; secret?: string; uri?: string; error?: string }> => {
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (error) throw error;
      return { success: true, factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret, uri: data.totp.uri };
    } catch (error: unknown) {
      const err = error as { message?: string } | undefined;
      return { success: false, error: err?.message || 'Could not start MFA enrollment.' };
    }
  };

  // Challenge + verify a specific factor. Used both to confirm a freshly enrolled
  // factor and to satisfy the login step-up. On success the session upgrades to
  // aal2, so recompute the gate.
  const verifyMfaFactor = async (factorId: string, code: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data, error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      if (error) throw error;
      if (!data?.user || !data.access_token || currentUserIdRef.current !== data.user.id) {
        throw new Error('Your session changed. Please sign in again.');
      }
      // AAL1 profile reads are denied by the server MFA hook. Publish the
      // verified profile before releasing the gate; a separate AAL refresh
      // could otherwise outrun the MFA_CHALLENGE_VERIFIED profile lookup.
      await publishSessionUser(data.user, data.access_token);
      return { success: true };
    } catch (error: unknown) {
      const err = error as { message?: string } | undefined;
      return { success: false, error: err?.message || 'That code was not accepted. Try again.' };
    }
  };

  const completeMfaChallenge = async (code: string): Promise<{ success: boolean; error?: string }> => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error || !data) return { success: false, error: 'Could not load your authenticator. Sign out and try again.' };
    const factor = data.totp.find((f) => f.status === 'verified') ?? data.totp[0];
    if (!factor) return { success: false, error: 'No authenticator is enrolled on this account.' };
    return verifyMfaFactor(factor.id, code);
  };

  const unenrollMfa = async (factorId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      await refreshMfaRequired();
      return { success: true };
    } catch (error: unknown) {
      const err = error as { message?: string } | undefined;
      return { success: false, error: err?.message || 'Could not remove that authenticator.' };
    }
  };

  const logout = async (): Promise<void> => {
    if (signOutInFlightRef.current) return;
    signOutInFlightRef.current = true;
    setIsSigningOut(true);
    const signingOutUserId = currentUserIdRef.current;
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      // The SDK clears its persisted session only after a successful sign-out.
      // Do not erase a different identity that arrived while this request ran.
      if (currentUserIdRef.current === signingOutUserId) {
        clearSessionUser();
        setSignOutFailed(false);
      }
    } catch {
      // Both returned and thrown failures leave the SDK session intact. Keep
      // the app and tenant data intact too, and show a retryable, honest state.
      // This message is generic: never expose server errors or session values.
      if (signingOutUserId && currentUserIdRef.current === signingOutUserId) {
        setSignOutFailed(true);
      }
    } finally {
      signOutInFlightRef.current = false;
      setIsSigningOut(false);
    }
  };

  const retryMfaStatus = async (): Promise<void> => {
    await refreshMfaRequired();
  };

  const navigateToLogin = () => {
    // Auth UI is owned by AuthenticatedApp (Landing / MFA / OrgOnboarding).
    // Nothing to do here; the auth state change will trigger the UI update.
  };

  const checkAppState = async () => {
    const generation = sessionGenerationRef.current;
    setIsLoadingAuth(true);
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (generation !== sessionGenerationRef.current) return;
      if (error) throw error;
      if (session?.user) {
        await publishSessionUser(session.user, session.access_token);
        return;
      }
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (generation !== sessionGenerationRef.current) return;
      if (refreshError) throw refreshError;
      if (refreshData?.session?.user) {
        await publishSessionUser(refreshData.session.user, refreshData.session.access_token);
      } else {
        clearSessionUser();
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
      }
    } catch {
      if (generation !== sessionGenerationRef.current) return;
      clearSessionUser();
      setAuthError({ type: 'auth_required', message: 'Unable to reach authentication server.' });
    } finally {
      setIsLoadingAuth(false);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoggingIn,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      logout,
      loginWithPassword,
      signUpWithPassword,
      isPasswordRecovery,
      sendPasswordReset,
      updatePassword,
      mfaRequired,
      isCheckingMfa,
      mfaStatusDegraded,
      mfaStatusMessage,
      retryMfaStatus,
      listMfaFactors,
      enrollMfa,
      verifyMfaFactor,
      completeMfaChallenge,
      unenrollMfa,
      navigateToLogin,
      checkAppState,
    }}>
      {children}
      {signOutFailed && (
        <section
          role="alert"
          aria-label="Sign-out failed"
          style={{
            position: 'fixed', insetInlineEnd: 16, bottom: 16, zIndex: 2000,
            width: 'min(420px, calc(100vw - 32px))', padding: 16,
            border: '1px solid var(--border-strong, var(--border-default))',
            borderRadius: 12, background: 'var(--bg-elevated, var(--bg-surface))',
            color: 'var(--text-primary)', boxShadow: 'var(--shadow-lg)',
          }}
        >
          <p style={{ margin: '0 0 12px', lineHeight: 1.5 }}>
            Sign-out did not complete. You are still signed in. Check your connection and try again.
          </p>
          <button
            type="button"
            className="sbd-btn sbd-btn-primary"
            disabled={isSigningOut}
            aria-busy={isSigningOut}
            onClick={() => { void logout(); }}
          >
            {isSigningOut ? 'Signing out…' : 'Retry sign out'}
          </button>
        </section>
      )}
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
