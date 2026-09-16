// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

const prefs = vi.hoisted(() => ({ sidebar_mode: "remember", pinned_modules: [] as string[], show_recent_pages: true }));
vi.mock("@/hooks/useUserPrefs", () => ({ useUserPrefs: () => prefs }));
vi.mock("@/hooks/useSaveUserPrefs", () => ({ useSaveUserPrefs: () => ({ savePatch: vi.fn(), savePatchConfirmed: vi.fn() }) }));
vi.mock("@/hooks/useModuleAccess", () => ({ useModuleAccess: () => ({ isPageVisible: () => true }) }));
vi.mock("@/components/shared/ThemeContext", () => ({ useTheme: () => ({ theme: "light" }) }));
import SidebarNav from "../SidebarNav";

function sidebar(forceRail = false, currentPageName = "Dashboard") {
  return <SidebarNav variant="dashboard" currentPageName={currentPageName} visible forceRail={forceRail} onNavigate={() => {}} />;
}
const nav = () => screen.getByRole("complementary", { name: "Dashboard navigation" });

beforeEach(() => { localStorage.clear(); prefs.sidebar_mode = "remember"; });
afterEach(cleanup);

describe("dashboard sidebar preferences", () => {
  it.each([
    ["remember", "1", true],
    ["remember", "0", false],
    ["rail", "0", true],
    ["expanded", "1", false],
  ])("starts with %s preference and remembered value %s", (mode, stored, collapsed) => {
    prefs.sidebar_mode = String(mode);
    localStorage.setItem("sbp-sidebar-rail", String(stored));
    render(sidebar());
    expect(nav().classList.contains("is-collapsed")).toBe(collapsed);
  });

  it("persists a manual choice for remember mode across navigation and remount", () => {
    const view = render(sidebar());
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(nav()).toHaveClass("is-collapsed");
    expect(localStorage.getItem("sbp-sidebar-rail")).toBe("1");
    view.rerender(sidebar(false, "RFIs"));
    expect(nav()).toHaveClass("is-collapsed");
    view.unmount();
    render(sidebar());
    expect(nav()).toHaveClass("is-collapsed");
    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(nav()).not.toHaveClass("is-collapsed");
    expect(localStorage.getItem("sbp-sidebar-rail")).toBe("0");
  });

  it.each(["rail", "expanded"])("allows manual toggles after the %s start preference", mode => {
    prefs.sidebar_mode = mode;
    const startsCollapsed = mode === "rail";
    const view = render(sidebar());
    fireEvent.click(screen.getByRole("button", { name: startsCollapsed ? "Expand sidebar" : "Collapse sidebar" }));
    expect(nav().classList.contains("is-collapsed")).toBe(!startsCollapsed);
    expect(localStorage.getItem("sbp-sidebar-rail")).toBe(startsCollapsed ? "0" : "1");
    view.rerender(sidebar(false, "RFIs"));
    expect(nav().classList.contains("is-collapsed")).toBe(!startsCollapsed);
    view.unmount();
    render(sidebar());
    expect(nav().classList.contains("is-collapsed")).toBe(startsCollapsed);
  });

  it("applies preference changes without overwriting the remembered manual choice", () => {
    localStorage.setItem("sbp-sidebar-rail", "1");
    prefs.sidebar_mode = "expanded";
    const view = render(sidebar());
    expect(nav()).not.toHaveClass("is-collapsed");
    prefs.sidebar_mode = "rail";
    view.rerender(sidebar());
    expect(nav()).toHaveClass("is-collapsed");
    prefs.sidebar_mode = "expanded";
    view.rerender(sidebar());
    expect(nav()).not.toHaveClass("is-collapsed");
    prefs.sidebar_mode = "remember";
    view.rerender(sidebar());
    expect(nav()).toHaveClass("is-collapsed");
    expect(localStorage.getItem("sbp-sidebar-rail")).toBe("1");
  });

  it("keeps a tablet-forced rail temporary", () => {
    localStorage.setItem("sbp-sidebar-rail", "0");
    const view = render(sidebar(true));
    expect(nav()).toHaveClass("is-collapsed");
    expect(screen.queryByRole("button", { name: /Expand sidebar|Collapse sidebar/ })).not.toBeInTheDocument();
    expect(localStorage.getItem("sbp-sidebar-rail")).toBe("0");
    view.rerender(sidebar(false));
    expect(nav()).not.toHaveClass("is-collapsed");
  });
});
