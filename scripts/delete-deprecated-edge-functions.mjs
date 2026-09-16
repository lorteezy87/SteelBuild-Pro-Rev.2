#!/usr/bin/env node
/**
 * Legacy inventory helper. Apply is blocked while stripe-webhook is held; use
 * .github/workflows/supabase-retire-deprecated.yml for the five reviewed versions.
 * Owner-run helper for deleting production Edge Functions classified as
 * deprecated in the reviewed ownership manifest.
 *
 * Dry-run is the default. Apply requires both DRY_RUN=0 and an exact
 * CONFIRM_DELETE_DEPRECATED_FUNCTIONS=<project-ref> value.
 */
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import {
  localInventory,
  readManifest,
  validateManifest,
} from './supabase-drift-check.mjs';

export function deprecatedFunctionSlugs(manifest, local) {
  validateManifest(manifest, local);
  return manifest.functions
    .filter(entry => entry.lifecycle === 'deprecated')
    .map(entry => entry.slug)
    .sort();
}

export function assertApplyConfirmation(projectRef, dryRun, confirmation) {
  if (dryRun) return;
  if (confirmation !== projectRef) {
    throw new Error(
      `Apply requires CONFIRM_DELETE_DEPRECATED_FUNCTIONS=${projectRef}.`,
    );
  }
}

function run(args, { allowNotFound = false } = {}) {
  const result = spawnSync('npx', ['supabase', ...args], {
    encoding: 'utf8',
    env: process.env,
  });
  const detail = (result.stderr || result.stdout || '').trim();
  if (result.status !== 0) {
    if (allowNotFound && /not found|does not exist|404/i.test(detail)) {
      return { alreadyAbsent: true, detail };
    }
    throw new Error(`supabase ${args.join(' ')} failed (${result.status}): ${detail}`);
  }
  return { alreadyAbsent: false, detail: result.stdout || '' };
}

export function main() {
  if (!process.env.SUPABASE_ACCESS_TOKEN) {
    throw new Error('SUPABASE_ACCESS_TOKEN is required; function inventory was NOT checked.');
  }
  const manifest = validateManifest(readManifest(), localInventory());
  const projectRef = process.env.SUPABASE_PROJECT_REF || manifest.projectRef;
  if (projectRef !== manifest.projectRef) {
    throw new Error(`Project ref ${projectRef} does not match manifest project ${manifest.projectRef}.`);
  }
  const dryRun = process.env.DRY_RUN !== '0';
  assertApplyConfirmation(
    projectRef,
    dryRun,
    process.env.CONFIRM_DELETE_DEPRECATED_FUNCTIONS,
  );
  const deprecated = deprecatedFunctionSlugs(manifest, localInventory());
  if (!dryRun && deprecated.includes('stripe-webhook')) {
    throw new Error('stripe-webhook is protected while Stripe endpoint evidence remains enabled. Use the manual supabase-retire-deprecated.yml workflow for the five reviewed versions.');
  }

  console.log(`Project: ${projectRef}`);
  console.log(`Mode: ${dryRun ? 'DRY_RUN' : 'APPLY'}`);
  console.log(`Manifest deprecated functions: ${deprecated.join(', ') || '(none)'}`);
  console.log('');

  const listed = run(['functions', 'list', '--project-ref', projectRef]);
  console.log('Currently deployed functions:');
  console.log(listed.detail.trim() || '(empty)');
  console.log('');

  for (const slug of deprecated) {
    if (slug === 'stripe-webhook') {
      console.log('[held] stripe-webhook: enabled Stripe endpoint evidence; no deletion permitted.');
      continue;
    }
    const args = ['functions', 'delete', slug, '--project-ref', projectRef];
    if (dryRun) {
      console.log(`[dry-run] npx supabase ${args.join(' ')}`);
      continue;
    }
    const result = run(args, { allowNotFound: true });
    console.log(result.alreadyAbsent ? `already absent: ${slug}` : `deleted: ${slug}`);
  }

  if (dryRun) console.log('\nNo deletes performed.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`Deprecated Edge Function reconciliation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
