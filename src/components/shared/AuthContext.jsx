import React, {
  createContext, useContext,
  useState, useEffect,
} from 'react';
import { base44 } from '@/api/base44Client';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const me = await base44.auth.me();
        setUser(me);
      } catch (err) {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    loadUser();
  }, []);

  const login = async (email, password) => {
    setError(null);
    try {
      await base44.auth.login(email, password);
      const me = await base44.auth.me();
      setUser(me);
      return { success: true };
    } catch (err) {
      const msg =
        err?.message ||
        'Login failed. Check your credentials and try again.';
      setError(msg);
      return { success: false, error: msg };
    }
  };

  const logout = async () => {
    await base44.auth.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      error,
      login,
      logout,
      isAuthenticated: !!user,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error(
    'useAuth must be used inside AuthProvider'
  );
  return ctx;
}