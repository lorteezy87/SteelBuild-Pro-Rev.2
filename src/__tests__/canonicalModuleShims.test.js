import { describe, expect, it } from "vitest";

import CanonicalBulkActionBar from "@/components/design-system/BulkActionBar";
import LegacyRfiBulkActionBar from "@/pages/rfis/BulkActionBar";
import { BulkActionsBar as CanonicalDrawingsBulkActionBar } from "@/components/drawings/DrawingsToolbar";
import LegacyDrawingsBulkActionBar from "@/components/drawings/BulkActionBar";
import { FilterBar as CanonicalFilterBar } from "@/components/command/FilterBar";
import LegacyRfiFilterBar from "@/pages/rfis/FilterBar";
import { FilterBar as LegacyFinancialFilterBar } from "@/pages/financials/FilterBar";
import { KpiStrip as CanonicalKpiStrip } from "@/components/command/KpiStrip";
import LegacyRfiKpiStrip from "@/pages/rfis/KpiStrip";
import { KPIStrip as LegacyFinancialKpiStrip } from "@/pages/financials/KPIStrip";
import CanonicalViewerToolbar from "@/pages/drawingViewer/ViewerToolbar";
import LegacyViewerToolbar from "@/components/viewer/ViewerToolbar";

describe("canonical module transition shims", () => {
  it("re-exports the design-system bulk action bar from the legacy RFI path", () => {
    expect(LegacyRfiBulkActionBar).toBe(CanonicalBulkActionBar);
  });

  it("re-exports the mounted drawings bulk action bar from the legacy drawings path", () => {
    expect(LegacyDrawingsBulkActionBar).toBe(CanonicalDrawingsBulkActionBar);
  });

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

  it("re-exports the mounted drawing viewer toolbar from the legacy component path", () => {
    expect(LegacyViewerToolbar).toBe(CanonicalViewerToolbar);
  });
});
