import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { prepareRetirement, applyRetirement, approvedVersion, inspectBackup, readFunctionInventory } from '../supabase-retire-deprecated.ts';

const approved = ['bluebeam-proxy', 'schedule-assistant', 'sharepoint-proxy', 'stripe-setup', 'stripe-worker'];
const versions = [23, 32, 26, 10, 10];
const inventory = () => [...approved, 'stripe-webhook', 'stripe-billing', 'sheets-api'].map((slug, i) => ({ slug, id: `id-${slug}`, version: versions[i] ?? 26, status: 'ACTIVE', verify_jwt: true }));
const local = { migrations: [], functions: ['stripe-billing', 'sheets-api'] };
const manifest = { schemaVersion: 1, projectRef: 'kjrwqagyeswwoxpjkcko', local: { owner: 'owner/repo', migrationLifecycle: 'required', functionLifecycle: 'required', functionOverrides: [] }, migrations: [], functions: [...approved, 'stripe-webhook'].map(slug => ({ slug, owner: 'owner/repo', lifecycle: 'deprecated', evidence: 'reviewed' })) };
const dirs: string[] = [];
function directory() { const p = mkdtempSync(path.join(tmpdir(), 'retirement-test-')); dirs.push(p); return p; }
function source(root: string, slug: string, body = 'export default 1;') { const p = path.join(root, 'supabase/functions', slug); mkdirSync(p, { recursive: true }); writeFileSync(path.join(p, 'index.ts'), body); }
afterEach(() => dirs.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })));
function harness() {
  let remote = inventory();
  const deleted: string[] = [];
  const backupRoot = directory();
  return { backupRoot, deleted, options: { manifest, local, backupRoot, readInventory: async () => structuredClone(remote), download: async (slug: string, dest: string) => source(dest, slug) }, setRemote: (rows: typeof remote) => { remote = rows; }, remove: async (slug: string) => { deleted.push(slug); remote = remote.filter(row => row.slug !== slug); } };
}
const upload = { artifactId: '12345', artifactDigest: 'a'.repeat(64) };

describe('narrow deprecated function retirement', () => {
  it('refuses webhook, active billing, prototype keys, and arbitrary slugs', () => {
    for (const slug of ['stripe-webhook', 'stripe-billing', 'sheets-api', '__proto__', 'constructor', 'anything']) expect(() => approvedVersion(slug)).toThrow();
    expect(approvedVersion('schedule-assistant')).toBe(32);
  });
  it('prepares source backups by default without deleting any function', async () => {
    const h = harness(); const receipt = await prepareRetirement(h.options);
    expect(receipt.backups.map(b => b.slug)).toEqual(approved);
    expect(receipt.backups.every(b => b.files.length > 0)).toBe(true);
    expect(h.deleted).toEqual([]);
    expect(await applyRetirement({ ...h.options, receipt, remove: h.remove })).toEqual({ mode: 'dry-run', deleted: [] });
    expect(h.deleted).toEqual([]);
  });
  it('deletes only backed-up approved versions and preserves all other functions', async () => {
    const h = harness(); const receipt = await prepareRetirement(h.options);
    const result = await applyRetirement({ ...h.options, receipt, apply: true, ...upload, remove: h.remove });
    expect(result.deleted).toEqual(approved);
    expect((await h.options.readInventory()).map(r => r.slug)).toEqual(['stripe-webhook', 'stripe-billing', 'sheets-api']);
  });
  it.each(['new-version', 'missing', 'unknown', 'wrong-project', 'not-deprecated', 'empty-inventory'])('fails closed before backup for %s', async mode => {
    const h = harness(); const options = { ...h.options, manifest: structuredClone(manifest) };
    const rows = inventory();
    if (mode === 'new-version') rows[0].version = 24;
    if (mode === 'missing') rows.shift();
    if (mode === 'unknown') rows.push({ ...rows[0], slug: 'new-unknown' });
    if (mode === 'wrong-project') options.manifest.projectRef = 'abcdefghijklmnopqrst';
    if (mode === 'not-deprecated') options.manifest.functions[0].lifecycle = 'required';
    h.setRemote(mode === 'empty-inventory' ? [] : rows);
    await expect(prepareRetirement(options)).rejects.toThrow(); expect(h.deleted).toEqual([]);
  });
  it('refuses a failed or incomplete download', async () => {
    const h = harness();
    await expect(prepareRetirement({ ...h.options, download: async () => { throw new Error('download failed'); } })).rejects.toThrow('download failed');
    await expect(prepareRetirement({ ...h.options, backupRoot: directory(), download: async () => {} })).rejects.toThrow();
  });
  it('rejects an entrypoint whose local dependency is missing', () => {
    const root = directory(); source(root, 'bluebeam-proxy', 'import "./missing.ts";');
    expect(() => inspectBackup(root, 'bluebeam-proxy')).toThrow();
  });
  it('stops if remote inventory changes while backups are downloaded', async () => {
    const h = harness();
    await expect(prepareRetirement({ ...h.options, download: async (slug, dest) => { source(dest, slug); const rows = inventory(); rows[0].version++; h.setRemote(rows); } })).rejects.toThrow();
    expect(h.deleted).toEqual([]);
  });
  it.each(['no-artifact', 'changed-backup', 'changed-version', 'failed-inventory', 'missing-backup'])('refuses apply before any deletion for %s', async mode => {
    const h = harness(); const receipt = await prepareRetirement(h.options);
    if (mode === 'changed-backup') source(path.join(h.backupRoot, 'bluebeam-proxy'), 'bluebeam-proxy', 'changed');
    if (mode === 'changed-version') { const rows = inventory(); rows[1].version++; h.setRemote(rows); }
    if (mode === 'missing-backup') receipt.backups.pop();
    const options = { ...h.options, receipt, apply: true, ...upload, remove: h.remove };
    if (mode === 'no-artifact') options.artifactId = '';
    if (mode === 'failed-inventory') options.readInventory = async () => { throw new Error('HTTP 503'); };
    await expect(applyRetirement(options)).rejects.toThrow(); expect(h.deleted).toEqual([]);
  });
  it('detects deletion failure and refuses to continue deleting', async () => {
    const h = harness(); const receipt = await prepareRetirement(h.options);
    await expect(applyRetirement({ ...h.options, receipt, apply: true, ...upload, remove: async () => {} })).rejects.toThrow();
    expect((await h.options.readInventory())).toHaveLength(8);
  });
  it('detects changes to protected webhook after one deletion and stops', async () => {
    const h = harness(); const receipt = await prepareRetirement(h.options);
    await expect(applyRetirement({ ...h.options, receipt, apply: true, ...upload, remove: async slug => { await h.remove(slug); const rows = await h.options.readInventory(); rows.find(r => r.slug === 'stripe-webhook')!.version++; h.setRemote(rows); } })).rejects.toThrow();
    expect(h.deleted).toEqual(['bluebeam-proxy']);
  });
  it('rejects HTTP failures and malformed inventory rather than treating them as absence', async () => {
    await expect(readFunctionInventory('token', async () => new Response('bad', { status: 503 }))).rejects.toThrow();
    await expect(readFunctionInventory('token', async () => new Response('{}', { status: 200 }))).rejects.toThrow();
  });
});
