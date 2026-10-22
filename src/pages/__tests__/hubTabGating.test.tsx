// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isGatedPage } from "@/config/moduleGating";
import FieldHub from "../FieldHub";
import ScheduleHub from "../ScheduleHub";

let gatedOn = false;
vi.mock("@/hooks/useModuleAccess", () => ({
  useModuleAccess: () => ({ isPageVisible: (page: string): boolean => gatedOn || !isGatedPage(page) }),
}));
// Tab bodies are irrelevant here; render a marker instead of each real page.
vi.mock("@/lib/lazyRetry", () => ({
  lazyWithRetry: () => function TabBody() { return <div data-testid="tab-body" />; },
}));
vi.mock("@/hooks/useProjectId", () => ({ useProjectId: (): string => "p1" }));
vi.mock("@/services/permissions", () => ({ usePermissions: () => ({ can: (): boolean => true }) }));

function renderAt(ui: React.ReactElement, url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}
const tabNames = () => screen.getAllByRole("tab").map((t) => t.textContent);

describe("hub tabs follow their page's module switch", () => {
  beforeEach(() => {
    gatedOn = false;
  });

  it("Field Hub hides quality/safety/punchlist tabs while module_quality is off", () => {
    renderAt(<FieldHub />, "/FieldHub?field_tab=today");
    expect(tabNames()).toEqual(["Command Center", "Today", "Overview", "Daily Logs", "Photos", "LEMs"]);
  });

  it("Field Hub shows them when the module is on", () => {
    gatedOn = true;
    renderAt(<FieldHub />, "/FieldHub?field_tab=today");
    expect(tabNames()).toEqual(expect.arrayContaining(["Inspections", "Punchlist", "Quality Control", "Safety"]));
  });

  it("a deep link to a hidden Field Hub tab falls back to the Command Center", () => {
    renderAt(<FieldHub />, "/FieldHub?field_tab=safety&id=s1");
    const active = screen.getAllByRole("tab").find((t) => t.getAttribute("aria-selected") === "true");
    expect(active?.textContent).toBe("Command Center");
  });

  it("Schedule Hub hides Look-Ahead while module_procurement is off", () => {
    renderAt(<ScheduleHub />, "/ScheduleHub?sched_tab=lookahead");
    expect(tabNames()).toEqual(["Schedule", "Calendar"]);
    const active = screen.getAllByRole("tab").find((t) => t.getAttribute("aria-selected") === "true");
    expect(active?.textContent).toBe("Schedule");
  });
});
