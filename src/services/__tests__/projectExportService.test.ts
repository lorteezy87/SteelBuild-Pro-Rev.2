/**
 * projectExportService.test.ts — covers the pure shaping + audit logic behind
 * the project-export Edge Function.
 *
 * These are the security-relevant invariants we want locked down by fast tests:
 *   - the envelope only contains the project header + the whitelisted tables,
 *   - row counts / totals are accurate (the audit description derives from them),
 *   - the audit record records WHO exported WHAT and how much, in snake_case
 *     columns matching the activities table, without leaking row data,
 *   - the audit trail table (`activities`) is never itself part of the export.
 */

import { describe, it, expect } from "vitest";
import {
  PROJECT_EXPORT_TABLES,
  PROJECT_EXPORT_VERSION,
  buildProjectExport,
  buildExportAuditRecord,
  getExportProjectName,
  exportFileName,
  type ProjectExportTableResult,
} from "../projectExportService";

const project = { id: "p-1", name: "Riverside Tower Steel", contract_value: 1_000_000 };

const tableResults: ProjectExportTableResult[] = [
  { table: "drawings", rows: [{ id: "d1" }, { id: "d2" }] },
  { table: "rfis", rows: [{ id: "r1" }] },
  { table: "submittals", rows: [] },
];

describe("PROJECT_EXPORT_TABLES manifest", () => {
  it("never includes the audit trail table itself", () => {
    expect(PROJECT_EXPORT_TABLES).not.toContain("activities");
  });

  it("never includes the projects header table (exported as the envelope head)", () => {
    expect(PROJECT_EXPORT_TABLES).not.toContain("projects");
  });

  it("has no duplicate tables", () => {
    expect(new Set(PROJECT_EXPORT_TABLES).size).toBe(PROJECT_EXPORT_TABLES.length);
  });
});

describe("buildProjectExport", () => {
  it("assembles a versioned envelope with project header + per-table rows", () => {
    const env = buildProjectExport({
      project,
      tableResults,
      exportedBy: "Pat PM",
      exportedAt: "2026-06-04T12:00:00.000Z",
    });

    expect(env.export_version).toBe(PROJECT_EXPORT_VERSION);
    expect(env.exported_at).toBe("2026-06-04T12:00:00.000Z");
    expect(env.exported_by).toBe("Pat PM");
    expect(env.project).toEqual(project);
    expect(env.tables.drawings).toHaveLength(2);
    expect(env.tables.submittals).toEqual([]);
  });

  it("computes accurate per-table and total row counts", () => {
    const env = buildProjectExport({ project, tableResults, exportedBy: "Pat PM" });
    expect(env.row_counts).toEqual({ drawings: 2, rfis: 1, submittals: 0 });
    expect(env.total_rows).toBe(3);
  });

  it("treats a missing/non-array row set as empty rather than throwing", () => {
    const env = buildProjectExport({
      project,
      // deliberately malformed input (null rows) from a failed fetch
      tableResults: [{ table: "drawings", rows: null as unknown as Record<string, unknown>[] }],
      exportedBy: "x",
    });
    expect(env.tables.drawings).toEqual([]);
    expect(env.row_counts.drawings).toBe(0);
    expect(env.total_rows).toBe(0);
  });
});

describe("buildExportAuditRecord", () => {
  it("records who/what/scope in snake_case activities columns", () => {
    const env = buildProjectExport({
      project,
      tableResults,
      exportedBy: "Pat PM",
      exportedAt: "2026-06-04T12:00:00.000Z",
    });
    const audit = buildExportAuditRecord({
      projectId: "p-1",
      project,
      envelope: env,
      performedBy: "Pat PM",
      timestamp: "2026-06-04T12:00:01.000Z",
    });

    expect(audit.project_id).toBe("p-1");
    expect(audit.entity_id).toBe("p-1");
    expect(audit.entity_type).toBe("Project");
    expect(audit.action).toBe("exported");
    expect(audit.performed_by).toBe("Pat PM");
    expect(audit.project_name).toBe("Riverside Tower Steel");
    expect(audit.timestamp).toBe("2026-06-04T12:00:01.000Z");
    expect(audit.metadata).toEqual({
      export_version: PROJECT_EXPORT_VERSION,
      total_rows: 3,
      table_count: 3,
    });
  });

  it("summarizes scope without leaking any row-level data", () => {
    const env = buildProjectExport({ project, tableResults, exportedBy: "Pat PM" });
    const audit = buildExportAuditRecord({
      projectId: "p-1",
      project,
      envelope: env,
      performedBy: "Pat PM",
    });
    expect(audit.description).toBe("Exported project backup — 3 rows across 3 tables");
    // No row identifiers should appear in the audit description.
    expect(audit.description).not.toContain("d1");
    expect(audit.description).not.toContain("r1");
  });
});

describe("getExportProjectName", () => {
  it("prefers name, then project_name, then title", () => {
    expect(getExportProjectName({ name: "A" })).toBe("A");
    expect(getExportProjectName({ project_name: "B" })).toBe("B");
    expect(getExportProjectName({ title: "C" })).toBe("C");
  });
  it("falls back to a generic label when no name field is usable", () => {
    expect(getExportProjectName(null)).toBe("project");
    expect(getExportProjectName({ name: "   " })).toBe("project");
  });
});

describe("exportFileName", () => {
  it("slugifies the project name and embeds the export date", () => {
    expect(exportFileName({ name: "Riverside Tower Steel" }, "2026-06-04T12:00:00Z")).toBe(
      "riverside-tower-steel-backup-2026-06-04.json",
    );
  });
  it("is safe when the project name is missing", () => {
    expect(exportFileName(null, "2026-06-04T12:00:00Z")).toBe("project-backup-2026-06-04.json");
  });
});
