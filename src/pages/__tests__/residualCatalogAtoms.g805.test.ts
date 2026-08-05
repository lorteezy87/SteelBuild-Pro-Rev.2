import { describe, expect, it } from "vitest";
import { EMPTY_STATE_FILE_HINTS } from "../documents/emptyStateHelpers";
import { APPROVAL_CHAIN_MONO } from "@/components/submittals/approvalChainPanelHelpers";
import { APPROVAL_TEMPLATE_MONO } from "@/components/submittals/approvalChainTemplatesHelpers";
import { REVISION_COMPARE_MONO } from "@/components/drawings/revisionCompareHelpers";
import { buildPasteInputStyle } from "@/components/workpackages/wpBulkAddHelpers";

describe("residual catalog atoms batch G", () => {
  it("documents empty-state file hints", () => {
    expect(EMPTY_STATE_FILE_HINTS.map((h) => h.label)).toEqual([
      "PDF",
      "DWG",
      "IFC",
      "IMG",
      "ZIP",
    ]);
    expect(EMPTY_STATE_FILE_HINTS[0].color).toContain("error");
  });

  it("submittals/drawings mono tokens", () => {
    expect(APPROVAL_CHAIN_MONO).toContain("mono");
    expect(APPROVAL_TEMPLATE_MONO.fontFamily).toContain("mono");
    expect(REVISION_COMPARE_MONO).toContain("mono");
  });

  it("wp bulk paste style composer", () => {
    expect(buildPasteInputStyle({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
  });
});
