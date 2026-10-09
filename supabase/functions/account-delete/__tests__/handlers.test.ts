import { describe, expect, it, vi } from 'vitest';
import { handleAccountDeletion, handleOrgDeletion } from '../handlers';

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CALLER = uid(1), ORG = uid(2), PROJECT = uid(3), OTHER = uid(4);
type Row = Record<string, unknown>;

function fixture() {
  const tables: Record<string, Row[]> = {
    organizations: [{ id: ORG, name: 'Sole workspace' }],
    projects: [{ id: PROJECT, org_id: ORG }],
    organization_members: [{ org_id: ORG, user_id: CALLER, role: 'owner' }],
    data_erasure_log: [],
  };
  const objects = new Set([`app-files/${ORG}/file.pdf`, `email-attachments/${PROJECT}/mail.pdf`]);
  const identities = new Set([CALLER, OTHER]);
  const reads: string[] = [];
  let failTable: string | undefined;
  let missingTable: string | undefined;
  let rpcFailure = false;
  let removeFailure = false;
  let rpcCalls = 0;
  const deleteUser = vi.fn(async (id: string) => {
    identities.delete(id);
    tables.organization_members = tables.organization_members.filter(member => member.user_id !== id);
    return { data: {}, error: null };
  });
  const admin = {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      let column = 'id', limit = 1000, head = false, single = false;
      const query = {
        select(_columns: string, options?: { head?: boolean }) { head = options?.head ?? false; return query; },
        eq(key: string, value: unknown) { filters.push(row => row[key] === value); return query; },
        gt(key: string, value: string) { filters.push(row => String(row[key]) > value); return query; },
        in(key: string, values: string[]) { filters.push(row => values.includes(String(row[key]))); return query; },
        order(key: string) { column = key; return query; },
        limit(size: number) { limit = size; return query; },
        maybeSingle() { single = true; return query; },
        then(resolve: (result: unknown) => unknown) {
          reads.push(table);
          if (failTable === table) return Promise.resolve(resolve({ data: null, count: null, error: { message: 'read unavailable' } }));
          if (missingTable === table) return Promise.resolve(resolve({ data: null, count: null, error: null }));
          const rows = (tables[table] ?? []).filter(row => filters.every(filter => filter(row))).sort((a, b) => String(a[column]).localeCompare(String(b[column])));
          return Promise.resolve(resolve({ data: head ? null : single ? rows[0] ?? null : rows.slice(0, limit), count: rows.length, error: null }));
        },
      };
      return query;
    },
    auth: { admin: { deleteUser } },
    storage: {
      from(bucket: string) {
        return {
          async list(prefix: string, options: { offset: number; limit: number }) {
            const paths = [...objects].filter(path => path.startsWith(`${bucket}/${prefix}/`)).sort();
            return { data: paths.slice(options.offset, options.offset + options.limit).map(path => ({ id: path, name: path.slice(`${bucket}/${prefix}/`.length) })), error: null };
          },
          async remove(paths: string[]) {
            if (removeFailure) return { data: null, error: { message: 'remove unavailable' } };
            return { data: paths.filter(path => objects.delete(`${bucket}/${path}`)).map(name => ({ name })), error: null };
          },
        };
      },
    },
  };
  const userClient = {
    async rpc(_name: string, _args: unknown) {
      rpcCalls++;
      if (rpcFailure) return { data: null, error: { message: 'erasure refused' } };
      if (!tables.organizations.length) return { data: { org_ids: [], project_ids: [] }, error: null };
      tables.data_erasure_log.push({ id: uid(10), kind: 'organization', org_id: ORG, requested_by: CALLER, row_counts: { projects: 1, per_project: { [PROJECT]: {} } } });
      tables.organizations = [];
      tables.projects = [];
      tables.organization_members = [];
      return { data: { org_ids: [ORG], project_ids: [PROJECT] }, error: null };
    },
  };
  return {
    admin, userClient, tables, objects, identities, reads, deleteUser,
    get rpcCalls() { return rpcCalls; },
    failRead(table: string) { failTable = table; },
    missingRead(table: string) { missingTable = table; },
    failRpc() { rpcFailure = true; },
    failRemove(value: boolean) { removeFailure = value; },
  };
}

describe('account erasure completion', () => {
  it.each(['account', 'workspace'])('does not expose private RPC errors in %s erasure responses', async mode => {
    const f = fixture();
    const marker = 'PRIVATE_MARKER_secret_customer@example.invalid';
    f.userClient.rpc = async () => ({ data: null, error: { message: marker } });
    const response = mode === 'account'
      ? await handleAccountDeletion(f.admin, f.userClient, CALLER)
      : await handleOrgDeletion(f.admin, f.userClient, CALLER, ORG);
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain(marker);
    expect(f.deleteUser).not.toHaveBeenCalled();
    expect(f.objects.size).toBe(2);
  });

  it('recovers durable scopes on retry after DB erasure and a Storage failure', async () => {
    const f = fixture();
    f.failRemove(true);
    expect((await handleAccountDeletion(f.admin, f.userClient, CALLER)).status).toBe(503);
    expect(f.tables.organizations).toEqual([]);
    expect(f.deleteUser).not.toHaveBeenCalled();
    f.failRemove(false);
    expect((await handleAccountDeletion(f.admin, f.userClient, CALLER)).status).toBe(200);
    expect(f.rpcCalls).toBe(2);
    expect(f.objects.size).toBe(0);
    expect(f.deleteUser).toHaveBeenCalledExactlyOnceWith(CALLER);
  });

  it.each(['error', 'missing'] as const)('keeps Auth on %s journal reads', async failure => {
    const f = fixture();
    if (failure === 'error') f.failRead('data_erasure_log'); else f.missingRead('data_erasure_log');
    expect((await handleAccountDeletion(f.admin, f.userClient, CALLER)).status).toBe(503);
    expect(f.deleteUser).not.toHaveBeenCalled();
    expect(f.objects.size).toBe(2);
  });

  it('keeps Auth when fresh erased IDs have no matching durable journal record', async () => {
    const f = fixture();
    const rpc = f.userClient.rpc;
    f.userClient.rpc = async (...args) => {
      const result = await rpc(...args);
      f.tables.data_erasure_log = [];
      return result;
    };
    expect((await handleAccountDeletion(f.admin, f.userClient, CALLER)).status).toBe(503);
    expect(f.objects.size).toBe(2);
    expect(f.deleteUser).not.toHaveBeenCalled();
  });

  it.each(['organizations', 'projects'])('keeps Auth when %s absence cannot be verified', async table => {
    const f = fixture();
    await f.userClient.rpc('', {});
    f.missingRead(table);
    expect((await handleAccountDeletion(f.admin, f.userClient, CALLER)).status).toBe(503);
    expect(f.objects.size).toBe(2);
    expect(f.deleteUser).not.toHaveBeenCalled();
  });

  it('refuses a missing account membership census before erasure', async () => {
    const f = fixture();
    f.missingRead('organization_members');
    expect((await handleAccountDeletion(f.admin, f.userClient, CALLER)).status).toBe(503);
    expect(f.rpcCalls).toBe(0);
    expect(f.deleteUser).not.toHaveBeenCalled();
  });

  it('never purges historical scopes belonging to another caller', async () => {
    const f = fixture();
    f.tables.data_erasure_log.push({ id: uid(11), kind: 'organization', org_id: OTHER, requested_by: OTHER, row_counts: { projects: 0, per_project: {} } });
    f.objects.add(`app-files/${OTHER}/keep.pdf`);
    expect((await handleAccountDeletion(f.admin, f.userClient, CALLER)).status).toBe(200);
    expect([...f.objects]).toEqual([`app-files/${OTHER}/keep.pdf`]);
  });

  it('refuses an incomplete historical project census before deleting files or Auth', async () => {
    const f = fixture();
    f.tables.data_erasure_log.push({ id: uid(11), kind: 'organization', org_id: OTHER, requested_by: CALLER, row_counts: { projects: 2, per_project: {} } });
    expect((await handleAccountDeletion(f.admin, f.userClient, CALLER)).status).toBe(503);
    expect(f.objects.size).toBe(2);
    expect(f.deleteUser).not.toHaveBeenCalled();
  });

  it.each(['organizations', 'projects'])('refuses a recovered ID still present in %s', async table => {
    const f = fixture();
    await f.userClient.rpc('', {});
    f.tables[table] = [{ id: table === 'organizations' ? ORG : PROJECT }];
    // Nothing newly erased on this retry; the stale journal must not authorize live scopes.
    f.userClient.rpc = async () => ({ data: { org_ids: [], project_ids: [] }, error: null });
    expect((await handleAccountDeletion(f.admin, f.userClient, CALLER)).status).toBe(503);
    expect(f.objects.size).toBe(2);
    expect(f.deleteUser).not.toHaveBeenCalled();
  });

  it('reads more than one journal page before completing Auth deletion', async () => {
    const f = fixture();
    for (let n = 100; n < 1101; n++) f.tables.data_erasure_log.push({ id: uid(n), kind: 'organization', org_id: uid(n + 2000), requested_by: CALLER, row_counts: { projects: 0, per_project: {} } });
    const lastOrg = uid(3100);
    f.objects.add(`app-files/${lastOrg}/last-page.pdf`);
    expect((await handleAccountDeletion(f.admin, f.userClient, CALLER)).status).toBe(200);
    expect(f.objects.size).toBe(0);
    expect(f.reads.filter(table => table === 'data_erasure_log').length).toBeGreaterThan(1);
  });
});

describe('workspace erasure preserves account identities', () => {
  it('erases the workspace and files while keeping the owner and every member login', async () => {
    const f = fixture();
    f.tables.organization_members.push({ org_id: ORG, user_id: OTHER, role: 'member' });

    const response = await handleOrgDeletion(f.admin, f.userClient, CALLER, ORG);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true, org_id: ORG, projects_deleted: 1, storage_objects_removed: 2, users_deleted: 0,
    });
    expect(f.tables.organizations).toEqual([]);
    expect(f.tables.organization_members).toEqual([]);
    expect(f.objects.size).toBe(0);
    expect([...f.identities]).toEqual([CALLER, OTHER]);
    expect(f.deleteUser).not.toHaveBeenCalled();
  });

  it('keeps identities and a membership joined while workspace file cleanup is pending', async () => {
    const f = fixture();
    const otherOrg = uid(5);
    f.tables.organization_members.push({ org_id: ORG, user_id: OTHER, role: 'member' });
    let notifyRemoval!: () => void;
    let resumeRemoval!: () => void;
    const removalStarted = new Promise<void>(resolve => { notifyRemoval = resolve; });
    const removalResumed = new Promise<void>(resolve => { resumeRemoval = resolve; });
    const storageFrom = f.admin.storage.from;
    f.admin.storage.from = bucket => {
      const storage = storageFrom(bucket);
      return {
        ...storage,
        async remove(paths: string[]) {
          notifyRemoval();
          await removalResumed;
          return storage.remove(paths);
        },
      };
    };

    const deletion = handleOrgDeletion(f.admin, f.userClient, CALLER, ORG);
    await removalStarted;
    const newMembership = { org_id: otherOrg, user_id: OTHER, role: 'member' };
    f.tables.organization_members.push(newMembership);
    resumeRemoval();
    const response = await deletion;

    expect(response.status).toBe(200);
    expect((await response.json()).users_deleted).toBe(0);
    expect(f.tables.organization_members).toEqual([newMembership]);
    expect([...f.identities]).toEqual([CALLER, OTHER]);
    expect(f.deleteUser).not.toHaveBeenCalled();
  });

  it.each(['organization_members', 'projects'])('keeps accounts and files when %s cannot be read', async table => {
    const f = fixture();
    f.failRead(table);
    expect((await handleOrgDeletion(f.admin, f.userClient, CALLER, ORG)).status).toBe(503);
    expect(f.rpcCalls).toBe(0);
    expect(f.objects.size).toBe(2);
    expect([...f.identities]).toEqual([CALLER, OTHER]);
    expect(f.deleteUser).not.toHaveBeenCalled();
  });

  it('refuses a non-owner before any erasure or Auth deletion', async () => {
    const f = fixture();
    f.tables.organization_members[0].role = 'admin';
    expect((await handleOrgDeletion(f.admin, f.userClient, CALLER, ORG)).status).toBe(403);
    expect(f.rpcCalls).toBe(0);
    expect(f.objects.size).toBe(2);
    expect(f.deleteUser).not.toHaveBeenCalled();
  });

  it.each(['rpc', 'journal', 'storage'] as const)('keeps every identity when %s erasure fails', async failure => {
    const f = fixture();
    if (failure === 'rpc') f.failRpc();
    if (failure === 'journal') f.failRead('data_erasure_log');
    if (failure === 'storage') f.failRemove(true);
    const response = await handleOrgDeletion(f.admin, f.userClient, CALLER, ORG);
    expect(response.status).toBe(failure === 'rpc' ? 400 : 503);
    expect((await response.json()).ok).not.toBe(true);
    expect(f.objects.size).toBe(2);
    expect([...f.identities]).toEqual([CALLER, OTHER]);
    expect(f.deleteUser).not.toHaveBeenCalled();
  });

  it.each(['journal', 'storage'] as const)('directs failed workspace %s cleanup to support without suggesting account deletion', async failure => {
    const f = fixture();
    if (failure === 'journal') f.failRead('data_erasure_log');
    if (failure === 'storage') f.failRemove(true);
    const response = await handleOrgDeletion(f.admin, f.userClient, CALLER, ORG);
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toBe(failure === 'storage' ? 'STORAGE_ERASURE_FAILED' : 'ACCOUNT_CLEANUP_INCOMPLETE');
    expect(body.detail).toContain('support@steelbuild-pro.com');
    expect(body.detail).toContain('Account sign-ins were kept');
    expect(body.detail).not.toMatch(/account deletion/i);
  });

  it('allows explicit self-deletion after workspace erasure without deleting former members', async () => {
    const f = fixture();
    f.tables.organization_members.push({ org_id: ORG, user_id: OTHER, role: 'member' });
    const workspaceResponse = await handleOrgDeletion(f.admin, f.userClient, CALLER, ORG);
    expect(workspaceResponse.status).toBe(200);
    expect(f.deleteUser).not.toHaveBeenCalled();

    const accountResponse = await handleAccountDeletion(f.admin, f.userClient, CALLER);
    expect(accountResponse.status).toBe(200);
    expect(await accountResponse.json()).toEqual({
      ok: true, mode: 'account', orgs_deleted: 0, storage_objects_removed: 0, users_deleted: 1,
    });
    expect(f.deleteUser).toHaveBeenCalledExactlyOnceWith(CALLER);
    expect([...f.identities]).toEqual([OTHER]);
  });

  it('does not delete the caller or teammates when self-deletion would orphan a shared workspace', async () => {
    const f = fixture();
    f.tables.organization_members.push({ org_id: ORG, user_id: OTHER, role: 'member' });
    const response = await handleAccountDeletion(f.admin, f.userClient, CALLER);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe('SOLE_OWNER_WITH_MEMBERS');
    expect(f.rpcCalls).toBe(0);
    expect([...f.identities]).toEqual([CALLER, OTHER]);
    expect(f.deleteUser).not.toHaveBeenCalled();
  });
});
