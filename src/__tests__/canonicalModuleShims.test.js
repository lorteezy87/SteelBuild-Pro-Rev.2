import { describe, expect, it } from "vitest";

import { FilterBar as CanonicalFilterBar } from "@/components/command/FilterBar";
import LegacyRfiFilterBar from "@/pages/rfis/FilterBar";
import { FilterBar as LegacyFinancialFilterBar } from "@/pages/financials/FilterBar";
import { KpiStrip as CanonicalKpiStrip } from "@/components/command/KpiStrip";
import LegacyRfiKpiStrip from "@/pages/rfis/KpiStrip";
import { KPIStrip as LegacyFinancialKpiStrip } from "@/pages/financials/KPIStrip";

describe("canonical module transition shims", () => {
  it("re-exports the command filter bar from the legacy RFI path", () => {
    expect(LegacyRfiFilterBar).toBe(CanonicalFilterBar);
  });

  it("re-exports the command filter bar from the legacy financial path", () => {
    expect(LegacyFinancialFilterBar).toBe(CanonicalFilterBar);
  });

  it("re-exports the command KPI strip from the legacy RFI path", () => {
    expect(LegacyRfiKpiStrip).toBe(CanonicalKpiStrip);
  });

  it("re-exports the command KPI strip from the legacy financial path", () => {
    expect(LegacyFinancialKpiStrip).toBe(CanonicalKpiStrip);
  });
});
