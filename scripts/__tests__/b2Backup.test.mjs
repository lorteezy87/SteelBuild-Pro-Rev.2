import { describe, expect, it } from 'vitest';
import { calculateBudget, parseB2Config, readB2Inventory } from '../lib/b2Backup.mjs';

const file = (path, size, sha1 = 'a'.repeat(40)) => ({ Path: path, Size: size, Hashes: { sha1 } });
describe('B2 storage budget', () => {
  it('charges only changed content, including same-size replacements', () => {
    expect(calculateBudget({ storedBytes: 100, source: [file('same', 5), file('changed', 10, 'b'.repeat(40)), file('new', 20)], current: [file('same', 5), file('changed', 10), file('deleted', 30)], reserveBytes: 50 }).projectedBytes).toBe(180);
  });
  it('does not subtract deleted files or old versions', () => {
    expect(calculateBudget({ storedBytes: 8999999990, source: [], current: [file('deleted', 100)], reserveBytes: 20 }).allowed).toBe(false);
  });
  it('fails closed for unknown hashes, malformed sizes, and duplicate names', () => {
    for (const source of [[file('x', -1)], [file('x', 2, '')], [file('x', 2), file('x', 2)]]) {
      expect(() => calculateBudget({ storedBytes: 0, source, current: [] })).toThrow();
    }
  });
  it('allows an exact budget boundary, rejects one byte above it', () => {
    expect(calculateBudget({ storedBytes: 8999999990, source: [file('x', 10)], current: [], reserveBytes: 0 }).allowed).toBe(true);
    expect(calculateBudget({ storedBytes: 8999999991, source: [file('x', 10)], current: [], reserveBytes: 0 }).allowed).toBe(false);
  });
});
describe('B2 configuration', () => {
  it('accepts only native B2 with explicit safe configuration', () => {
    expect(parseB2Config('[offsite]\ntype = b2\naccount = id\nkey = secret\n')).toEqual({ account: 'id', key: 'secret' });
    for (const extra of ['hard_delete = true', 'versions = true', 'endpoint = https://other.example', 'lifecycle = 1']) {
      expect(() => parseB2Config(`[offsite]\ntype = b2\naccount = id\nkey = secret\n${extra}\n`)).toThrow();
    }
  });
});
function apiMock({ unfinished = false, lifecycle = [], malformed = false } = {}) {
  const calls = [];
  const fetcher = async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : {};
    calls.push({ url, body });
    let result;
    if (url.endsWith('b2_authorize_account')) result = { accountId: 'account', authorizationToken: 'token', apiInfo: { storageApi: { apiUrl: 'https://api001.backblazeb2.com', allowed: { namePrefix: null } } } };
    if (url.endsWith('b2_list_buckets')) result = { buckets: [{ bucketName: 'backup', bucketId: 'bucket', bucketType: 'allPrivate', lifecycleRules: lifecycle }] };
    if (url.endsWith('b2_list_unfinished_large_files')) result = { files: unfinished ? [{}] : [] };
    if (url.endsWith('b2_list_file_versions')) result = body.startFileName ? { files: [{ action: 'upload', fileId: 'old', fileName: 'x', contentLength: 7 }], nextFileName: null, nextFileId: null } : { files: [{ action: 'upload', fileId: 'new', fileName: 'x', contentLength: malformed ? -1 : 10 }, { action: 'hide', fileId: 'hidden', fileName: 'y', contentLength: 0 }], nextFileName: 'x', nextFileId: 'old' };
    return { ok: true, json: async () => result };
  };
  return { fetcher, calls };
}
describe('B2 native inventory', () => {
  it('paginates exact object versions across the whole bucket', async () => {
    const { fetcher, calls } = apiMock();
    expect(await readB2Inventory({ account: 'id', key: 'secret', bucketName: 'backup', fetcher })).toMatchObject({ storedBytes: 17, versions: 2 });
    expect(calls.filter(c => c.url.endsWith('b2_list_file_versions')).map(c => c.body)).toEqual([{ bucketId: 'bucket', maxFileCount: 10000 }, { bucketId: 'bucket', maxFileCount: 10000, startFileName: 'x', startFileId: 'old' }]);
  });
  it('stops on unfinished uploads or automatic version deletion', async () => {
    for (const options of [{ unfinished: true }, { lifecycle: [{ daysFromHidingToDeleting: 1 }] }, { malformed: true }]) {
      await expect(readB2Inventory({ account: 'id', key: 'secret', bucketName: 'backup', ...apiMock(options) })).rejects.toThrow();
    }
  });
  it('does not echo authentication material on an API failure', async () => {
    await expect(readB2Inventory({ account: 'id', key: 'secret', bucketName: 'backup', fetcher: async () => ({ ok: false, status: 401 }) })).rejects.toThrow('B2 b2_authorize_account failed (HTTP 401)');
  });
});

import { runIncrementalBackup } from '../lib/b2Backup.mjs';
describe('incremental execution', () => {
  const plan = ['app-files', 'email-attachments', 'sheets-files'].map(bucket => ({ bucket, source: `supabase:${bucket}`, current: `offsite:backup/current/${bucket}` }));
  function executor() {
    const calls = [];
    return { calls, execute: async (args) => {
      calls.push(args);
      if (args[0] === 'lsjson') return JSON.stringify(args[1].startsWith('offsite:') ? [] : [file('a.txt', 100)]);
      if (args[0] === 'size') return JSON.stringify({ count: 1, bytes: 100 });
      return '';
    } };
  }
  it('refuses all destination writes if projected versions exceed the budget', async () => {
    const { calls, execute } = executor();
    await expect(runIncrementalBackup({ plan, stageRoot: '/tmp/stage', execute, inventory: async () => ({ storedBytes: 8999999900 }) })).rejects.toThrow('9 GB');
    expect(calls.some(a => a[0] === 'sync')).toBe(false);
  });
  it('stages all buckets, checks budget, then syncs only current paths and checks SHA-1', async () => {
    const { calls, execute } = executor();
    const result = await runIncrementalBackup({ plan, stageRoot: '/tmp/stage', execute, inventory: async () => ({ storedBytes: 0 }) });
    expect(result.buckets).toHaveLength(3);
    expect(result.buckets[0].files[0].sha1).toBe('a'.repeat(40));
    expect(result.budget.transferBytes).toBe(300);
    expect(calls.filter(a => a[0] === 'sync')).toHaveLength(3);
    expect(calls.filter(a => a[0] === 'sync').every(a => a.includes('--checksum') && a.includes('--b2-hard-delete=false'))).toBe(true);
    expect(calls.filter(a => a[0] === 'check').every(a => !a.includes('--size-only'))).toBe(true);
    expect(JSON.stringify(calls)).not.toContain('snapshots/');
  });
  it('does not report verification if a transfer or checksum check fails', async () => {
    const { execute } = executor();
    await expect(runIncrementalBackup({ plan, stageRoot: '/tmp/stage', inventory: async () => ({ storedBytes: 0 }), execute: async args => {
      if (args[0] === 'check') throw new Error('checksum mismatch');
      return execute(args);
    } })).rejects.toThrow('checksum mismatch');
  });
});

import { planSourcePaths } from '../lib/b2Backup.mjs';
it('preserves real objects whose keys end in slash or collide with a directory', () => {
  const plan = planSourcePaths([file('folder/', 21), file('folder/child.txt', 11), file('prefix', 4), file('prefix/child', 5)]);
  expect(plan.filter(p => p.special)).toHaveLength(2);
  expect(plan.find(p => p.sourcePath === 'folder/').path).toMatch(/^__steelbuild_object_keys__\/[a-f0-9]{64}$/);
  expect(plan.find(p => p.sourcePath === 'folder/child.txt').path).toBe('folder/child.txt');
  expect(new Set(plan.map(p => p.path)).size).toBe(4);
});
it('rejects source keys in the reserved backup namespace', () => {
  expect(() => planSourcePaths([file('__steelbuild_object_keys__/x', 1)])).toThrow('reserved');
});

import { assertManifestFits } from '../lib/b2Backup.mjs';
it('reserves space for long original object keys before any destination writes', () => {
  const files = Array.from({ length: 9500 }, (_, i) => ({ path: `__steelbuild_object_keys__/${i.toString().padStart(64, '0')}`, sourcePath: `${i}/${'x'.repeat(980)}/`, bytes: 1, sha1: 'a'.repeat(40) }));
  expect(() => assertManifestFits([{ bucket: 'email-attachments', files }])).toThrow('manifest');
});
