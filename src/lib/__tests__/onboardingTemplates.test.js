import { describe, expect, it } from "vitest";
import {
  IMPORT_TARGETS,
  PROJECT_TEMPLATES,
  SAMPLE_PROJECT_TEMPLATE_KEY,
  TEMPLATE_LIBRARY,
  buildProjectPayload,
  buildSeedPayloads,
  parseDelimitedImport,
  stageImportText,
  summarizeSeedPayloads,
} from "../onboardingTemplates";

describe("onboardingTemplates", () => {
  it("covers the onboarding MVP template and library choices", () => {
    expect(PROJECT_TEMPLATES.map((template) => template.key)).toEqual(expect.arrayContaining([
      "fabrication_erection",
      "field_execution",
      "drawing_submittal",
      "blank",
    ]));
    expect(TEMPLATE_LIBRARY.map((template) => template.title)).toEqual(expect.arrayContaining([
      "Daily Log Starter",
      "Safety Categories",
      "Punchlist Categories",
      "Delivery Statuses",
      "RFI/Submittal Defaults",
      "Steel Schedule Phases",
    ]));
  });

  it("stages imports for the starter data types users need during setup", () => {
    expect(Object.keys(IMPORT_TARGETS)).toEqual(expect.arrayContaining([
      "rfis",
      "scheduleTasks",
      "workPackages",
      "deliveries",
      "punchlist",
      "contacts",
    ]));
  });

  it("builds a demo project payload with explicit onboarding metadata", () => {
    const payload = buildProjectPayload(
      { project_number: "", name: "", client: "", start_date: "2026-06-01" },
      SAMPLE_PROJECT_TEMPLATE_KEY,
    );

    expect(payload.project_number).toBe("DEMO-001");
    expect(payload.name).toBe("Structural Steel Demo Project");
    expect(payload.start_date).toBe("2026-06-01");
    expect(payload.metadata.onboarding.is_demo).toBe(true);
  });

  it("creates starter records for the fabrication template", () => {
    const project = { id: "project-1", name: "Test Project", start_date: "2026-06-01" };
    const payloads = buildSeedPayloads(project, "fabrication_erection");
    const summary = summarizeSeedPayloads(payloads);

    expect(summary.workPackages).toBeGreaterThan(0);
    expect(summary.scheduleTasks).toBeGreaterThan(0);
    expect(summary.drawingSets).toBeGreaterThan(0);
    expect(summary.submittals).toBeGreaterThan(0);
    expect(payloads.scheduleTasks[0]).toMatchObject({
      project_id: "project-1",
      project_name: "Test Project",
    });
  });

  it("parses quoted CSV rows", () => {
    const parsed = parseDelimitedImport('title,question\n"Anchor bolt issue","Confirm shim, grout, and washer"');

    expect(parsed.headers).toEqual(["title", "question"]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].values[0]).toBe("Anchor bolt issue");
    expect(parsed.rows[0].values[1]).toBe("Confirm shim, grout, and washer");
  });

  it("stages import rows with validation before write", () => {
    const staged = stageImportText({
      targetKey: "rfis",
      project: { id: "project-1", name: "Import Project" },
      text: "RFI #,Title,Question\n001,Grid conflict,Confirm beam depth\n002,,Missing title",
    });

    expect(staged.validRecords).toHaveLength(1);
    expect(staged.invalidRows).toHaveLength(1);
    expect(staged.validRecords[0]).toMatchObject({
      project_id: "project-1",
      project_name: "Import Project",
      rfi_number: "RFI #001",
      title: "Grid conflict",
      question: "Confirm beam depth",
    });
  });

  it("rejects import rows with values that violate entity status checks", () => {
    const staged = stageImportText({
      targetKey: "rfis",
      project: { id: "project-1", name: "Import Project" },
      text: "Title,Status\nValid RFI,Open\nInvalid RFI,Draft",
    });

    expect(staged.validRecords).toHaveLength(1);
    expect(staged.invalidRows).toHaveLength(1);
    expect(staged.invalidRows[0].invalidValues[0]).toMatchObject({
      field: "status",
      value: "Draft",
    });
  });
});
