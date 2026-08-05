#!/usr/bin/env node
/**
 * Read-only Supabase drift check for CI / local operators.
 *
 * Compares:
 *   1. Repo migration filenames under supabase/migrations/*.sql
 *      vs `supabase migration list --project-ref …` remote versions.
 *   2. Repo edge-function directories under supabase/functions/*
 *      vs `supabase functions list --project-ref …` (presence only —
 *      source drift still requires a deploy to reconcile).
 *
 * Exit codes:
 *   0 — no drift (or token missing and ALLOW_SKIP=1)
 *   1 — drift detected or CLI failure
 *   2 — SUPABASE_ACCESS_TOKEN missing and ALLOW_SKIP unset
 *
 * Env:
 *   SUPABASE_ACCESS_TOKEN  required unless ALLOW_SKIP=1
 *   SUPABASE_PROJECT_REF   default kjrwqagyeswwoxpjkcko
 *   ALLOW_SKIP=1           exit 0 when token missing (opt-in CI soft gate)
 */

import { readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "kjrwqagyeswwoxpjkcko";
const ALLOW_SKIP = process.env.ALLOW_SKIP === "1";

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function run(args) {
  const result = spawnSync("npx", ["supabase", ...args], {
    encoding: "utf8",
    env: process.env,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function localMigrations() {
  const dir = path.join(ROOT, "supabase", "migrations");
  return readdirSync(dir)
    .filter((name) => /^\d{14}_.+\.sql$/.test(name))
    .map((name) => name.slice(0, 14))
    .sort();
}

function localEdgeFunctions() {
  const dir = path.join(ROOT, "supabase", "functions");
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .map((entry) => entry.name)
    .filter((name) => existsSync(path.join(dir, name, "index.ts")) || existsSync(path.join(dir, name, "index.js")))
    .sort();
}

function parseMigrationList(stdout) {
  // `supabase migration list` prints a table; version is the leading 14-digit stamp.
  const remote = new Set();
  for (const line of stdout.split("\n")) {
    const match = line.match(/\b(\d{14})\b/);
    if (match) remote.add(match[1]);
  }
  return remote;
}

function parseFunctionsList(stdout) {
  // Accept either JSON-ish or plain name columns.
  const names = new Set();
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || /^(ID|NAME|SLUG|──|==)/i.test(trimmed)) continue;
    // Prefer a bare slug token.
    const slug = trimmed.split(/\s+/)[0]?.replace(/[^a-z0-9_-]/gi, "");
    if (slug && /[a-z]/i.test(slug)) names.add(slug);
  }
  return names;
}

function main() {
  if (!process.env.SUPABASE_ACCESS_TOKEN) {
    if (ALLOW_SKIP) {
      console.log("supabase-drift-check: SUPABASE_ACCESS_TOKEN unset; ALLOW_SKIP=1 → skipping.");
      return;
    }
    fail("supabase-drift-check: SUPABASE_ACCESS_TOKEN is required (or set ALLOW_SKIP=1).", 2);
  }

  const localMigs = localMigrations();
  const localFns = localEdgeFunctions();

  console.log(`Project: ${PROJECT_REF}`);
  console.log(`Local migrations: ${localMigs.length}`);
  console.log(`Local edge functions: ${localFns.join(", ")}`);

  const migList = run(["migration", "list", "--project-ref", PROJECT_REF]);
  if (migList.status !== 0) {
    fail(`migration list failed:\n${(migList.stderr || migList.stdout).trim()}`);
  }
  const remoteMigs = parseMigrationList(migList.stdout);
  const missingRemote = localMigs.filter((v) => !remoteMigs.has(v));
  const extraRemote = [...remoteMigs].filter((v) => !localMigs.includes(v)).sort();

  const fnList = run(["functions", "list", "--project-ref", PROJECT_REF]);
  if (fnList.status !== 0) {
    fail(`functions list failed:\n${(fnList.stderr || fnList.stdout).trim()}`);
  }
  const remoteFns = parseFunctionsList(fnList.stdout);
  const missingFns = localFns.filter((name) => ![...remoteFns].some((r) => r.includes(name)));
  const deprecatedStillLive = [
    "sharepoint-proxy",
    "bluebeam-proxy",
    "stripe-setup",
    "stripe-webhook",
    "stripe-worker",
  ].filter((name) => [...remoteFns].some((r) => r.includes(name)));

  let drifted = false;

  if (missingRemote.length) {
    drifted = true;
    console.error("\nMigrations in repo but NOT applied remotely:");
    for (const v of missingRemote) console.error(`  - ${v}`);
  }
  if (extraRemote.length) {
    // Extra remote versions are a warning (MCP apply-time stamps), not always a hard fail.
    console.warn("\nMigrations applied remotely but missing matching repo filename stamp:");
    for (const v of extraRemote) console.warn(`  - ${v}`);
  }
  if (missingFns.length) {
    drifted = true;
    console.error("\nEdge functions in repo but NOT found in remote list:");
    for (const name of missingFns) console.error(`  - ${name}`);
  }
  if (deprecatedStillLive.length) {
    drifted = true;
    console.error("\nDeprecated edge functions still deployed (run delete-deprecated-edge-functions.mjs):");
    for (const name of deprecatedStillLive) console.error(`  - ${name}`);
  }

  if (drifted) {
    fail("\nsupabase-drift-check: DRIFT DETECTED.", 1);
  }

  console.log("\nsupabase-drift-check: OK (no blocking drift).");
}

main();
