/**
 * uploads.ts
 *
 * The Core.UploadFile implementation: fail-closed content/size validation,
 * org-scoped storage paths, and the extension→MIME map. Extracted verbatim
 * from supabaseClient.ts; composed into `integrations` by integrations.ts.
 */

import { supabase } from '@/lib/supabase';
import { getActiveOrgId, getActiveOrgGeneration } from '@/lib/activeOrg';
import { assertUploadAllowed, sanitizeFilename } from '@/lib/uploadValidation';
import { quotaExceededUserMessage, remapQuotaError } from '@/lib/quotaExceeded';
import { isTransientNetworkError, withTransientRetry } from '@/lib/transientRetry';
import type { DrawingUploadFileArgs, UploadFileArgs, UploadFileResult } from './supabaseTypes';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sourceConflict = () => new Error('The uploaded PDF bytes could not be verified. Start a fresh review with a new upload.');

async function sha256(blob: Blob): Promise<string> {
  const bytes = await blob.arrayBuffer();
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Drawing callers must choose a project and retain one UUID for the selected file. */
export const UploadDrawingFile = (args: DrawingUploadFileArgs): Promise<UploadFileResult> =>
  UploadFile({ ...args, workflow: 'drawings' });

/**
 * Storage's "object already exists" refusal, across the shapes supabase-js and
 * the storage API use for it. Consulted only on retries; drawing sources
 * additionally require authenticated byte verification at the call site.
 */
function isAlreadyExistsError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { error?: string; message?: string; statusCode?: string | number };
  const status = typeof e.statusCode === 'string' ? Number.parseInt(e.statusCode, 10) : e.statusCode;
  if (status === 409) return true;
  return /duplicate|already exists|resource already exists/i.test(
    [e.error, e.message].filter(Boolean).join(' '),
  );
}

/**
 * Upload a file to Supabase Storage (private bucket).
 * Returns { file_url, file_name, path }
 * Both path and the legacy file_url alias contain the storage key. Persist
 * `path` to the database and call getSignedUrl(path) on demand.
 */
export const UploadFile = async ({ file, workflow, projectId, pathId, assertActive = () => {}, client = supabase }: UploadFileArgs): Promise<UploadFileResult> => {
  if (!file) throw new Error('No file provided');
  // Fail-closed content/size guard (#21). With a `workflow` this enforces the
  // tighter per-workflow allowlist; without one the `default` backstop still
  // blocks dangerous executable/script extensions and an absolute size
  // ceiling. Throws a user-facing message that call sites surface via their
  // existing UploadFile error handling. This is the single storage-write
  // chokepoint, so every upload path is covered.
  assertUploadAllowed(file, workflow ?? 'default');
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  // Org-scoped path so storage RLS isolates tenants (`<org_id>/uploads/...`),
  // read from the org context that OrgProvider publishes. FAIL CLOSED: refuse
  // a NEW upload rather than writing to the grandfathered flat `uploads/...`
  // namespace if the org isn't resolved yet — a flat-path write creates
  // tenant-boundary ambiguity in a multi-tenant workspace. Legacy flat-path
  // files stay READABLE via getSignedUrl/resolveFileUrl; only new writes
  // require org scope. orgId is published by OrgProvider once the workspace
  // resolves, so this only trips during the brief sign-in/load window.
  const orgId = getActiveOrgId();
  if (!orgId) {
    throw new Error('Workspace is still loading — please try again in a moment.');
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orgId)) {
    throw new Error('Unable to resolve a valid workspace context for upload.');
  }
  const drawing = workflow === 'drawings';
  const orgGeneration = getActiveOrgGeneration();
  const assertDrawingActive = () => {
    assertActive();
    if (getActiveOrgId() !== orgId || getActiveOrgGeneration() !== orgGeneration) {
      throw new Error('Workspace changed during drawing upload. Start a fresh review.');
    }
  };
  let actorId: string | undefined;
  const assertDrawingActor = async () => {
    assertDrawingActive();
    const { data, error } = await client.auth.getUser();
    assertDrawingActive();
    if (error || !data.user || (actorId && actorId !== data.user.id)) {
      throw new Error('Signed-in user changed during drawing upload. Start a fresh review.');
    }
    actorId = data.user.id;
  };
  if (drawing) {
    if (!projectId || !UUID.test(projectId) || !pathId || !UUID.test(pathId) || ext !== 'pdf') {
      throw new Error('A valid project and UUID path are required for a drawing PDF.');
    }
    await assertDrawingActor();
    const { data, error } = await client.from('projects').select('id,org_id').eq('id', projectId).single();
    assertDrawingActive();
    if (error || !data || data.id !== projectId || data.org_id !== orgId) {
      throw new Error('The drawing project is unavailable in the current workspace.');
    }
  }
  const dir = `${orgId}/uploads`;
  const path = drawing ? `${dir}/${projectId}/${pathId}.pdf` : `${dir}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  // Browsers report application/octet-stream for many construction file types.
  // Map extensions → proper MIME types so Supabase storage accepts them.
  const MIME_MAP: Record<string, string> = {
    pdf: 'application/pdf',
    ifc: 'application/x-step',
    dwg: 'application/acad',
    dxf: 'application/dxf',
    rvt: 'application/octet-stream',
    nwd: 'application/octet-stream',
    nwc: 'application/octet-stream',
    skp: 'application/octet-stream',
    '3dm': 'application/octet-stream',
    glb: 'model/gltf-binary',
    gltf: 'model/gltf+json',
    obj: 'model/obj',
    fbx: 'application/octet-stream',
    stl: 'model/stl',
    step: 'application/x-step',
    stp: 'application/x-step',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
    csv: 'text/csv',
    txt: 'text/plain',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    mp4: 'video/mp4',
    zip: 'application/zip',
    xml: 'application/xml',
    json: 'application/json',
  };
  const contentType = (file.type && file.type !== 'application/octet-stream')
    ? file.type
    : (MIME_MAP[ext] || 'application/octet-stream');

  // Retry a request the server never received.
  //
  // A 385 KB PDF upload was seen dying with net::ERR_HTTP2_PROTOCOL_ERROR: the
  // CORS preflight logged 200, the POST was never logged at all, and
  // supabase-js reported `StorageUnknownError: Failed to fetch`. The same file
  // had uploaded fine minutes earlier. This is the first step of the
  // revision-upload wizard, so that one dropped connection threw away the whole
  // run — OCR, LLM extraction and sheet matching with it.
  //
  // Only connection-level failures repeat. A 409, 413 or auth error is a
  // decision the server already made and will make again; quota errors are
  // excluded explicitly so the "storage is full" message reaches the user on
  // the first attempt instead of three backoffs later.
  //
  // Keep the same path through retries. Drawing collisions require actual
  // authenticated byte readback; metadata or a signed URL proves no bytes.
  // Other workflows retain their existing duplicate retry behavior.
  const data = await withTransientRetry(
    async (attempt) => {
      // A reconnect retry may outlive the outbox identity that supplied the
      // blob. Check again after backoff before the singleton client reads auth.
      assertActive();
      if (drawing) await assertDrawingActor();
      const res = await client.storage
        .from('app-files')
        .upload(path, file, { contentType, upsert: false });
      assertActive();
      if (drawing) await assertDrawingActor();
      if (res.error) {
        if (attempt > 1 && isAlreadyExistsError(res.error)) {
          if (drawing) {
            try {
              await assertDrawingActor();
              const downloaded = await client.storage.from('app-files').download(path);
              assertDrawingActive();
              if (downloaded.error || !downloaded.data || downloaded.data.size !== file.size) throw sourceConflict();
              const [localHash, remoteHash] = await Promise.all([sha256(file), sha256(downloaded.data)]);
              await assertDrawingActor();
              if (localHash !== remoteHash) throw sourceConflict();
            } catch { throw sourceConflict(); }
          }
          return { path };
        }
        remapQuotaError(res.error);
      }
      if (drawing && res.data?.path !== path) throw sourceConflict();
      return res.data;
    },
    { shouldRetry: (err) => isTransientNetworkError(err) && !quotaExceededUserMessage(err) },
  );
  // Store the storage path — call getSignedUrl(path) on demand when displaying.
  // Sanitize the display/stored name (strip control chars, path components,
  // overly-long names). Normal filenames pass through unchanged.
  return { file_url: data.path, file_name: sanitizeFilename(file.name), path: data.path };
};
