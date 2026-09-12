#!/usr/bin/env node
/**
 * Read-only Supabase migration-history and Edge Function inventory check.
 *
 * This verifies version/slug inventory only. A green result does not prove SQL
 * equivalence, migration replayability, function-source equivalence, or config
 * equivalence.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MANIFEST_PATH = 'supabase/production-ownership-manifest.json';
const LIFECYCLES = new Set([
  'required',
  'staging-only',
  'intentionally-frozen',
  'deprecated',
  'unresolved',
]);

export function localInventory(root = ROOT) {
  return {
    migrations: readdirSync(path.join(root, 'supabase/migrations'))
      .filter(name => /^\d{14}_.+\.sql$/.test(name))
      .map(name => name.slice(0, 14))
      .sort(),
    functions: readdirSync(path.join(root, 'supabase/functions'), { withFileTypes: true })
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('_'))
      .map(entry => entry.name)
      .filter(name => ['index.ts', 'index.js'].some(file =>
        existsSync(path.join(root, 'supabase/functions', name, file))))
      .sort(),
  };
}

export function readManifest(root = ROOT) {
  const manifestPath = path.join(root, MANIFEST_PATH);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read ${MANIFEST_PATH}: ${error.message}`);
  }
  return manifest;
}

function assertUnique(values, label) {
  const duplicate = values.find((value, index) => values.indexOf(value) !== index);
  if (duplicate) throw new Error(`Duplicate ${label}: ${duplicate}`);
}

function validateLifecycle(value, label) {
  if (!LIFECYCLES.has(value)) throw new Error(`Invalid ${label} lifecycle: ${String(value)}`);
}

function validateEntry(entry, key, pattern, label) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error(`Invalid ${label} entry.`);
  }
  if (typeof entry[key] !== 'string' || !pattern.test(entry[key])) {
    throw new Error(`Invalid ${label} ${key}: ${String(entry[key])}`);
  }
  if (typeof entry.owner !== 'string' || entry.owner.length === 0) {
    throw new Error(`Missing ${label} owner: ${entry[key]}`);
  }
  validateLifecycle(entry.lifecycle, `${label} ${entry[key]}`);
  if (typeof entry.evidence !== 'string' || entry.evidence.length === 0) {
    throw new Error(`Missing ${label} evidence: ${entry[key]}`);
  }
}

export function validateManifest(manifest, local) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Production ownership manifest must be an object.');
  }
  if (manifest.schemaVersion !== 1) {
    throw new Error(`Unsupported production ownership manifest schemaVersion: ${String(manifest.schemaVersion)}`);
  }
  if (typeof manifest.projectRef !== 'string' || !/^[a-z0-9]{20}$/.test(manifest.projectRef)) {
    throw new Error('Production ownership manifest projectRef is malformed.');
  }
  if (!manifest.local || typeof manifest.local.owner !== 'string' || !manifest.local.owner) {
    throw new Error('Production ownership manifest local.owner is required.');
  }
  validateLifecycle(manifest.local.migrationLifecycle, 'local migration');
  validateLifecycle(manifest.local.functionLifecycle, 'local function');
  if (!Array.isArray(manifest.local.functionOverrides)
    || !Array.isArray(manifest.migrations)
    || !Array.isArray(manifest.functions)) {
    throw new Error('Production ownership manifest asset lists must be arrays.');
  }

  assertUnique(local.migrations, 'local migration version');
  assertUnique(local.functions, 'local function slug');
  manifest.migrations.forEach(entry =>
    validateEntry(entry, 'version', /^\d{14}$/, 'manifest migration'));
  manifest.functions.forEach(entry =>
    validateEntry(entry, 'slug', /^[a-zA-Z0-9_-]+$/, 'manifest function'));
  manifest.local.functionOverrides.forEach(entry => {
    validateEntry(
      { ...entry, owner: manifest.local.owner },
      'slug',
      /^[a-zA-Z0-9_-]+$/,
      'local function override',
    );
    if (!local.functions.includes(entry.slug)) {
      throw new Error(`Local function override has no source directory: ${entry.slug}`);
    }
  });

  assertUnique(manifest.migrations.map(entry => entry.version), 'manifest migration version');
  assertUnique(manifest.functions.map(entry => entry.slug), 'manifest function slug');
  assertUnique(
    manifest.local.functionOverrides.map(entry => entry.slug),
    'local function override slug',
  );

  const localMigrationCollision = manifest.migrations.find(entry =>
    local.migrations.includes(entry.version));
  if (localMigrationCollision) {
    throw new Error(`Manifest migration duplicates active local migration: ${localMigrationCollision.version}`);
  }
  const localFunctionCollision = manifest.functions.find(entry =>
    local.functions.includes(entry.slug));
  if (localFunctionCollision) {
    throw new Error(`Manifest function duplicates active local function: ${localFunctionCollision.slug}`);
  }
  return manifest;
}

function evidenceSet(rows, field, pattern) {
  if (!Array.isArray(rows)
    || rows.some(row => !row || typeof row[field] !== 'string' || !pattern.test(row[field]))) {
    throw new Error(`Invalid remote ${field} inventory; cannot determine drift.`);
  }
  const values = rows.map(row => row[field]);
  assertUnique(values, `remote ${field}`);
  return new Set(values);
}

function classifiedInventory(manifest, local) {
  const overrides = new Map(
    manifest.local.functionOverrides.map(entry => [entry.slug, entry]),
  );
  const migrations = local.migrations.map(version => ({
    version,
    owner: manifest.local.owner,
    lifecycle: manifest.local.migrationLifecycle,
    evidence: `supabase/migrations/${version}_*.sql`,
  })).concat(manifest.migrations);
  const functions = local.functions.map(slug => ({
    slug,
    owner: manifest.local.owner,
    lifecycle: overrides.get(slug)?.lifecycle ?? manifest.local.functionLifecycle,
    evidence: overrides.get(slug)?.evidence ?? `supabase/functions/${slug}/index.*`,
  })).concat(manifest.functions);
  return { migrations, functions };
}

function compareAssets(entries, remoteValues, key, label) {
  const byValue = new Map(entries.map(entry => [entry[key], entry]));
  const required = entries.filter(entry => entry.lifecycle === 'required');
  const excluded = entries.filter(entry => entry.lifecycle === 'staging-only');
  const deprecated = entries.filter(entry => entry.lifecycle === 'deprecated');
  const unresolved = entries.filter(entry => entry.lifecycle === 'unresolved');
  return {
    [`missing${label}`]: required
      .filter(entry => !remoteValues.has(entry[key]))
      .map(entry => entry[key])
      .sort(),
    [`unknown${label}`]: [...remoteValues]
      .filter(value => !byValue.has(value))
      .sort(),
    [`environmentExcluded${label}`]: excluded
      .filter(entry => remoteValues.has(entry[key]))
      .map(entry => entry[key])
      .sort(),
    [`deprecated${label}`]: deprecated
      .filter(entry => remoteValues.has(entry[key]))
      .map(entry => entry[key])
      .sort(),
    [`unresolved${label}`]: unresolved
      .map(entry => entry[key])
      .sort(),
  };
}

export function compareDrift(manifest, local, remoteMigrations, remoteFunctions) {
  validateManifest(manifest, local);
  const remoteVersions = evidenceSet(remoteMigrations, 'version', /^\d{14}$/);
  const remoteSlugs = evidenceSet(remoteFunctions, 'slug', /^[a-zA-Z0-9_-]+$/);
  const classified = classifiedInventory(manifest, local);
  const report = {
    ...compareAssets(classified.migrations, remoteVersions, 'version', 'Migrations'),
    ...compareAssets(classified.functions, remoteSlugs, 'slug', 'Functions'),
  };
  return { ...report, hasDrift: Object.values(report).some(values => values.length > 0) };
}

export async function readRemoteEvidence(projectRef, token, fetcher = fetch) {
  const base = `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}`;
  const read = async suffix => {
    const response = await fetcher(`${base}/${suffix}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`Supabase ${suffix} request failed (HTTP ${response.status}).`);
    return response.json();
  };
  const [migrations, functions] = await Promise.all([read('database/migrations'), read('functions')]);
  return { migrations, functions };
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    console.error('SUPABASE_ACCESS_TOKEN is required; drift was NOT checked.');
    process.exitCode = 2;
    return;
  }
  const local = localInventory();
  const manifest = validateManifest(readManifest(), local);
  const projectRef = process.env.SUPABASE_PROJECT_REF || manifest.projectRef;
  if (projectRef !== manifest.projectRef) {
    throw new Error(`Project ref ${projectRef} does not match manifest project ${manifest.projectRef}.`);
  }
  const remote = await readRemoteEvidence(projectRef, token);
  const report = compareDrift(manifest, local, remote.migrations, remote.functions);
  console.log(JSON.stringify({ projectRef, manifest: MANIFEST_PATH, ...report }, null, 2));
  if (report.hasDrift) {
    console.error('DRIFT DETECTED. Resolve ownership/source blockers before changing migration stamps or deployments.');
    process.exitCode = 1;
  } else {
    console.log('Production inventory matches the reviewed ownership manifest. SQL/source/config equivalence is not checked.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`Supabase drift check failed: ${error.message}`);
    process.exitCode = 1;
  });
}
