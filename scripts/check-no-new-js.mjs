#!/usr/bin/env node
/**
 * check-no-new-js.mjs — Phase 1 of the TypeScript conversion standard.
 *
 * Fails if this branch ADDS any new .js/.jsx under src/ relative to origin/main,
 * unless the path is listed in ALLOWLIST below (temporary shims only).
 *
 * Does not require deleting existing JS — only blocks new files.
 */
import { execSync } from "node:child_process";

const ALLOWLIST = new Set([
  // Temporary compatibility shims only — prefer deleting within one PR cycle.
]);

function listAddedJs(baseRef) {
  let out = "";
  try {
    out = execSync(`git diff --name-only --diff-filter=A ${baseRef}...HEAD`, {
      encoding: "utf8",
    });
  } catch {
    // Shallow clones / first commit — fall back to empty.
    return [];
  }
  return out
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((p) => /^src\/.*\.(js|jsx)$/.test(p))
    .filter((p) => !ALLOWLIST.has(p));
}

const base = process.env.NO_NEW_JS_BASE || "origin/main";
const added = listAddedJs(base);

if (added.length) {
  console.error("New .js/.jsx under src/ are not allowed (TypeScript standard Phase 1).");
  console.error("Convert to .ts/.tsx with real types, or document an allowlist exception.\n");
  for (const p of added) console.error(`  + ${p}`);
  console.error("\nSee docs/architecture/typescript-standard.md");
  process.exit(1);
}

console.log(`check-no-new-js: no new src/**/*.js(x) vs ${base}`);
