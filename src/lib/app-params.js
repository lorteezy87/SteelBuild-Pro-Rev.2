/**
 * app-params.js
 *
 * Minimal app configuration — kept for backward compatibility with any code
 * that still imports from this module.
 *
 * Supabase configuration is read directly from environment variables in
 * src/lib/supabase.js via VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
 */
export const appParams = {
  appId: import.meta.env.VITE_SUPABASE_URL || '',
  appBaseUrl: typeof window !== 'undefined' ? window.location.origin : '',
};
