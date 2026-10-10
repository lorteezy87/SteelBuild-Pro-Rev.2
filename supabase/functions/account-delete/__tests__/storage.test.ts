import { describe, expect, it } from 'vitest';
import { purgeWorkspaceStorage, removeAll, StoragePurgeError } from '../storage';

interface ListOptions {
  limit: number;
  offset?: number;
  sortBy?: { column: string; order: string };
}

// A mutable fake Storage service: remove actually shrinks subsequent listings.
// That catches pagination which advances an offset after deleting earlier rows.
function storageFixture(initial: string[], failure?: {
  listCall?: number;
  removeCall?: number;
  nullListCall?: number;
  nullRemoveCall?: number;
  skipRemoveCall?: number;
  throwListCall?: number;
}) {
  const objects = new Set(initial);
  const listed: Array<{ path: string; options: ListOptions }> = [];
  const removed: string[][] = [];
  const admin = {
    storage: {
      from: (_bucket: string) => ({
        async list(path: string, options: ListOptions) {
          listed.push({ path, options });
          if (listed.length === failure?.throwListCall) throw new Error('network rejected');
          if (listed.length === failure?.listCall) return { data: null, error: { message: 'list unavailable' } };
          if (listed.length === failure?.nullListCall) return { data: null, error: null };
          const entries = new Map<string, { name: string; id: string | null; metadata: Record<string, unknown> | null }>();
          for (const key of objects) {
            if (!key.startsWith(`${path}/`)) continue;
            const relative = key.slice(path.length + 1);
            const name = relative.split('/')[0];
            const folder = relative.includes('/');
            entries.set(name, { name, id: folder ? null : key, metadata: folder ? null : { size: 1 } });
          }
          const all = [...entries.values()].sort((a, b) => a.name.localeCompare(b.name));
          const start = options.offset ?? 0;
          return { data: all.slice(start, start + options.limit), error: null };
        },
        async remove(paths: string[]) {
          removed.push(paths);
          if (removed.length === failure?.removeCall) return { data: null, error: { message: 'remove unavailable' } };
          if (removed.length === failure?.nullRemoveCall) return { data: null, error: null };
          if (removed.length === failure?.skipRemoveCall) return { data: [], error: null };
          const data = paths.filter((path) => objects.delete(path)).map((name) => ({ name }));
          return { data, error: null };
        },
      }),
    },
  };
  return { admin, objects, listed, removed };
}

const files = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => `${prefix}/file-${String(i).padStart(5, '0')}.pdf`);

describe('account deletion Storage purge', () => {
  it('removes every page of files and folders without skipping when removal changes the listing', async () => {
    const paths = [
      ...files('org', 1250),
      ...files('org/nested', 2001),
      ...Array.from({ length: 1001 }, (_, i) => `org/folder-${String(i).padStart(5, '0')}/attachment.pdf`),
    ];
    const fixture = storageFixture([...paths, 'other-org/keep.pdf']);
    expect(await removeAll(fixture.admin, 'app-files', 'org')).toBe(4252);
    expect([...fixture.objects]).toEqual(['other-org/keep.pdf']);
    expect(new Set(fixture.removed.flat()).size).toBe(4252);
    expect(fixture.listed.some(({ path, options }) => path === 'org' && options.offset === 2000)).toBe(true);
    expect(fixture.listed.some(({ path, options }) => path === 'org/nested' && options.offset === 2000)).toBe(true);
    expect(fixture.listed.every(({ options }) => options.sortBy?.column === 'name' && options.sortBy.order === 'asc')).toBe(true);
  });

  it('handles an exact full page and an empty prefix', async () => {
    const fixture = storageFixture(files('org', 1000));
    expect(await removeAll(fixture.admin, 'app-files', 'org')).toBe(1000);
    expect(fixture.objects.size).toBe(0);
    expect(await removeAll(fixture.admin, 'app-files', 'org')).toBe(0);
  });

  it('stops before deleting anything when a later listing page fails', async () => {
    const fixture = storageFixture(files('org', 1200), { listCall: 2 });
    await expect(removeAll(fixture.admin, 'app-files', 'org')).rejects.toThrow(/list unavailable/);
    expect(fixture.removed).toEqual([]);
    expect(fixture.objects.size).toBe(1200);
  });

  it('does not treat a missing listing body as an empty directory', async () => {
    const fixture = storageFixture(files('org', 1), { nullListCall: 1 });
    await expect(removeAll(fixture.admin, 'app-files', 'org')).rejects.toThrow(/listing/i);
    expect(fixture.objects.size).toBe(1);
  });

  it('rejects a failed removal batch instead of returning partial success', async () => {
    const fixture = storageFixture(files('org', 250), { removeCall: 2 });
    await expect(removeAll(fixture.admin, 'app-files', 'org')).rejects.toThrow(/remove unavailable/);
    expect(fixture.objects.size).toBe(150);
    expect(fixture.removed).toHaveLength(2);
  });

  it('does not claim success when a removal response is missing', async () => {
    const fixture = storageFixture(files('org', 1), { nullRemoveCall: 1 });
    await expect(removeAll(fixture.admin, 'app-files', 'org')).rejects.toThrow(/Missing removal result/);
    expect(fixture.objects.size).toBe(1);
  });

  it('verifies the prefix is empty even when removal returned no error', async () => {
    const fixture = storageFixture(files('org', 1), { skipRemoveCall: 1 });
    await expect(removeAll(fixture.admin, 'app-files', 'org')).rejects.toThrow(/Objects remain/);
    expect(fixture.objects.size).toBe(1);
  });

  it('preserves a typed cleanup error for rejected network requests', async () => {
    const fixture = storageFixture(files('org', 1), { throwListCall: 1 });
    await expect(removeAll(fixture.admin, 'app-files', 'org')).rejects.toBeInstanceOf(StoragePurgeError);
    expect(fixture.objects.size).toBe(1);
  });

  it('propagates a workspace cleanup failure and does not continue with other scopes', async () => {
    const fixture = storageFixture(['org/file.pdf', 'other-org/file.pdf', 'project/email.pdf'], { removeCall: 1 });
    await expect(purgeWorkspaceStorage(fixture.admin, ['org', 'other-org'], ['project'])).rejects.toBeInstanceOf(StoragePurgeError);
    expect([...fixture.objects]).toEqual(['org/file.pdf', 'other-org/file.pdf', 'project/email.pdf']);
    expect(fixture.listed.map(({ path }) => path)).toEqual(['org']);
  });

  it('refuses an unscoped prefix before touching Storage', async () => {
    const fixture = storageFixture(['org/file.pdf']);
    await expect(removeAll(fixture.admin, 'app-files', '')).rejects.toThrow(/scoped prefix/);
    expect(fixture.listed).toEqual([]);
  });
});
