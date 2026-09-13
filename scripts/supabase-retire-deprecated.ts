#!/usr/bin/env node
/** Manual, backup-first retirement of five reviewed versions. Never use the
 * broader manifest deletion helper: stripe-webhook has live endpoint evidence.
 * No schema/secret/Stripe uninstall operations exist in this helper.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { compareDrift, localInventory, readManifest, validateManifest } from './supabase-drift-check.mjs';

const PROJECT = 'kjrwqagyeswwoxpjkcko';
const APPROVED = new Map([['bluebeam-proxy', 23], ['schedule-assistant', 32], ['sharepoint-proxy', 26], ['stripe-setup', 10], ['stripe-worker', 10]]);
const SLUGS = [...APPROVED.keys()];
type InventoryRow = { slug: string; id: string; version: number; status: string; [key: string]: unknown };
type Local = { migrations: string[]; functions: string[] };
type Manifest = { projectRef: string; functions: { slug: string; lifecycle: string }[]; [key: string]: unknown };
type BackupFile = { path: string; bytes: number; sha256: string };
type Backup = { slug: string; version: number; files: BackupFile[] };
type Receipt = { schemaVersion: number; projectRef: string; inventory: InventoryRow[]; backups: Backup[] };
type Options = { manifest: Manifest; local: Local; backupRoot: string; readInventory: () => Promise<unknown>; download: (slug: string, destination: string) => Promise<void> };
type ApplyOptions = Omit<Options, 'download'> & { receipt: Receipt; apply?: boolean; artifactId?: string; artifactDigest?: string; remove: (slug: string) => Promise<void> };

export function approvedVersion(slug: string): number {
  const version = APPROVED.get(slug);
  if (version === undefined) throw new Error(`Refusing protected or unapproved function: ${slug}`);
  return version;
}
function validatedInventory(value: unknown): InventoryRow[] {
  if (!Array.isArray(value) || !value.length) throw new Error('Unsuccessful or empty function inventory.');
  const slugs = new Set<string>();
  const ids = new Set<string>();
  for (const row of value) {
    if (!row || typeof row.slug !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(row.slug)
      || typeof row.id !== 'string' || !row.id || !Number.isSafeInteger(row.version) || row.version < 1
      || typeof row.status !== 'string' || !row.status || slugs.has(row.slug) || ids.has(row.id)) {
      throw new Error('Invalid or duplicate function inventory row.');
    }
    slugs.add(row.slug); ids.add(row.id);
  }
  return value as InventoryRow[];
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
function unchanged(expected: InventoryRow[], actual: unknown): InventoryRow[] {
  const rows = validatedInventory(actual);
  const sorted = (list: InventoryRow[]) => [...list].sort((a, b) => a.slug.localeCompare(b.slug));
  if (canonical(sorted(expected)) !== canonical(sorted(rows))) throw new Error('Function inventory changed; stopping before further deletions.');
  return rows;
}
function assertPlan(manifest: Manifest, local: Local, rows: InventoryRow[]) {
  validateManifest(manifest, local);
  if (manifest.projectRef !== PROJECT) throw new Error('Refusing a different project.');
  const report = compareDrift(manifest, local, [], rows) as { hasDrift: boolean; unknownFunctions: string[]; missingFunctions: string[]; unresolvedFunctions: string[] };
  if (report.unknownFunctions.length || report.missingFunctions.length || report.unresolvedFunctions.length) {
    throw new Error('Unknown, missing required, or unresolved function inventory.');
  }
  for (const slug of SLUGS) {
    if (!manifest.functions.some(entry => entry.slug === slug && entry.lifecycle === 'deprecated')) throw new Error(`Manifest does not classify ${slug} as deprecated.`);
    const row = rows.find(entry => entry.slug === slug);
    if (!row || row.version !== approvedVersion(slug) || row.status !== 'ACTIVE') throw new Error(`Missing or unapproved version/status for ${slug}.`);
  }
}

/** Hash every downloaded file, reject symlinks and missing local modules. CLI
 * server-side unbundling supplies the deployable source, not just index.ts.
 * Remote/npm/jsr imports stay imports; this is not an offline dependency mirror.
 */
export function inspectBackup(root: string, slug: string): BackupFile[] {
  approvedVersion(slug);
  if (!existsSync(root) || lstatSync(root).isSymbolicLink()) throw new Error('Missing or unsafe backup directory.');
  const files: BackupFile[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const full = path.join(dir, name); const stat = lstatSync(full);
      if (stat.isSymbolicLink()) throw new Error('Backup contains a symlink.');
      if (stat.isDirectory()) walk(full);
      else if (stat.isFile()) {
        const contents = readFileSync(full);
        files.push({ path: path.relative(root, full).split(path.sep).join('/'), bytes: contents.length, sha256: createHash('sha256').update(contents).digest('hex') });
      } else throw new Error('Backup contains a non-regular file.');
    }
  };
  walk(root);
  const entry = files.find(file => file.path === `supabase/functions/${slug}/index.ts` || file.path === `supabase/functions/${slug}/index.js`);
  if (!entry || !entry.bytes || !readFileSync(path.join(root, entry.path), 'utf8').trim()) throw new Error(`Incomplete source backup for ${slug}.`);
  for (const file of files.filter(f => /\.(?:[cm]?[jt]sx?)$/.test(f.path))) {
    const source = readFileSync(path.join(root, file.path), 'utf8');
    for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)["'](\.[^"']*)["']/g)) {
      const resolved = path.resolve(root, path.dirname(file.path), match[1]);
      if (!resolved.startsWith(path.resolve(root) + path.sep) || !existsSync(resolved) || !lstatSync(resolved).isFile()) throw new Error(`Missing local dependency in ${slug}: ${match[1]}`);
    }
  }
  return files;
}
export async function prepareRetirement(options: Options): Promise<Receipt> {
  const rows = validatedInventory(await options.readInventory());
  assertPlan(options.manifest, options.local, rows);
  mkdirSync(options.backupRoot, { recursive: true });
  if (readdirSync(options.backupRoot).length) throw new Error('Backup destination must be empty.');
  const backups: Backup[] = [];
  for (const slug of SLUGS) {
    unchanged(rows, await options.readInventory()); // Exact approved versions immediately before each backup.
    const temp = mkdtempSync(path.join(tmpdir(), `supabase-retire-${slug}-`));
    try {
      await options.download(slug, temp);
      const files = inspectBackup(temp, slug);
      unchanged(rows, await options.readInventory());
      cpSync(temp, path.join(options.backupRoot, slug), { recursive: true, errorOnExist: true, force: false });
      backups.push({ slug, version: approvedVersion(slug), files });
    } finally { rmSync(temp, { recursive: true, force: true }); }
  }
  const receipt: Receipt = { schemaVersion: 1, projectRef: PROJECT, inventory: rows, backups };
  writeFileSync(path.join(options.backupRoot, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  return receipt;
}
export async function applyRetirement(options: ApplyOptions): Promise<{ mode: string; deleted: string[] }> {
  if (options.apply === undefined || options.apply === false) return { mode: 'dry-run', deleted: [] };
  if (options.apply !== true) throw new Error('Apply must be boolean true.');
  if (!/^\d+$/.test(options.artifactId ?? '') || !/^[a-f0-9]{64}$/.test(options.artifactDigest ?? '')) throw new Error('Successful backup artifact upload is required.');
  const receipt = options.receipt;
  if (receipt.schemaVersion !== 1 || receipt.projectRef !== PROJECT || !Array.isArray(receipt.backups)
    || canonical(receipt.backups.map(b => b.slug)) !== canonical(SLUGS)) throw new Error('Incomplete or invalid backup receipt.');
  const baseline = validatedInventory(receipt.inventory);
  assertPlan(options.manifest, options.local, baseline);
  for (const backup of receipt.backups) {
    if (backup.version !== approvedVersion(backup.slug) || canonical(inspectBackup(path.join(options.backupRoot, backup.slug), backup.slug)) !== canonical(backup.files)) throw new Error(`Backup content/version changed: ${backup.slug}`);
  }
  let expected = baseline;
  const deleted: string[] = [];
  for (const slug of SLUGS) {
    unchanged(expected, await options.readInventory()); // Includes every target's exact version and every protected function.
    approvedVersion(slug);
    await options.remove(slug);
    expected = expected.filter(row => row.slug !== slug);
    unchanged(expected, await options.readInventory()); // A failed delete or unrelated change halts the next delete.
    deleted.push(slug);
  }
  return { mode: 'apply', deleted };
}
export async function readFunctionInventory(token: string, fetcher: typeof fetch = fetch): Promise<InventoryRow[]> {
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN is required.');
  const response = await fetcher(`https://api.supabase.com/v1/projects/${PROJECT}/functions`, {
    headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Function inventory failed (HTTP ${response.status}).`);
  return validatedInventory(await response.json());
}
function runCli(operation: 'download' | 'delete', slug: string, cwd: string) {
  approvedVersion(slug);
  const args = ['--yes', 'supabase@2.117.0', 'functions', operation, slug, '--project-ref', PROJECT, ...(operation === 'download' ? ['--use-api'] : ['--yes'])];
  const result = spawnSync('npx', args, { cwd, env: { ...process.env, SUPABASE_WORKDIR: cwd }, encoding: 'utf8', timeout: 180_000, maxBuffer: 10 * 1024 * 1024 });
  // CLI output may contain source or configuration. Keep it out of workflow logs.
  if (result.error || result.status !== 0) throw new Error(`Pinned Supabase CLI ${operation} failed for ${slug} (exit ${result.status}).`);
}
async function main() {
  const [phase, destination, ...extra] = process.argv.slice(2);
  if (!['prepare', 'apply'].includes(phase) || !destination || extra.length) throw new Error('Usage: node scripts/supabase-retire-deprecated.ts <prepare|apply> <backup-directory>');
  if (process.env.GITHUB_REPOSITORY !== 'lorteezy87/SteelBuild-Pro-Rev.2' || process.env.GITHUB_REF !== 'refs/heads/main'
    || process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || process.env.CONFIRM_PROJECT_REF !== PROJECT) throw new Error('Only the manual main workflow for the fixed production project is allowed.');
  const token = process.env.SUPABASE_ACCESS_TOKEN ?? '';
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN is required.');
  const backupRoot = path.resolve(destination);
  const evidenceRoot = `${backupRoot}-inventory`;
  mkdirSync(evidenceRoot, { recursive: true });
  let observation = 0;
  const options = { manifest: readManifest() as Manifest, local: localInventory() as Local, backupRoot, readInventory: async () => {
    const rows = await readFunctionInventory(token);
    writeFileSync(path.join(evidenceRoot, `${phase}-${String(++observation).padStart(2, '0')}.json`), JSON.stringify({ projectRef: PROJECT, checkedAt: new Date().toISOString(), functions: rows }, null, 2));
    return rows;
  } };
  if (phase === 'prepare') {
    const receipt = await prepareRetirement({ ...options, download: async (slug, cwd) => runCli('download', slug, cwd) });
    console.log(JSON.stringify({ mode: 'prepared-only', project: PROJECT, backedUp: receipt.backups.map(b => ({ slug: b.slug, version: b.version })) }));
  } else {
    const apply = process.env.APPLY ?? 'false';
    if (!['true', 'false'].includes(apply)) throw new Error('APPLY must be true or false.');
    const receipt = JSON.parse(readFileSync(path.join(backupRoot, 'receipt.json'), 'utf8')) as Receipt;
    const result = await applyRetirement({ ...options, receipt, apply: apply === 'true', artifactId: process.env.BACKUP_ARTIFACT_ID, artifactDigest: process.env.BACKUP_ARTIFACT_DIGEST, remove: async slug => { runCli('delete', slug, backupRoot); console.log(`Delete command completed: ${slug}; checking inventory next.`); } });
    console.log(JSON.stringify(result));
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(`Retirement stopped: ${error.message}`); process.exitCode = 1; });
}
