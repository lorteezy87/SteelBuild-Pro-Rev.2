#!/usr/bin/env node
/**
 * Read-only migration-history and edge-function inventory check.
 * Uses the Management API, requiring database_migrations_read and
 * edge_functions_read. No database password, CLI install, or writes.
 * This verifies inventory, not SQL equivalence, replayability, or function source.
 */
import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEPRECATED = ['sharepoint-proxy', 'bluebeam-proxy', 'stripe-setup', 'stripe-webhook', 'stripe-worker'];

export function localInventory(root = ROOT) {
  return {
    migrations: readdirSync(path.join(root, 'supabase/migrations'))
      .filter(name => /^\d{14}_.+\.sql$/.test(name)).map(name => name.slice(0, 14)).sort(),
    functions: readdirSync(path.join(root, 'supabase/functions'), { withFileTypes: true })
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('_'))
      .map(entry => entry.name)
      .filter(name => ['index.ts', 'index.js'].some(file =>
        existsSync(path.join(root, 'supabase/functions', name, file)))).sort(),
  };
}

function evidenceSet(rows, field, pattern) {
  if (!Array.isArray(rows) || rows.some(row => !row || typeof row[field] !== 'string' || !pattern.test(row[field]))) {
    throw new Error(`Invalid remote ${field} inventory; cannot determine drift.`);
  }
  return new Set(rows.map(row => row[field]));
}

export function compareDrift(localMigrations, remoteMigrations, localFunctions, remoteFunctions) {
  const versions = evidenceSet(remoteMigrations, 'version', /^\d{14}$/);
  const slugs = evidenceSet(remoteFunctions, 'slug', /^[a-zA-Z0-9_-]+$/);
  const localVersions = new Set(localMigrations);
  const localSlugs = new Set(localFunctions);
  const report = {
    missingMigrations: [...localVersions].filter(v => !versions.has(v)).sort(),
    extraMigrations: [...versions].filter(v => !localVersions.has(v)).sort(),
    missingFunctions: [...localSlugs].filter(v => !slugs.has(v)).sort(),
    extraFunctions: [...slugs].filter(v => !localSlugs.has(v)).sort(),
    deprecatedFunctions: DEPRECATED.filter(v => slugs.has(v)),
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
  const projectRef = process.env.SUPABASE_PROJECT_REF || 'kjrwqagyeswwoxpjkcko';
  const local = localInventory();
  const remote = await readRemoteEvidence(projectRef, token);
  const report = compareDrift(local.migrations, remote.migrations, local.functions, remote.functions);
  console.log(JSON.stringify({ projectRef, ...report }, null, 2));
  if (report.hasDrift) {
    console.error('DRIFT DETECTED. Reconcile SQL and deployment history before changing migration stamps or applying migrations.');
    process.exitCode = 1;
  } else {
    console.log('Migration versions and function slugs match. SQL replay and deployed source equivalence are not checked.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`Supabase drift check failed: ${error.message}`);
    process.exitCode = 1;
  });
}
