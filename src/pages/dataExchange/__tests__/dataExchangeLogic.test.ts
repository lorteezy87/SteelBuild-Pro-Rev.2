import { describe, expect, it } from "vitest";
import {
  assertImportReady,
  buildProjectOptions,
  dataExchangeQueryKeys,
  formatProjectLabel,
  prepareImportRecords,
  summarizeImportResult,
} from "../dataExchangeLogic";

describe("Data Exchange deterministic derivations", () => {
  it("deduplicates and sorts selectable projects while retaining the active project", () => {
    const active = { id: "p2", name: "Alpha", project_number: "002" };
    expect(buildProjectOptions([
      { id: "p1", name: "Zulu" },
      { id: "p2", name: "Stale Alpha" },
    ], active)).toEqual([
      active,
      { id: "p1", name: "Zulu" },
    ]);
    expect(formatProjectLabel(active)).toBe("002 - Alpha");
    expect(formatProjectLabel(null)).toBe("Select a project");
  });

  it("keeps exact project and entity query keys", () => {
    expect(dataExchangeQueryKeys.records("RFI", "p1")).toEqual([
      "data-exchange",
      "RFI",
      "p1",
    ]);
    expect(dataExchangeQueryKeys.entity("RFI")).toEqual(["RFI"]);
  });

  it("normalizes and deduplicates RFIs against existing and staged records", () => {
    const result = prepareImportRecords({
      targetKey: "rfis",
      existingRecords: [{ rfi_number: "RFI #001" }],
      validRecords: [
        {
          rfi_number: "1",
          title: "Existing",
          metadata: { onboarding_import: true, source: "csv" },
        },
        { rfi_number: "002", title: "New" },
        { rfi_number: "RFI 2", title: "Repeated in file" },
      ],
      importSourceName: "rfis.csv",
    });

    expect(result.skippedDuplicates).toBe(2);
    expect(result.recordsToCreate).toEqual([{
      rfi_number: "RFI #002",
      title: "New",
      metadata: {
        data_exchange_import: true,
        import_source_name: "rfis.csv",
      },
    }]);
  });

  it("deduplicates submittals case-insensitively and leaves other targets undeduplicated", () => {
    const submittals = prepareImportRecords({
      targetKey: "submittals",
      existingRecords: [{ submittal_number: "SUB-01" }],
      validRecords: [
        { submittal_number: " sub-01 ", title: "Existing" },
        { submittal_number: "SUB-02", title: "New" },
        { submittal_number: "sub-02", title: "Repeated" },
      ],
      importSourceName: "submittals.csv",
    });
    expect(submittals.skippedDuplicates).toBe(2);
    expect(submittals.recordsToCreate).toHaveLength(1);

    const contacts = prepareImportRecords({
      targetKey: "contacts",
      existingRecords: [],
      validRecords: [{ email: "same@example.com" }, { email: "same@example.com" }],
      importSourceName: "contacts.csv",
    });
    expect(contacts.skippedDuplicates).toBe(0);
    expect(contacts.recordsToCreate).toHaveLength(2);
  });

  it("fails closed with the existing validation messages", () => {
    expect(() => assertImportReady({
      projectId: null,
      entityAvailable: false,
      targetLabel: "RFIs",
      invalidRowCount: 1,
      validRowCount: 0,
      approved: false,
    })).toThrow("Select a project before importing.");
    expect(() => assertImportReady({
      projectId: "p1",
      entityAvailable: false,
      targetLabel: "RFIs",
      invalidRowCount: 0,
      validRowCount: 1,
      approved: true,
    })).toThrow("No entity client is available for RFIs.");
  });

  it.each([
    {
      input: { importedCount: 2, skippedDuplicates: 1, targetLabel: "RFIs" },
      expected: { level: "success", message: "Imported 2 rfis, 1 duplicate skipped" },
    },
    {
      input: {
        importedCount: 2,
        skippedDuplicates: 0,
        skippedCreates: 1,
        targetLabel: "RFIs",
      },
      expected: { level: "warning", message: "Imported 2 rfis, 1 row create failed" },
    },
    {
      input: { importedCount: 0, skippedDuplicates: 1, targetLabel: "RFIs" },
      expected: { level: "warning", message: "1 duplicate skipped; no new rows imported" },
    },
    {
      input: { importedCount: 0, skippedDuplicates: 0, targetLabel: "RFIs" },
      expected: { level: "info", message: "No rows were imported" },
    },
  ])("preserves import result messaging", ({ input, expected }) => {
    expect(summarizeImportResult(input)).toEqual(expected);
  });
});

