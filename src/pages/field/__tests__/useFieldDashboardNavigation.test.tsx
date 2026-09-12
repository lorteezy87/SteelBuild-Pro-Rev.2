// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { useFieldDashboardNavigation } from "../useFieldDashboardNavigation";

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
  it("opens today's existing log from the detail CTA", () => {
    const { result, location } = setup("log-1");

    act(() => result.current.openTodayLog());

    expect(location()).toBe("/DailyLogs?id=log-1");
  });

  it("starts a log when today has no existing record", () => {
    const { result, location } = setup(null);

    act(() => result.current.openDailyLogSummary());

    expect(location()).toBe("/DailyLogs?new=1");
  });

  it("preserves the existing quick-capture and delivery destinations", () => {
    const { result, location } = setup("log-1");

    act(() => result.current.addPhoto());
    expect(location()).toBe("/Photos?new=1");

    act(() => result.current.addPunch());
    expect(location()).toBe("/Punchlist?new=1");

    act(() => result.current.addSafety());
    expect(location()).toBe("/Safety?new=1");

    act(() => result.current.receiveDelivery());
    expect(location()).toBe("/Deliveries?receive=1");
  });

  it("opens a derived action feed href unchanged", () => {
    const { result, location } = setup();

    act(() => result.current.openHref("/Inspections?id=inspection-1"));

    expect(location()).toBe("/Inspections?id=inspection-1");
  });
});
