// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// FieldPlan's blocker chips come from the open RFIs it fetches. It once asked
// for "Submitted" — a status chk_rfis_status never allows — and left out
// "Incomplete Response", so an RFI bounced back to the GC as incomplete
// stopped blocking the tasks that depend on it.

const { entitiesMock } = vi.hoisted(() => {
  const entity = () => ({ filter: vi.fn().mockResolvedValue([]) });
  return {
    entitiesMock: {
      ScheduleTask: entity(),
      RFI: entity(),
      Submittal: entity(),
      Delivery: entity(),
    },
  };
});

vi.mock("@/api/supabaseClient", () => ({ entities: entitiesMock }));
vi.mock("@/components/shared/ProjectContext", () => ({
  useProjectContext: () => ({ activeProject: { id: "project-1", name: "Rivergate" } }),
}));

import FieldPlan from "../FieldPlan";
import { RFI_OPEN_STATUSES } from "@/lib/entityPredicates";

// The values chk_rfis_status accepts (baseline_schema.sql).
const DB_RFI_STATUSES = ["Open", "Under Review", "Incomplete Response", "Answered", "Closed", "Void"];

describe("FieldPlan RFI blockers", () => {
  it("fetches every open RFI status and only statuses the database allows", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <FieldPlan />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(entitiesMock.RFI.filter).toHaveBeenCalled());
    const [criteria] = entitiesMock.RFI.filter.mock.calls[0];
    expect(criteria.project_id).toBe("project-1");
    expect([...criteria.status].sort()).toEqual([...RFI_OPEN_STATUSES].sort());
    for (const status of criteria.status) expect(DB_RFI_STATUSES).toContain(status);
  });
});
