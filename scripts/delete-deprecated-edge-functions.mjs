#!/usr/bin/env node
/**
 * Owner-run helper: delete deprecated / orphan Supabase edge functions that
 * are no longer in supabase/functions/ but may still be deployed remotely.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=… node scripts/delete-deprecated-edge-functions.mjs
 *   DRY_RUN=0 SUPABASE_ACCESS_TOKEN=… node scripts/delete-deprecated-edge-functions.mjs
 *
 * Default is dry-run (lists + prints the delete commands). Set DRY_RUN=0 to
 * actually call `supabase functions delete`.
 *
 * Project ref defaults to production kjrwqagyeswwoxpjkcko.
 */

import { spawnSync } from "node:child_process";

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "kjrwqagyeswwoxpjkcko";
const DRY_RUN = process.env.DRY_RUN !== "0";

const DEPRECATED = [
  "sharepoint-proxy",
  "bluebeam-proxy",
  "stripe-setup",
  "stripe-webhook",
  "stripe-worker",
];

function run(args, { allowFail = false } = {}) {
  const result = spawnSync("npx", ["supabase", ...args], {
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0 && !allowFail) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(`supabase ${args.join(" ")} failed (${result.status}): ${detail}`);
  }
  return {
    status: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function main() {
  if (!process.env.SUPABASE_ACCESS_TOKEN) {
    console.error("SUPABASE_ACCESS_TOKEN is required (Supabase dashboard → Account → Access Tokens).");
    process.exit(1);
  }

  console.log(`Project: ${PROJECT_REF}`);
  console.log(`Mode: ${DRY_RUN ? "DRY_RUN (set DRY_RUN=0 to delete)" : "APPLY"}`);
  console.log("");

  const listed = run(["functions", "list", "--project-ref", PROJECT_REF], { allowFail: true });
  if (listed.status === 0) {
    console.log("Currently deployed functions:");
    console.log(listed.stdout.trim() || "(empty)");
    console.log("");
  } else {
    console.warn("Could not list functions (continuing with fixed delete set):");
    console.warn((listed.stderr || listed.stdout).trim());
    console.log("");
  }

  for (const name of DEPRECATED) {
    const args = ["functions", "delete", name, "--project-ref", PROJECT_REF];
    if (DRY_RUN) {
      console.log(`[dry-run] npx supabase ${args.join(" ")}`);
      continue;
    }
    console.log(`Deleting ${name}…`);
    const result = run(args, { allowFail: true });
    if (result.status === 0) {
      console.log(`  deleted ${name}`);
    } else {
      // Already gone is success for idempotency.
      const msg = (result.stderr || result.stdout).trim();
      if (/not found|does not exist|404/i.test(msg)) {
        console.log(`  already absent: ${name}`);
      } else {
        console.error(`  FAILED ${name}: ${msg}`);
        process.exitCode = 1;
      }
    }
  }

  if (DRY_RUN) {
    console.log("\nNo deletes performed. Re-run with DRY_RUN=0 to apply.");
  }
}

main();
