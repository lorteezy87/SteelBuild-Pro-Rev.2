// erasure.ts — account-delete's decisions, kept free of Deno and HTTP so they
// can be unit-tested. index.ts wires these to Deno.serve.
//
// FAIL CLOSED. Every read that decides WHAT to erase must succeed before anything
// is destroyed. A failed count used to read as 0 (`count ?? 0`), which made a
// co-owned workspace look sole-owned — erasing it for every co-owner — and made
// a member who still belonged to another org look orphaned, deleting their
// login. A failed read now stops the request, or, after erasure has begun,
// skips that one user and says so.

// The Supabase clients are typed loosely: index.ts passes supabase-js clients,
// tests pass small fakes.
// deno-lint-ignore no-explicit-any
type Client = any;

export interface ErasureResult {
  status: number;
  body: Record<string, unknown>;
}

/** A failure the caller sees as `code`; `internal` goes to the function log only. */
export class ErasureError extends Error {
  constructor(public readonly code: string, public readonly internal: string) {
    super(code);
    this.name = "ErasureError";
  }
}

// Nothing from the database reaches the client: its messages name tables,
// constraints and policies. The user sees what failed; the log keeps the rest.
const USER_MESSAGE: Record<string, string> = {
  lookup_failed: "Could not confirm what to delete, so nothing was deleted. Please try again or contact support.",
  db_erasure_failed: "The workspace could not be deleted. Nothing further was removed. Please contact support.",
  account_deletion_failed: "Your account could not be deleted. Please contact support.",
};

type Log = (message: string) => void;

function failure(status: number, code: string, internal: string, log: Log): ErasureResult {
  log(`account-delete ${code}: ${internal}`);
  return { status, body: { error: code, detail: USER_MESSAGE[code] ?? "Deletion failed." } };
}

function toFailure(e: unknown, fallbackCode: string, log: Log): ErasureResult {
  if (e instanceof ErasureError) return failure(500, e.code, e.internal, log);
  return failure(500, fallbackCode, String((e as Error)?.message ?? e), log);
}

/** Count rows or throw. A null count is not zero: it means the count failed. */
async function countOrThrow(query: PromiseLike<{ count: number | null; error: unknown }>, what: string): Promise<number> {
  const { count, error } = await query;
  if (error || typeof count !== "number") {
    throw new ErasureError("lookup_failed", `${what}: ${describe(error) || "no count returned"}`);
  }
  return count;
}

/** Select rows or throw. A failed read is not an empty result. */
async function rowsOrThrow<T>(query: PromiseLike<{ data: T[] | null; error: unknown }>, what: string): Promise<T[]> {
  const { data, error } = await query;
  if (error || !Array.isArray(data)) {
    throw new ErasureError("lookup_failed", `${what}: ${describe(error) || "no rows returned"}`);
  }
  return data;
}

function describe(error: unknown): string {
  if (!error) return "";
  return String((error as { message?: string })?.message ?? error);
}

// Recursively collect every object path under `prefix` in `bucket`.
async function listAllPaths(admin: Client, bucket: string, prefix: string): Promise<{ paths: string[]; complete: boolean }> {
  const paths: string[] = [];
  let complete = true;
  const stack = [prefix];
  while (stack.length) {
    const dir = stack.pop() as string;
    const { data, error } = await admin.storage.from(bucket).list(dir, { limit: 1000 });
    if (error || !data) {
      complete = false;
      continue;
    }
    for (const entry of data) {
      const full = dir ? `${dir}/${entry.name}` : entry.name;
      // Supabase marks folders with a null id / no metadata.
      if (entry.id === null || entry.metadata == null) stack.push(full);
      else paths.push(full);
    }
  }
  return { paths, complete };
}

async function removeAll(admin: Client, bucket: string, prefix: string): Promise<{ removed: number; complete: boolean }> {
  const listed = await listAllPaths(admin, bucket, prefix);
  let removed = 0;
  let complete = listed.complete;
  for (let i = 0; i < listed.paths.length; i += 100) {
    const batch = listed.paths.slice(i, i + 100);
    const { error } = await admin.storage.from(bucket).remove(batch);
    if (error) complete = false;
    else removed += batch.length;
  }
  return { removed, complete };
}

/**
 * Erase every auth user in `ids` who, after DB erasure, belongs to NO org.
 * `skip` is already handled (e.g. the caller). A user whose membership count
 * cannot be read is kept, not deleted, and counted in `skipped`.
 */
export async function deleteOrphanedUsers(
  admin: Client,
  ids: Iterable<string>,
  log: Log,
  skip?: string,
): Promise<{ deleted: number; skipped: number }> {
  let deleted = 0;
  let skipped = 0;
  for (const uid of ids) {
    if (uid === skip) continue;
    const { count, error } = await admin
      .from("organization_members")
      .select("*", { count: "exact", head: true })
      .eq("user_id", uid);
    if (error || typeof count !== "number") {
      skipped++;
      log(`account-delete kept user ${uid}: membership count failed: ${describe(error) || "no count returned"}`);
      continue;
    }
    if (count > 0) continue;
    const { error: delErr } = await admin.auth.admin.deleteUser(uid);
    if (delErr) {
      skipped++;
      log(`account-delete could not delete orphaned user ${uid}: ${describe(delErr)}`);
    } else {
      deleted++;
    }
  }
  return { deleted, skipped };
}

/**
 * Erase one organization the caller OWNS: DB rows (caller-scoped RPC, which
 * self-verifies owner) + Storage (service role). The project and member
 * snapshots must succeed first — without them storage and orphaned members
 * would be silently left behind.
 */
export async function eraseOwnedOrg(
  admin: Client,
  userClient: Client,
  orgId: string,
): Promise<{ storageRemoved: number; storageComplete: boolean; memberIds: string[]; projectsDeleted: number }> {
  const projects = await rowsOrThrow<{ id: string }>(
    admin.from("projects").select("id").eq("org_id", orgId),
    `projects of ${orgId}`,
  );
  const members = await rowsOrThrow<{ user_id: string }>(
    admin.from("organization_members").select("user_id").eq("org_id", orgId),
    `members of ${orgId}`,
  );
  const projectIds = projects.map((p) => p.id);
  const memberIds = members.map((m) => m.user_id);

  const { error: rpcErr } = await userClient.rpc("hard_delete_organization", { p_org_id: orgId });
  if (rpcErr) throw new ErasureError("db_erasure_failed", `${orgId}: ${describe(rpcErr)}`);

  // Storage purge is best-effort (the DB rows are already gone), but an
  // incomplete purge is reported rather than hidden.
  let storageRemoved = 0;
  let storageComplete = true;
  try {
    const orgFiles = await removeAll(admin, "app-files", orgId);
    storageRemoved += orgFiles.removed;
    storageComplete &&= orgFiles.complete;
    for (const pid of projectIds) {
      const mail = await removeAll(admin, "email-attachments", pid);
      storageRemoved += mail.removed;
      storageComplete &&= mail.complete;
    }
  } catch (_) {
    storageComplete = false;
  }

  return { storageRemoved, storageComplete, memberIds, projectsDeleted: projectIds.length };
}

/** Mode A — erase an organization. Caller must be the org OWNER. */
export async function handleOrgDeletion(
  admin: Client,
  userClient: Client,
  callerId: string,
  orgId: string,
  log: Log = console.error,
): Promise<ErasureResult> {
  const { data: ownerRow, error: ownerErr } = await admin
    .from("organization_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", callerId)
    .maybeSingle();
  if (ownerErr) return failure(500, "lookup_failed", `owner check for ${orgId}: ${describe(ownerErr)}`, log);
  if (!ownerRow || ownerRow.role !== "owner") {
    return { status: 403, body: { error: "forbidden", detail: "Only the organization owner can delete the workspace." } };
  }

  let erased;
  try {
    erased = await eraseOwnedOrg(admin, userClient, orgId);
  } catch (e) {
    return toFailure(e, "db_erasure_failed", log);
  }

  const users = await deleteOrphanedUsers(admin, erased.memberIds, log);
  return {
    status: 200,
    body: {
      ok: true,
      org_id: orgId,
      projects_deleted: erased.projectsDeleted,
      storage_objects_removed: erased.storageRemoved,
      storage_incomplete: !erased.storageComplete,
      users_deleted: users.deleted,
      users_skipped: users.skipped,
    },
  };
}

/** Mode B — the caller deletes their OWN account. */
export async function handleAccountDeletion(
  admin: Client,
  userClient: Client,
  callerId: string,
  log: Log = console.error,
): Promise<ErasureResult> {
  // Decide everything before destroying anything: which workspaces the caller
  // is the SOLE owner of. Any failed read here stops the whole request.
  const soleOwnerOrgs: string[] = [];
  try {
    const memberships = await rowsOrThrow<{ org_id: string; role: string }>(
      admin.from("organization_members").select("org_id, role").eq("user_id", callerId),
      `memberships of ${callerId}`,
    );
    for (const m of memberships) {
      if (m.role !== "owner") continue;
      const owners = await countOrThrow(
        admin
          .from("organization_members")
          .select("*", { count: "exact", head: true })
          .eq("org_id", m.org_id)
          .eq("role", "owner"),
        `owners of ${m.org_id}`,
      );
      // The caller's own owner row is one of them; 0 would mean the read lied.
      if (owners < 1) throw new ErasureError("lookup_failed", `owners of ${m.org_id}: counted ${owners}`);
      if (owners === 1) soleOwnerOrgs.push(m.org_id);
    }
  } catch (e) {
    return toFailure(e, "lookup_failed", log);
  }

  // Erase each sole-owned workspace in full (must happen while the caller's JWT
  // is still valid — i.e. before deleting the caller's auth user below).
  const affected = new Set<string>();
  let storageRemoved = 0;
  let storageComplete = true;
  let orgsDeleted = 0;
  for (const orgId of soleOwnerOrgs) {
    let erased;
    try {
      erased = await eraseOwnedOrg(admin, userClient, orgId);
    } catch (e) {
      return toFailure(e, "account_deletion_failed", log);
    }
    storageRemoved += erased.storageRemoved;
    storageComplete &&= erased.storageComplete;
    for (const uid of erased.memberIds) affected.add(uid);
    orgsDeleted++;
  }

  // Delete the caller's auth user. FK cascades remove their remaining
  // memberships, `user_profiles` PII, and `user_projects`; authorship refs are
  // ON DELETE SET NULL.
  const { error: delErr } = await admin.auth.admin.deleteUser(callerId);
  if (delErr) return failure(500, "account_deletion_failed", `delete auth user ${callerId}: ${describe(delErr)}`, log);

  // Sweep co-members of erased workspaces who now belong to NO org (the caller
  // is already gone and is skipped).
  const coMembers = await deleteOrphanedUsers(admin, affected, log, callerId);

  return {
    status: 200,
    body: {
      ok: true,
      mode: "account",
      orgs_deleted: orgsDeleted,
      storage_objects_removed: storageRemoved,
      storage_incomplete: !storageComplete,
      users_deleted: coMembers.deleted + 1, // + the caller
      users_skipped: coMembers.skipped,
    },
  };
}
