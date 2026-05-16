import { describe, expect, it } from "vitest";
import {
  buildJsonExport,
  collectExportFields,
  makeExportFilename,
  recordsToCsv,
} from "../dataExchange";

describe("dataExchange", () => {
  it("keeps preferred business fields first and omits internal fields", () => {
    const fields = collectExportFields(
      [
        {
          id: "row-1",
          project_id: "project-1",
          title: "Grid conflict",
          status: "Open",
          custom_field: "value",
          metadata: { import: true },
        },
      ],
      ["title", "status"],
    );

    expect(fields).toEqual(["title", "status", "custom_field"]);
  });

  it("writes CSV that can round-trip quoted commas and line breaks", () => {
    const csv = recordsToCsv(
      [
        {
          title: "Anchor bolt, grid B4",
          question: "Confirm projection\nbefore pour",
          status: "Open",
        },
      ],
      ["title", "question", "status"],
    );

    expect(csv).toContain('"Anchor bolt, grid B4"');
    expect(csv).toContain('"Confirm projection\nbefore pour"');
    expect(csv.split("\r\n")[0]).toBe("title,question,status");
  });

  it("builds a project-scoped JSON export manifest", () => {
    const payload = buildJsonExport({
      exportedAt: "2026-05-15T12:00:00.000Z",
      project: { id: "project-1", project_number: "SB-100", name: "Main Steel" },
      targetKey: "rfis",
      target: { label: "RFIs", entityKey: "RFI", fields: ["title", "status"] },
      records: [{ id: "rfi-1", title: "Grid conflict", status: "Open" }],
    });

    expect(payload.project).toMatchObject({ id: "project-1", project_number: "SB-100" });
    expect(payload.dataset).toMatchObject({ key: "rfis", entity_key: "RFI", record_count: 1 });
    expect(payload.records[0]).toEqual({ title: "Grid conflict", status: "Open" });
  });

  it("creates stable export filenames", () => {
    expect(makeExportFilename({
      exportedAt: "2026-05-15T12:00:00.000Z",
      project: { project_number: "SB 100" },
      target: { label: "Schedule Tasks" },
      extension: "csv",
    })).toBe("sb-100-schedule-tasks-2026-05-15.csv");
  });
});
