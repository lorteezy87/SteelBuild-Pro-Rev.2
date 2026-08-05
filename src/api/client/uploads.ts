/**
 * uploads.ts
 *
 * The Core.UploadFile implementation: fail-closed content/size validation,
 * org-scoped storage paths, and the extension→MIME map. Extracted verbatim
 * from supabaseClient.ts; composed into `integrations` by integrations.ts.
 */

import { supabase } from '@/lib/supabase';
import { getActiveOrgId } from '@/lib/activeOrg';
import { assertUploadAllowed, sanitizeFilename } from '@/lib/uploadValidation';
import type { UploadFileArgs, UploadFileResult } from './supabaseTypes';

/**
 * Upload a file to Supabase Storage (private bucket).
 * Returns { file_url, file_name, path }
 * file_url is a signed URL valid for 1 hour. For long-term storage,
 * persist `path` to the database and call getSignedUrl(path) on demand.
 */
export const UploadFile = async ({ file, workflow }: UploadFileArgs): Promise<UploadFileResult> => {
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
  const dir = `${orgId}/uploads`;
  const path = `${dir}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

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

  const { data, error } = await supabase.storage
    .from('app-files')
    .upload(path, file, { contentType, upsert: false });
  if (error) throw error;
  // Store the storage path — call getSignedUrl(path) on demand when displaying.
  // Sanitize the display/stored name (strip control chars, path components,
  // overly-long names). Normal filenames pass through unchanged.
  return { file_url: data.path, file_name: sanitizeFilename(file.name), path: data.path };
};
