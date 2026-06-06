/**
 * app-params.js
 *
 * Minimal app configuration — kept for backward compatibility with any code
 * that still imports from this module.
 *
 * Supabase configuration is centralized + validated in src/lib/env.ts; this
 * shim just re-derives the legacy appId from it for back-compat.
 */
import { env } from '@/lib/env';

export const appParams = {
  appId: env.supabaseUrl,
  appBaseUrl: typeof window !== 'undefined' ? window.location.origin : '',
};
