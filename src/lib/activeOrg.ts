/**
 * activeOrg — a tiny module-level holder for the signed-in user's active org id.
 *
 * OrgProvider publishes it (setActiveOrgId) whenever the current org resolves;
 * the file uploader (api/supabaseClient UploadFile) reads it (getActiveOrgId) to
 * tenant-scope storage paths (`<org_id>/uploads/...`) WITHOUT re-querying the DB.
 *
 * Why not query in the uploader: an independent getSession()+organization_members
 * lookup proved unreliable (returned null even for a valid member), whereas
 * OrgContext already resolves the org correctly for the whole app. Reusing that
 * single source avoids divergence and an extra round-trip on every upload. Null
 * when signed out / no workspace yet → the uploader falls back to a flat path.
 */
let _activeOrgId: string | null = null;
let _activeOrgGeneration = 0;
const generationListeners = new Set<() => void>();

export function setActiveOrgId(orgId: string | null): void {
  const nextOrgId = orgId || null;
  const changed = _activeOrgId !== nextOrgId;
  if (changed) ++_activeOrgGeneration;
  _activeOrgId = nextOrgId;
  if (changed) for (const listener of generationListeners) listener();
}

export function getActiveOrgId(): string | null {
  return _activeOrgId;
}

/** Invalidates asynchronous work even if a cleared workspace later reopens. */
export function getActiveOrgGeneration(): number {
  return _activeOrgGeneration;
}

/** Synchronous cancellation before auth/workspace React updates commit. */
export function subscribeActiveOrgChange(listener: () => void): () => void {
  generationListeners.add(listener);
  return () => { generationListeners.delete(listener); };
}
