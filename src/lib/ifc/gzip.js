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

export const MAX_INFLATED_IFC_BYTES = 128 * 1024 * 1024;

/** Keep newly persisted models inside the same limit as their next reload. */
export function assertInflatedIfcSize(bytes) {
  if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > MAX_INFLATED_IFC_BYTES) {
    throw new Error("IFC model exceeds the 128 MiB decoded size limit. Re-export structural members only or split the model by sequence.");
  }
}

/** Bound the decoded output before retaining/concatenating it for the parser. */
export async function gunzipBuffer(buffer, { maxBytes = MAX_INFLATED_IFC_BYTES, signal } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > MAX_INFLATED_IFC_BYTES) {
    throw new Error("Invalid IFC decompression limit.");
  }
  signal?.throwIfAborted();
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"));
  const reader = stream.getReader();
  const chunks = [];
  let length = 0;
  let timedOut = false;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  const timer = setTimeout(() => { timedOut = true; cancel(); }, 30_000);
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      const { value, done } = await reader.read();
      signal?.throwIfAborted();
      if (timedOut) throw new Error("IFC decompression timed out.");
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) throw new Error("Decompressed IFC exceeds the size limit (128 MiB maximum).");
      chunks.push(value);
    }
    const result = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
    return result.buffer;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
