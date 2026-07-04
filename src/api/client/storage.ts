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

// ─── File uploads & LLM integrations ─────────────────────────────────────────

// Signed URL expiry in seconds (1 hour). Increase if long-lived links are needed.
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60;

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

// Trusted host for already-resolved (full http) file URLs: our own Supabase
// project, where signed/public storage URLs live. Stored file_url values are
// storage PATHS (verified across every file_url table: 0 rows hold a full URL),
// so the ONLY legitimate full URL is one on this host. Any other host is
// untrusted — a poisoned / user-controlled file_url must never be rendered or
// opened as a trusted project file (#20).
const TRUSTED_FILE_HOST = (() => {
  try { return new URL(env.supabaseUrl).host; } catch { return ''; }
})();

/**
 * Resolve a file_url to a usable URL.
 * If the value looks like a storage path (no protocol), generate a signed URL.
 * If it's already a full http(s) URL, return it ONLY when it's on our trusted
 * Supabase host; any other host is blocked (returns null) so a user-controlled
 * file_url can't surface arbitrary external content as a trusted project file.
 *
 * Bucket-prefixed paths ("email-attachments/<project_id>/<message_id>/<file>")
 * sign against that bucket — email attachments live in their own private
 * bucket with project-scoped RLS, so bare URLs would 400 for non-members.
 */
export const resolveFileUrl = async (fileUrl: string | null | undefined): Promise<string | null> => {
  if (!fileUrl) return null;
  if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
    let host = '';
    try { host = new URL(fileUrl).host; } catch { return null; }
    if (host && host === TRUSTED_FILE_HOST) return fileUrl;
    console.warn(`[resolveFileUrl] blocked untrusted external file URL (host: ${host || 'unparseable'})`);
    return null;
  }
  if (fileUrl.startsWith('email-attachments/')) {
    return getSignedUrl(fileUrl.slice('email-attachments/'.length), 'email-attachments');
  }
  return getSignedUrl(fileUrl);
};
