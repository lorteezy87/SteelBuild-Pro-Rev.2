/**
 * base44Client.ts
 *
 * All imports of `base44` throughout the codebase continue to work unchanged.
 * The implementation now routes through Supabase instead of the Base44 SDK.
 */
export { base44, getSignedUrl, resolveFileUrl } from './supabaseClient';
