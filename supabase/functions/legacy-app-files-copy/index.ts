// One-time production maintenance endpoint for the legacy app-files cutover.
// Deploy temporarily with --no-verify-jwt. Authorization uses a high-entropy
// preimage supplied in x-sbp-maintenance-token; only its SHA-256 hash is stored
// in private.maintenance_jobs. This function never deletes an object and never
// returns paths, names, tokens, or row data.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  MaintenanceError,
  authorizeMaintenanceRequest,
  jsonResponse,
  maintenanceClient,
} from "../_shared/maintenance-auth.ts";

const JOB_KEY = "legacy_app_files_copy";
const BUCKET = "app-files";
const SOURCE_FOLDER = "uploads";
const MAX_BATCH_SIZE = 100;

interface CopyRequest {
  offset?: number;
  limit?: number;
}

interface StorageDownloader {
  download(path: string): Promise<{ data: Blob | null; error: unknown }>;
}

function safeInteger(value: unknown, fallback: number, maximum: number): number {
  if (value == null) return fallback;
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > maximum) {
    throw new MaintenanceError(400, "Invalid batch parameters.");
  }
  return Number(value);
}

function objectSize(info: { size?: number; metadata?: Record<string, unknown> } | null): number | null {
  const value = info?.size ?? info?.metadata?.size ?? info?.metadata?.contentLength;
  const size = Number(value);
  return Number.isFinite(size) ? size : null;
}

function objectEtag(info: { metadata?: Record<string, unknown> } | null): string | null {
  const value = info?.metadata?.eTag ?? info?.metadata?.etag;
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function downloadSha256(
  storage: StorageDownloader,
  path: string,
): Promise<string | null> {
  const { data, error } = await storage.download(path);
  if (error || !data) return null;

  const digest = await crypto.subtle.digest("SHA-256", await data.arrayBuffer());
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  try {
    const { client, url } = maintenanceClient();
    const context = await authorizeMaintenanceRequest(request, client, url, JOB_KEY);
    if (!context.founding_org_id) {
      throw new MaintenanceError(503, "Founding organization is unavailable.");
    }

    let payload: CopyRequest = {};
    try {
      payload = await request.json();
    } catch {
      // An empty body means the first default-sized batch.
    }
    const offset = safeInteger(payload.offset, 0, Number.MAX_SAFE_INTEGER);
    const limit = safeInteger(payload.limit, 50, MAX_BATCH_SIZE);
    if (limit < 1) throw new MaintenanceError(400, "Invalid batch parameters.");

    const storage = client.storage.from(BUCKET);
    const { data: listed, error: listError } = await storage.list(SOURCE_FOLDER, {
      limit,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (listError) throw new MaintenanceError(500, "Legacy object inventory failed.");

    let copied = 0;
    let existing = 0;
    let failed = 0;
    let etagVerified = 0;
    let hashVerified = 0;
    let contentVerified = 0;
    const files = (listed || []).filter((object) => object.id != null);

    for (const object of files) {
      const source = `${SOURCE_FOLDER}/${object.name}`;
      const destination = `${context.founding_org_id}/${source}`;
      const sourceInfo = await storage.info(source);
      if (sourceInfo.error) {
        failed += 1;
        continue;
      }
      const sourceSize = objectSize(sourceInfo.data);
      const sourceEtag = objectEtag(sourceInfo.data);

      let destinationInfo = await storage.info(destination);
      if (!destinationInfo.error) {
        existing += 1;
      } else {
        const copy = await storage.copy(source, destination);
        if (copy.error) {
          failed += 1;
          continue;
        }
        copied += 1;

        destinationInfo = await storage.info(destination);
      }

      if (
        destinationInfo.error ||
        sourceSize == null ||
        objectSize(destinationInfo.data) !== sourceSize
      ) {
        failed += 1;
        continue;
      }

      const destinationEtag = objectEtag(destinationInfo.data);
      if (sourceEtag && destinationEtag && sourceEtag === destinationEtag) {
        etagVerified += 1;
        contentVerified += 1;
        continue;
      }

      const sourceHash = await downloadSha256(storage, source);
      if (!sourceHash) {
        failed += 1;
        continue;
      }

      // Hash strictly sequentially so the source Blob and its ArrayBuffer leave
      // helper scope before allocating memory for a large destination object.
      const destinationHash = await downloadSha256(storage, destination);
      if (!destinationHash) {
        failed += 1;
        continue;
      }

      if (sourceHash === destinationHash) {
        hashVerified += 1;
        contentVerified += 1;
      } else {
        failed += 1;
      }
    }

    const scanned = files.length;
    const complete = (listed || []).length < limit;
    return jsonResponse(failed > 0 ? 500 : 200, {
      scanned,
      copied,
      existing,
      etag_verified: etagVerified,
      hash_verified: hashVerified,
      content_verified: contentVerified,
      verification_failed: failed,
      next_offset: offset + (listed || []).length,
      complete,
      originals_deleted: 0,
    });
  } catch (error) {
    const status = error instanceof MaintenanceError ? error.status : 500;
    const message = error instanceof MaintenanceError ? error.message : "Maintenance copy failed.";
    return jsonResponse(status, { error: message });
  }
});
