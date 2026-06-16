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

export function setActiveOrgId(orgId: string | null): void {
  _activeOrgId = orgId || null;
}

export function getActiveOrgId(): string | null {
  return _activeOrgId;
}
