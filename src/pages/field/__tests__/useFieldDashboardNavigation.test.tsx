// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { isGatedPage } from "@/config/moduleGating";
import { useFieldDashboardNavigation } from "../useFieldDashboardNavigation";

// Gated modules on by default; a test switches them off.
let gatedOn = true;
vi.mock("@/hooks/useModuleAccess", () => ({
  useModuleAccess: () => ({ isPageVisible: (page: string): boolean => gatedOn || !isGatedPage(page) }),
}));

function setup(todayLogId?: string | null) {
  let pathname = "";
  let search = "";
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={["/Field"]}>
      {children}
    </MemoryRouter>
  );
  const result = renderHook(
    () => {
      const actions = useFieldDashboardNavigation(todayLogId);
      const location = useLocation();
      pathname = location.pathname;
      search = location.search;
      return actions;
    },
    { wrapper },
  );

  return {
    ...result,
    location: () => `${pathname}${search}`,
  };
}

describe("useFieldDashboardNavigation", () => {
  beforeEach(() => {
    gatedOn = true;
  });

  it("opens today's existing log in the Field Hub Daily Logs tab", () => {
    const { result, location } = setup("log-1");

    act(() => result.current.openTodayLog?.());

    expect(location()).toBe("/FieldHub?field_tab=dailylogs&id=log-1");
  });

  it("starts a log when today has no existing record", () => {
    const { result, location } = setup(null);

    act(() => result.current.openDailyLogSummary?.());

    expect(location()).toBe("/FieldHub?field_tab=dailylogs&new=1");
  });

  it("keeps quick capture inside Field Hub; deliveries stay on their page", () => {
    const { result, location } = setup("log-1");

    act(() => result.current.addPhoto?.());
    expect(location()).toBe("/FieldHub?field_tab=photos&new=1");

    act(() => result.current.addPunch?.());
    expect(location()).toBe("/FieldHub?field_tab=punchlist&new=1");

    act(() => result.current.addSafety?.());
    expect(location()).toBe("/FieldHub?field_tab=safety&new=1");

    act(() => result.current.receiveDelivery?.());
    expect(location()).toBe("/Deliveries?receive=1");
  });

  it("opens a derived action feed href as its hub tab with the record id", () => {
    const { result, location } = setup();

    act(() => result.current.openHref("/Inspections?id=inspection-1"));

    expect(location()).toBe("/FieldHub?field_tab=inspections&id=inspection-1");
  });

  it("returns no action for a register whose module is switched off", () => {
    gatedOn = false;
    const { result, location } = setup("log-1");

    expect(result.current.addPunch).toBeNull();
    expect(result.current.addSafety).toBeNull();
    expect(result.current.openInspections).toBeNull();
    expect(result.current.openQualityControl).toBeNull();
    expect(result.current.canOpenHref("/Punchlist?id=p1")).toBe(false);
    // Core field pages are never gated.
    expect(result.current.addPhoto).not.toBeNull();
    expect(result.current.openTodayLog).not.toBeNull();

    act(() => result.current.openHref("/Safety?id=s1"));
    expect(location()).toBe("/Field");
  });
});
