// Pure helper extracted from DrawingViewer.jsx.
//
// If a stored file_url is itself a Supabase signed URL with a JWT token,
// extract the storage path so we can re-sign it. Returns null when the
// URL doesn't match the Supabase /object/sign|public/<bucket>/<path>
// shape — the caller falls back to using the raw URL as the storage path.

export function extractStoragePathFromSignedUrl(url) {
  try {
    const m = url.match(/\/object\/(?:sign|public)\/[^/]+\/(.+?)(?:\?|$)/);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}
