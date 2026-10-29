/**
 * photoSync.js — replay a queued offline photo create.
 *
 * The orchestration (read blob -> upload -> Photo.create) is a
 * pure function with INJECTED dependencies so it's fully unit-tested without a
 * real IndexedDB / network. OutboxContext passes the live deps (blobStore +
 * supabase entities/integrations); tests pass mocks.
 *
 * Retry deduplication: the op's blobKey is the client_op_id on the Photo row, so a
 * replay whose create already landed hits the partial-unique index (23505) and
 * is treated as done. Errors are surfaced (thrown) so flushQueue keeps the op —
 * and its blob — queued for the next reconnect. The outbox deletes bytes only
 * after saving the updated queue. Upload retries may still leave extra objects.
 */

/**
 * @param op    the photo-create op ({ payload: { blobKey, meta } })
 * @param deps  { getBlob, uploadFile, createPhoto, findPhoto, isUniqueViolation }
 */
export async function replayPhotoCreate(op, deps, assertActive = () => {}) {
  const { getBlob, uploadFile, createPhoto, isUniqueViolation } = deps;
  const blobKey = op?.payload?.blobKey;
  const meta = op?.payload?.meta || {};
  if (!blobKey) throw new Error("Queued photo has no recovery key. Keep the capture for recovery.");

  assertActive();
  const stored = await getBlob(blobKey);
  assertActive();
  if (!stored || !stored.blob) {
    // Absence is not proof of upload. A lost queue commit after upload is
    // recoverable only when the server confirms the same client operation.
    if (deps.findPhoto && await deps.findPhoto(blobKey)) {
      assertActive();
      return;
    }
    throw new Error("Pending photo is unavailable on this device. Keep the capture and retry or recover the original photo.");
  }

  const file = reconstructFile(stored.blob, stored.meta);

  // Upload first. If this throws (still offline), the op + blob stay queued.
  const uploaded = await uploadFile({ file, assertActive });
  assertActive();
  const fileUrl = uploaded?.file_url || uploaded?.path;
  if (!fileUrl) throw new Error("Photo upload did not return a file location. Capture remains pending.");

  try {
    await createPhoto({ ...meta, file_url: fileUrl, client_op_id: blobKey });
  } catch (err) {
    // A prior attempt already created this Photo row (same client_op_id) — the
    // replay is a no-op. Any other error is real: rethrow to keep it queued.
    if (!isUniqueViolation(err)) throw err;
  }

  assertActive();
  // The outbox removes this blob only after its queue write commits.
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
