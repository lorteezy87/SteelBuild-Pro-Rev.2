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
  const reads: string[] = [];
  let failTable: string | undefined;
  let missingTable: string | undefined;
  let countFailure: 'error' | 'null' | undefined;
  let removeFailure = false;
  let rpcCalls = 0;
  const deleteUser = vi.fn(async (_id: string) => ({ data: {}, error: null }));
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
          if (failTable === table || (head && countFailure === 'error')) return Promise.resolve(resolve({ data: null, count: null, error: { message: 'read unavailable' } }));
          if (missingTable === table) return Promise.resolve(resolve({ data: null, count: null, error: null }));
          const rows = (tables[table] ?? []).filter(row => filters.every(filter => filter(row))).sort((a, b) => String(a[column]).localeCompare(String(b[column])));
          return Promise.resolve(resolve({ data: head ? null : single ? rows[0] ?? null : rows.slice(0, limit), count: countFailure === 'null' ? null : rows.length, error: null }));
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
      if (!tables.organizations.length) return { data: { org_ids: [], project_ids: [] }, error: null };
      tables.data_erasure_log.push({ id: uid(10), kind: 'organization', org_id: ORG, requested_by: CALLER, row_counts: { projects: 1, per_project: { [PROJECT]: {} } } });
      tables.organizations = [];
      tables.projects = [];
      tables.organization_members = [];
      return { data: { org_ids: [ORG], project_ids: [PROJECT] }, error: null };
    },
  };
  return {
    admin, userClient, tables, objects, reads, deleteUser,
    get rpcCalls() { return rpcCalls; },
    failRead(table: string) { failTable = table; },
    missingRead(table: string) { missingTable = table; },
    failCount(value: 'error' | 'null') { countFailure = value; },
    failRemove(value: boolean) { removeFailure = value; },
  };
}

describe('account erasure completion', () => {
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

describe('workspace erasure uncertain reads', () => {
  it.each(['projects', 'organization_members'])('requires complete %s snapshots before the RPC', async table => {
    const f = fixture();
    // Membership snapshot must fail after ownership lookup, not instead of it.
    if (table === 'organization_members') {
      const from = f.admin.from;
      let memberReads = 0;
      f.admin.from = name => { if (name === table && ++memberReads > 1) f.failRead(table); return from(name); };
    } else f.failRead(table);
    expect((await handleOrgDeletion(f.admin, f.userClient, CALLER, ORG)).status).toBeGreaterThanOrEqual(400);
    expect(f.rpcCalls).toBe(0);
    expect(f.objects.size).toBe(2);
    expect(f.deleteUser).not.toHaveBeenCalled();
  });

  it.each(['error', 'null'] as const)('never treats %s membership counts as zero', async failure => {
    const f = fixture();
    f.failCount(failure);
    expect((await handleOrgDeletion(f.admin, f.userClient, CALLER, ORG)).status).toBe(503);
    expect(f.deleteUser).not.toHaveBeenCalled();
  });
});
