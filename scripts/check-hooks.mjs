#!/usr/bin/env node
/**
 * check-hooks.mjs — Action-plan ID 16 guard.
 * Runs ESLint react-hooks/rules-of-hooks (and exhaustive-deps warnings ignored via --quiet).
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync(
  "npx",
  ["eslint", "src", "--quiet", "--rule", "react-hooks/rules-of-hooks: error"],
  { cwd: root, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
);
process.stdout.write(result.stdout || "");
process.stderr.write(result.stderr || "");
if (result.status === 0) {
  console.log("check-hooks: react-hooks/rules-of-hooks clean under src/");
}
process.exit(result.status ?? 1);
