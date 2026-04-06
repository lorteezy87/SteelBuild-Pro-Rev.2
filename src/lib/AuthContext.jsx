import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  // Kept for API compatibility with components that read this flag
  const [isLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
  // Kept for API compatibility; no longer populated
  const [appPublicSettings] = useState(null);

  const mapSupabaseUser = async (sbUser) => {
    if (!sbUser) return null;
    // Fetch role from user_profiles (server-authoritative) rather than client-modifiable user_metadata
    let role = 'user';
    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', sbUser.id)
        .single();
      if (profile?.role) role = profile.role;
    } catch {
      // Fall back to 'user' if profile fetch fails
    }
    return {
      id: sbUser.id,
      email: sbUser.email,
      full_name: sbUser.user_metadata?.full_name || sbUser.user_metadata?.name || sbUser.email,
      role,
      ...sbUser.user_metadata,
    };
  };

  // Listen for Supabase auth state changes
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setUser(await mapSupabaseUser(session.user));
        setIsAuthenticated(true);
        setAuthError(null);
      } else {
        setUser(null);
        setIsAuthenticated(false);
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
      }
      setIsLoadingAuth(false);
    });

    // Subscribe to future auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setUser(await mapSupabaseUser(session.user));
        setIsAuthenticated(true);
        setAuthError(null);
      } else {
        setUser(null);
        setIsAuthenticated(false);
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
      }
      setIsLoadingAuth(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const loginWithPassword = async ({ email, password }) => {
    setAuthError(null);
    setIsLoadingAuth(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setUser(await mapSupabaseUser(data.user));
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
      return { success: true };
    } catch (error) {
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      const authErr = { type: 'auth_required', message: error.message || 'Login failed' };
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

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
