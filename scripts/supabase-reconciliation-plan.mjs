#!/usr/bin/env node
/**
 * Builds a non-executing reconciliation plan from saved Management API
 * inventory evidence. This module never connects to Supabase or runs CLI
 * mutation commands.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  compareDrift,
  localInventory,
  readManifest,
  validateManifest,
} from './supabase-drift-check.mjs';

function readEvidence(filePath) {
  let evidence;
  try {
    evidence = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read reconciliation evidence: ${error.message}`);
  }
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    throw new Error('Reconciliation evidence must be an object.');
  }
  return evidence;
}

export function buildReconciliationPlan(manifest, local, evidence) {
  validateManifest(manifest, local);
  if (evidence.projectRef !== manifest.projectRef) {
    throw new Error(
      `Evidence project ${String(evidence.projectRef)} does not match manifest project ${manifest.projectRef}.`,
    );
  }
  const report = compareDrift(
    manifest,
    local,
    evidence.migrations,
    evidence.functions,
  );
  const blockers = [
    ...report.unknownMigrations.map(version => ({
      type: 'unknown-remote-migration',
      asset: version,
    })),
    ...report.unknownFunctions.map(slug => ({
      type: 'unknown-remote-function',
      asset: slug,
    })),
    ...report.unresolvedMigrations.map(version => ({
      type: 'unresolved-migration-lineage',
      asset: version,
    })),
    ...report.unresolvedFunctions.map(slug => ({
      type: 'unresolved-function-lineage',
      asset: slug,
    })),
  ];
  const proposedChanges = {
    applyRequiredMigrations: report.missingMigrations,
    deployRequiredFunctions: report.missingFunctions,
    deleteDeprecatedFunctions: report.deprecatedFunctions,
    deleteEnvironmentExcludedFunctions: report.environmentExcludedFunctions,
  };
  const hasProposedChanges = Object.values(proposedChanges)
    .some(values => values.length > 0);
  return {
    schemaVersion: 1,
    mode: 'plan-only',
    projectRef: manifest.projectRef,
    blockers,
    proposedChanges,
    canReconcile: blockers.length === 0,
    isAlreadyReconciled: blockers.length === 0 && !hasProposedChanges,
    disclaimer: 'Inventory planning does not prove SQL, source, replay, JWT, secret, or configuration equivalence.',
  };
}

function main() {
  const evidenceArgument = process.argv[2];
  if (!evidenceArgument) {
    console.error('Usage: npm run supabase:reconcile:plan -- <saved-inventory.json>');
    process.exitCode = 2;
    return;
  }
  const evidencePath = path.resolve(evidenceArgument);
  const local = localInventory();
  const manifest = validateManifest(readManifest(), local);
  const plan = buildReconciliationPlan(manifest, local, readEvidence(evidencePath));
  console.log(JSON.stringify(plan, null, 2));
  if (!plan.canReconcile || !plan.isAlreadyReconciled) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`Supabase reconciliation planning failed: ${error.message}`);
    process.exitCode = 1;
  }
}
