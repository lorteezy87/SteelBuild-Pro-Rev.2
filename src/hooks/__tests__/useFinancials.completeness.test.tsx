// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => Object.fromEntries(
  ["CostCode", "Expense", "SOVItem", "ChangeOrder", "WorkPackage"].map(name => [name, { filter: vi.fn(), filterAll: vi.fn() }]),
));
vi.mock("@/api/supabaseClient", () => ({ entities: mocks }));
vi.mock("@/services/auditLogger", () => ({ logActivity: vi.fn() }));
import { useFinancials } from "../useFinancials";

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  for (const entity of Object.values(mocks)) {
    entity.filter.mockResolvedValue([]);
    entity.filterAll.mockResolvedValue([]);
  }
});
afterEach(() => { cleanup(); client.clear(); vi.clearAllMocks(); });
function open() {
  return renderHook(() => useFinancials("project"), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
}
it("uses complete reads and includes costs beyond the first server page", async () => {
  mocks.CostCode.filterAll.mockResolvedValue([{ id: "steel", cost_code_number: "01", budget_amount: 5000 }]);
  mocks.Expense.filterAll.mockResolvedValue(Array.from({ length: 1250 }, (_, id) => ({ id: String(id), cost_code: "01", payment_status: "Paid", amount: 2 })));
  const { result } = open();
  await waitFor(() => expect(result.current.summary.actual).toBe(2500));
  for (const entity of Object.values(mocks)) expect(entity.filter).not.toHaveBeenCalled();
});
it("does not accept an existing capped register cache as complete evidence", async () => {
  client.setQueryData(["expenses", "project"], [{ amount: 1 }]);
  open();
  await waitFor(() => expect(mocks.Expense.filterAll).toHaveBeenCalled());
});
it("exposes a required-source failure instead of declaring the financials ready", async () => {
  mocks.Expense.filterAll.mockRejectedValue(new Error("Access denied"));
  const { result } = open();
  await waitFor(() => expect(result.current).toMatchObject({ isReady: false, error: expect.any(Error) }));
});
