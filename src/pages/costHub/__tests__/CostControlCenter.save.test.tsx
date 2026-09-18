// @vitest-environment jsdom

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createMutate: vi.fn(),
  createMutateAsync: vi.fn(),
  updateMutate: vi.fn(),
  updateMutateAsync: vi.fn(),
}));

vi.mock("@/components/command", () => ({
  PageHero: (): null => null,
  KpiStrip: (): null => null,
  PageHeader: ({ actions }: { actions?: React.ReactNode }) => <header>{actions}</header>,
  OperationalSummary: (): null => null,
  AttentionQueue: (): null => null,
  DecisionPanel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Pill: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  FilterBar: ({ primaryLabel, onPrimary }: { primaryLabel?: string; onPrimary?: () => void }) => (
    onPrimary ? <button onClick={onPrimary}>{primaryLabel}</button> : null
  ),
  DataTable: (): null => null,
  useCommandSkin: (): undefined => undefined,
}));

vi.mock("@/components/financials/CostCodeFormModal", () => ({
  default: ({ open, onSave }: { open: boolean; onSave: (data: Record<string, unknown>) => Promise<void> }) => (
    open ? (
      <div data-testid="cost-code-modal">
        <button onClick={() => void onSave({ cost_code_number: "01" }).catch((): undefined => undefined)}>
          Save cost code
        </button>
      </div>
    ) : null
  ),
}));

vi.mock("@/pages/costHub/CostChartRow", () => ({ default: (): null => null }));
vi.mock("@/config/launcherConfig", () => ({ photoFor: (): null => null }));
vi.mock("@/components/shared/formatters", () => ({
  formatCurrency: (value: number) => String(value),
  formatCurrencyShort: (value: number) => String(value),
}));
vi.mock("@/services/permissions", () => ({
  usePermissions: () => ({ can: () => true }),
}));
vi.mock("@/services/costRollup", () => ({
  computeRevisedContractValue: () => 0,
}));
vi.mock("@/pages/costHub/costControlCenter.derive", () => ({
  buildBarChartData: (): any[] => [],
  buildCumulativeData: (): any[] => [],
  buildCategoryPieData: (): any[] => [],
  buildVarianceAlerts: (): any[] => [],
  buildCoAging: (): any[] => [],
  costStatusTone: (): string => "neutral",
}));
vi.mock("@/hooks/useFinancials", () => ({
  useFinancials: () => ({
    costCodeRows: [] as any[],
    costCodes: [] as any[],
    changeOrders: [] as any[],
    summary: { actual: 0, committed: 0, marginAtRisk: 0, revisedBudget: 0, eac: 0, unallocatedCOTotal: 0 },
    reviewFlags: [] as any[],
    isLoading: false,
    costCodeCrud: {
      create: {
        mutate: mocks.createMutate,
        mutateAsync: mocks.createMutateAsync,
      },
      update: {
        mutate: mocks.updateMutate,
        mutateAsync: mocks.updateMutateAsync,
      },
      delete: {},
    },
  }),
}));

import CostControlCenter from "@/pages/costHub/CostControlCenter";

describe("CostControlCenter cost-code save", () => {
  it("keeps the modal open until the create mutation succeeds", async () => {
    const user = userEvent.setup();
    let resolveSave: (() => void) | undefined;
    mocks.createMutateAsync.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveSave = resolve;
      }),
    );

    render(
      <CostControlCenter
        projectId="project-1"
        project={{ id: "project-1", name: "Test Project" } as never}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add Cost Code" }));
    await user.click(screen.getByRole("button", { name: "Save cost code" }));

    expect(mocks.createMutateAsync).toHaveBeenCalledWith({
      cost_code_number: "01",
      project_id: "project-1",
    });
    expect(screen.getByTestId("cost-code-modal")).toBeInTheDocument();

    resolveSave?.();
    await waitFor(() => {
      expect(screen.queryByTestId("cost-code-modal")).not.toBeInTheDocument();
    });
    expect(mocks.createMutate).not.toHaveBeenCalled();
  });
});
