#!/usr/bin/env node
/**
 * check-no-new-js.mjs — Phase 1 of the TypeScript conversion standard.
 *
 * Fails if this branch ADDS any new .js/.jsx under src/ relative to origin/main,
 * unless the path is listed in ALLOWLIST below (temporary shims only).
 *
 * Does not require deleting existing JS — only blocks new files.
 */
import { execFileSync } from "node:child_process";

const ALLOWLIST = new Set([
  // Temporary compatibility shims only — prefer deleting within one PR cycle.
]);

function listAddedJs(baseRef) {
  // Missing comparison refs must fail the gate. Resolve before diffing and
  // pass arguments directly so the base ref is never interpreted by a shell.
  const baseSha = execFileSync("git", ["rev-parse", "--verify", "--end-of-options", `${baseRef}^{commit}`], { encoding: "utf8" }).trim();
  const out = execFileSync("git", ["diff", "--name-only", "--diff-filter=A", `${baseSha}...HEAD`, "--", "src"], { encoding: "utf8" });
  return out
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((p) => /^src\/.*\.(js|jsx)$/.test(p))
    .filter((p) => !ALLOWLIST.has(p));
}

const requestedBase = process.env.NO_NEW_JS_BASE;
// New-branch pushes have an all-zero before SHA; compare those to main.
const base = requestedBase && !/^0+$/.test(requestedBase) ? requestedBase : "origin/main";
let added;
try {
  added = listAddedJs(base);
} catch {
  console.error(`check-no-new-js: cannot compare against ${base}. Fetch the base ref before running this gate.`);
  process.exit(1);
}

if (added.length) {
  console.error("New .js/.jsx under src/ are not allowed (TypeScript standard Phase 1).");
  console.error("Convert to .ts/.tsx with real types, or document an allowlist exception.\n");
  for (const p of added) console.error(`  + ${p}`);
  console.error("\nSee docs/architecture/typescript-standard.md");
  process.exit(1);
}

console.log(`check-no-new-js: no new src/**/*.js(x) vs ${base}`);
