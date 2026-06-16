/**
 * gzip.js — gzip an IFC before storing it so big models (50 MB+) fit under the
 * storage bucket's file-size limit and download ~5–10× faster on every load.
 * Uses the browser-native CompressionStream — no dependency. Stored files are
 * named `<name>.gz`; the viewer detects that suffix and inflates on load.
 */

/** gzip an ArrayBuffer. Returns null if the browser lacks CompressionStream. */
export async function gzipBuffer(buffer) {
  if (typeof CompressionStream === "undefined") return null;
  const stream = new Blob([buffer]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

/** gunzip an ArrayBuffer (DecompressionStream). */
export async function gunzipBuffer(buffer) {
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}
