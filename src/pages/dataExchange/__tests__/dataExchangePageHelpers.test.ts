import { describe, expect, it } from "vitest";
import {
  formatProjectLabel,
  buildProjectOptions,
  prepareImportRecords,
  IMPORT_EXAMPLES,
} from "../dataExchangePageHelpers";

describe("formatProjectLabel / buildProjectOptions", () => {
  it("formats labels", () => {
    expect(formatProjectLabel(null)).toBe("Select a project");
    expect(formatProjectLabel({ name: "Tower", project_number: "P-1" })).toBe("P-1 - Tower");
    expect(formatProjectLabel({ name: "Tower" })).toBe("Tower");
  });

  it("dedupes and sorts project options", () => {
    const options = buildProjectOptions(
      [
        { id: "b", name: "Bravo" },
        { id: "a", name: "Alpha" },
        { id: "b", name: "Bravo Dup" },
      ],
      { id: "c", name: "Charlie" },
    );
    expect(options.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(options.find((p) => p.id === "b")?.name).toBe("Bravo Dup");
  });
});

describe("prepareImportRecords", () => {
  it("normalizes RFI numbers and skips duplicates", () => {
    const { recordsToCreate, skippedDuplicates } = prepareImportRecords({
      targetKey: "rfis",
      existingRecords: [{ rfi_number: "001" }],
      validRecords: [
        { rfi_number: "1", title: "dup" },
        { rfi_number: "002", title: "new", metadata: { onboarding_import: true, keep: 1 } },
        { rfi_number: "002", title: "dup-in-batch" },
      ],
      importSourceName: "file.csv",
    });

    expect(skippedDuplicates).toBe(2);
    expect(recordsToCreate).toHaveLength(1);
    expect(recordsToCreate[0]).toMatchObject({
      rfi_number: "RFI #002",
      title: "new",
      metadata: {
        keep: 1,
        data_exchange_import: true,
        import_source_name: "file.csv",
      },
    });
    expect((recordsToCreate[0].metadata as any).onboarding_import).toBeUndefined();
  });

  it("does not dedupe targets without a natural key", () => {
    const { recordsToCreate, skippedDuplicates } = prepareImportRecords({
      targetKey: "punchlist",
      existingRecords: [{ description: "x" }],
      validRecords: [{ description: "a" }, { description: "b" }],
      importSourceName: "paste",
    });
    expect(skippedDuplicates).toBe(0);
    expect(recordsToCreate).toHaveLength(2);
  });

  it("ships sample import examples for core datasets", () => {
    expect(IMPORT_EXAMPLES.rfis).toContain("RFI #");
    expect(IMPORT_EXAMPLES.workPackages).toContain("WP Number");
  });
});
