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
    let verified = 0;
    const files = (listed || []).filter((object) => object.id != null);

    for (const object of files) {
      const source = `${SOURCE_FOLDER}/${object.name}`;
      const destination = `${context.founding_org_id}/${source}`;
      const sourceSize = objectSize(object);
      const destinationBefore = await storage.info(destination);

      if (!destinationBefore.error) {
        if (sourceSize != null && objectSize(destinationBefore.data) === sourceSize) {
          existing += 1;
          verified += 1;
        } else {
          failed += 1;
        }
        continue;
      }

      const copy = await storage.copy(source, destination);
      if (copy.error) {
        failed += 1;
        continue;
      }
      copied += 1;

      const destinationAfter = await storage.info(destination);
      if (
        !destinationAfter.error &&
        sourceSize != null &&
        objectSize(destinationAfter.data) === sourceSize
      ) {
        verified += 1;
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
      verified,
      failed,
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
