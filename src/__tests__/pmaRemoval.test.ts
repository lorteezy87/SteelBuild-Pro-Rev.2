import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

const RETIRED_PATHS = [
  "src/components/ai-assistant",
  "supabase/functions/schedule-assistant",
  "src/pages/DecisionLog.jsx",
] as const;

const ACTIVE_FILES = [
  "src/Layout.jsx",
  "src/config/routes.js",
  "src/config/moduleRegistry.js",
  "src/api/client/entities.ts",
  "src/api/client/softDelete.ts",
  "src/instrument.js",
  "src/lib/workspaceExport.ts",
  "src/__tests__/llmGateway.test.ts",
  "supabase/functions/llm-proxy/router.ts",
  "supabase/functions/project-export/index.ts",
  "supabase/scripts/probe_anon_access.sql",
  "AGENTS.md",
  "README.md",
  "ARCHITECTURE.md",
  "TECH_DEBT.md",
  "docs/TODO.md",
  "docs/runbooks/backup-dr.md",
  "docs/PHASE_0_FINAL.md",
  "ENTERPRISE_READINESS_AUDIT.md",
] as const;

const RETIRED_IDENTIFIER = new RegExp(
  [
    "AiAssistant",
    "schedule-assistant",
    "schedule-assist",
    "DecisionLog",
    "PmaDecision",
    "PmaAssumption",
    "PmaAuditLog",
    "pma_decisions",
    "pma_assumptions",
    "pma_audit_logs",
    "Project Management Assistant",
    "Project Assistant",
    "\\bPMA\\b",
  ].join("|"),
  "i",
);

describe("Project Management Assistant retirement", () => {
  it("removes the retired frontend, route, and Edge Function paths", () => {
    const remaining = RETIRED_PATHS.filter((path) => existsSync(resolve(root, path)));
    expect(remaining, `Retired PMA paths still exist:\n${remaining.join("\n")}`).toEqual([]);
  });

  it("contains no active runtime, configuration, export, or current-doc references", () => {
    const matches: string[] = [];

    for (const path of ACTIVE_FILES) {
      const absolutePath = resolve(root, path);
      expect(existsSync(absolutePath), `Expected active file to exist: ${path}`).toBe(true);
      const source = readFileSync(absolutePath, "utf8");
      if (RETIRED_IDENTIFIER.test(source)) matches.push(path);
    }

    expect(matches, `Retired PMA identifiers remain in:\n${matches.join("\n")}`).toEqual([]);
  });
});
