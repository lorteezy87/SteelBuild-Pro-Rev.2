/**
 * storage.ts
 *
 * Signed-URL generation and the file-trust boundary (getSignedUrl /
 * resolveFileUrl / TRUSTED_FILE_HOST). A user-controlled file_url pointing at
 * any host other than our Supabase project is blocked. Extracted verbatim from
 * supabaseClient.ts.
 */

import { supabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { SIGNED_URL_EXPIRY_SECONDS } from '@/lib/fileUrlLifetime';

// ─── File uploads & LLM integrations ─────────────────────────────────────────

/**
 * Get a short-lived signed URL for a stored file path.
 * Use this whenever displaying a file that was uploaded to a private bucket.
 */
export const getSignedUrl = async (storagePath: string, bucket: string = 'app-files'): Promise<string> => {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SECONDS);
  if (error) throw error;
  return data.signedUrl;
};

const TRUSTED_FILE_ORIGIN = (() => {
  try { return new URL(env.supabaseUrl).origin; } catch { return ''; }
})();

/**
 * Resolve a file_url to a usable URL.
 * If the value looks like a storage path (no protocol), generate a signed URL.
 * Old signed URLs are reduced to their owned bucket/path and signed again,
 * enforcing current RLS rather than reusing another session's bearer token.
 *
 * Bucket-prefixed paths ("email-attachments/<project_id>/<message_id>/<file>")
 * sign against that bucket — email attachments live in their own private
 * bucket with project-scoped RLS, so bare URLs would 400 for non-members.
 */
export const resolveFileUrl = async (fileUrl: string | null | undefined): Promise<string | null> => {
  if (!fileUrl) return null;
  if (/^https?:\/\//i.test(fileUrl)) {
    let url: URL;
    try { url = new URL(fileUrl); } catch { return null; }
    if (url.origin !== TRUSTED_FILE_ORIGIN || url.username || url.password) return null;
    const match = /^\/storage\/v1\/object\/(?:sign|authenticated|public)\/(app-files|email-attachments)\/(.+)$/.exec(url.pathname);
    if (!match || /%2f|%5c/i.test(match[2])) return null;
    let path: string;
    try { path = decodeURIComponent(match[2]); } catch { return null; }
    if (path.split('/').some(segment => !segment || segment === '.' || segment === '..') || /[\\\x00-\x1f]/.test(path)) return null;
    return getSignedUrl(path, match[1]);
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(fileUrl) || fileUrl.startsWith('//')) return null;
  if (fileUrl.startsWith('email-attachments/')) {
    return getSignedUrl(fileUrl.slice('email-attachments/'.length), 'email-attachments');
  }
  return getSignedUrl(fileUrl);
};
