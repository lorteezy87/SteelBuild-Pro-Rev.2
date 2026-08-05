#!/usr/bin/env node
/**
 * retest-corrected-flows.mjs — Action-plan ID 15 automated retest harness.
 *
 * Runs the Vitest suites that cover previously corrected workflows and writes
 * a markdown report under docs/action-plan/. Does not replace interactive
 * staging UAT (still required for ID 102).
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Corrected-flow suites keyed by workflow area. */
const SUITES = [
  ["Task persistence", "src/pages/schedule/__tests__/taskPersistence.test.ts"],
  ["Cost codes", "src/pages/costHub/__tests__/costCodeSave.test.ts"],
  ["Standard mutations", "src/lib/mutations/__tests__/standardMutation.test.ts"],
  ["Fab release gate", "src/lib/__tests__/fabReleaseGate.test.js"],
  ["Fab status", "src/lib/__tests__/fabStatus.test.js"],
  ["Shipping list parse", "src/lib/__tests__/importShippingList.test.js"],
  ["Production status import", "src/lib/__tests__/importProductionStatus.test.js"],
  ["Piece production hardening", "src/lib/pieceControl/__tests__/productionHardening.test.ts"],
  ["Piece reconciliation", "src/lib/pieceControl/__tests__/reconciliation.test.ts"],
  ["Model elements paging", "src/lib/ifc/__tests__/fetchAllModelElements.test.js"],
  ["Data exchange honesty", "src/lib/__tests__/dataExchange.test.js"],
  ["SharePoint sync honesty", "src/lib/dms/__tests__/sharepointSyncHonesty.test.ts"],
  ["Shipping list commit honesty", "src/lib/deliveries/__tests__/summarizeShippingListCommit.test.ts"],
  ["Submittal stage mapping", "src/lib/__tests__/submittalStageMapping.test.js"],
  ["Drawing upload utils", "src/lib/__tests__/drawingUploadUtils.test.js"],
  ["App security identity", "src/components/shared/__tests__/useAppSecurity.test.tsx"],
  ["PMA removal", "src/__tests__/pmaRemoval.test.ts"],
  ["Piece register wiring", "src/__tests__/pieceRegisterWiring.test.ts"],
];

const files = SUITES.map(([, f]) => f);
const started = new Date().toISOString();

const result = spawnSync(
  "npx",
  ["vitest", "run", "--reporter=default", ...files],
  { cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
);

const output = `${result.stdout || ""}\n${result.stderr || ""}`;
const passed = result.status === 0;
const summaryMatch = output.match(/Test Files\s+(\d+) passed/);
const testsMatch = output.match(/Tests\s+(\d+) passed/);

const reportPath = join(root, "docs/action-plan/RETEST_CORRECTED_FLOWS.md");
mkdirSync(dirname(reportPath), { recursive: true });

const lines = [
  "# Corrected-flow automated retest (Action plan ID 15)",
  "",
  `**Ran:** ${started}`,
  `**Result:** ${passed ? "✅ PASS" : "❌ FAIL"} (exit ${result.status})`,
  summaryMatch ? `**Files:** ${summaryMatch[1]} passed` : "",
  testsMatch ? `**Tests:** ${testsMatch[1]} passed` : "",
  "",
  "Interactive staging UAT remains separate (IDs 102 / 110).",
  "",
  "## Suites",
  "",
  "| Area | Spec |",
  "|---|---|",
  ...SUITES.map(([area, file]) => `| ${area} | \`${file}\` |`),
  "",
  "## Notes",
  "",
  "- Covers flows previously hardened in PRs #114–#120 (task persistence, cost codes, fab/shipping/piece sync, Sentry embed/CSP, auth identity, PMA removal).",
  "- Re-run: `npm run test:corrected-flows`",
  "",
];

writeFileSync(reportPath, lines.filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n") + "\n");
console.log(output);
console.log(`\nWrote ${reportPath}`);
process.exit(result.status ?? 1);
