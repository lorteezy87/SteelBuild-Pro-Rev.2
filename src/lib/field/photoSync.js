/**
 * photoSync.js — replay a queued offline photo create.
 *
 * The orchestration (read blob -> upload -> Photo.create -> delete blob) is a
 * pure function with INJECTED dependencies so it's fully unit-tested without a
 * real IndexedDB / network. FieldToday passes the live deps (blobStore +
 * supabase entities/integrations); tests pass mocks.
 *
 * Exactly-once: the op's blobKey is the client_op_id, set on the Photo row, so a
 * replay whose create already landed hits the partial-unique index (23505) and
 * is treated as done. Errors are surfaced (thrown) so flushQueue keeps the op —
 * and its blob — queued for the next reconnect.
 */

/**
 * @param op    the photo-create op ({ payload: { blobKey, meta } })
 * @param deps  { getBlob, uploadFile, createPhoto, deleteBlob, isUniqueViolation }
 */
export async function replayPhotoCreate(op, deps) {
  const { getBlob, uploadFile, createPhoto, deleteBlob, isUniqueViolation } = deps;
  const blobKey = op?.payload?.blobKey;
  const meta = op?.payload?.meta || {};
  if (!blobKey) return; // malformed op — nothing to do (flushQueue drops it as synced)

  const stored = await getBlob(blobKey);
  if (!stored || !stored.blob) {
    // The blob is gone — a prior attempt already uploaded+created it (and we
    // crashed before removing the op), or it was reconciled. Nothing to replay.
    return;
  }

  const file = reconstructFile(stored.blob, stored.meta);

  // Upload first. If this throws (still offline), the op + blob stay queued.
  const uploaded = await uploadFile({ file });
  const fileUrl = uploaded?.file_url || uploaded?.path;

  try {
    await createPhoto({ ...meta, file_url: fileUrl, client_op_id: blobKey });
  } catch (err) {
    // A prior attempt already created this Photo row (same client_op_id) — the
    // replay is a no-op. Any other error is real: rethrow to keep it queued.
    if (!isUniqueViolation(err)) throw err;
  }

  await deleteBlob(blobKey); // success or dedup -> drop the blob
}

/** Rebuild a named File from a stored Blob so the upload keeps its filename. */
function reconstructFile(blob, meta) {
  const name = meta?.name || "field-photo.jpg";
  const type = meta?.type || blob?.type || "image/jpeg";
  try {
    if (typeof File === "function") return new File([blob], name, { type });
  } catch {
    /* File constructor unavailable — fall back to the raw blob */
  }
  return blob;
}
