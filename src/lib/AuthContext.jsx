import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { createAxiosClient } from '@base44/sdk/dist/utils/axios-client';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null); // Contains only { id, public_settings }

  const mapAuthError = (error, fallbackMessage) => {
    if (error?.status === 403 && error?.data?.extra_data?.reason) {
      return {
        type: error.data.extra_data.reason,
        message: error.message || fallbackMessage,
      };
    }

    if (error?.status === 401 || error?.status === 403) {
      return {
        type: 'auth_required',
        message: error?.message || fallbackMessage,
      };
    }

    return {
      type: 'unknown',
      message: error?.message || fallbackMessage,
    };
  };

  const markLoginAttempt = () => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem('base44_login_attempted', 'true');
    } catch (error) {
      console.error('Failed to store login attempt state:', error);
    }
  };

  const clearLoginAttempt = () => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.removeItem('base44_login_attempted');
    } catch (error) {
      console.error('Failed to clear login attempt state:', error);
    }
  };

  useEffect(() => {
    checkAppState();
  }, []);

  const checkAppState = async () => {
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);
      
      // First, check app public settings (with token if available)
      // This will tell us if auth is required, user not registered, etc.
      const appClient = createAxiosClient({
        baseURL: `/api/apps/public`,
        headers: {
          'X-App-Id': appParams.appId
        },
        token: appParams.token, // Include token if available
        interceptResponses: true
      });
      
      try {
        const publicSettings = await appClient.get(`/prod/public-settings/by-id/${appParams.appId}`);
        setAppPublicSettings(publicSettings);
        
        // If we got the app public settings successfully, check if user is authenticated
        if (appParams.token) {
          await checkUserAuth();
        } else {
          setIsLoadingAuth(false);
          setIsAuthenticated(false);
        }
        setIsLoadingPublicSettings(false);
      } catch (appError) {
        console.error('App state check failed:', appError);

        setAuthError(mapAuthError(appError, 'Failed to load app'));
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      setAuthError(mapAuthError(error, 'An unexpected error occurred'));
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  const checkUserAuth = async () => {
    try {
      // Now check if the user is authenticated
      setIsLoadingAuth(true);
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
      clearLoginAttempt();
    } catch (error) {
      console.error('User auth check failed:', error);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);

      setAuthError(mapAuthError(error, 'Authentication required'));
    }
  };

  const loginWithPassword = async ({ email, password }) => {
    setAuthError(null);
    setIsLoadingAuth(true);

    try {
      await base44.auth.loginViaEmailPassword(email, password);
      await checkUserAuth();
      return { success: true };
    } catch (error) {
      console.error('Password login failed:', error);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      setAuthError(mapAuthError(error, 'Login failed'));
      return {
        success: false,
        error: mapAuthError(error, 'Login failed'),
      };
    }
  };

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    clearLoginAttempt();
    
    if (shouldRedirect) {
      // Use the SDK's logout method which handles token cleanup and redirect
      base44.auth.logout(window.location.href);
    } else {
      // Just remove the token without redirect
      base44.auth.logout();
    }
  };

  const navigateToLogin = () => {
    markLoginAttempt();
    // Use the SDK's redirectToLogin method
    base44.auth.redirectToLogin(window.location.href);
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
      checkAppState
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
