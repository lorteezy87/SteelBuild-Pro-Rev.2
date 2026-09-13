// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MobileDrawer from "../MobileDrawer";

const navigate = vi.fn();
vi.mock("@/config/moduleRegistry", () => ({
  SIDEBAR_GROUPS: [
    { label: "Main", collapsible: false, items: [{ page: "Dashboard", label: "Dashboard" }] },
    { label: "More", collapsible: true, items: [{ page: "Schedule", label: "Schedule" }] },
  ],
  loadSidebarState: () => ({ More: true }),
  saveSidebarState: vi.fn(),
}));
vi.mock("@/hooks/useModuleAccess", () => ({
  useModuleAccess: () => ({ isPageVisible: () => true }),
}));
vi.mock("../BrandLogo", () => ({ BrandLogo: () => <span>SteelBuild Pro</span> }));

function Shell() {
  const [open, setOpen] = useState(false);
  return <>
    <button onClick={() => setOpen(true)}>Open navigation</button>
    <MobileDrawer open={open} onClose={() => setOpen(false)} onNavigate={navigate} currentPageName="Dashboard" />
    <button>Page action</button>
  </>;
}

beforeEach(() => {
  vi.clearAllMocks();
  document.body.style.overflow = "auto";
});
afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

describe("MobileDrawer keyboard navigation", () => {
  it("skips closed drawer controls in the page tab order", async () => {
    const user = userEvent.setup();
    render(<Shell />);
    await user.tab();
    expect(screen.getByRole("button", { name: "Open navigation" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Page action" })).toHaveFocus();
  });

  it("focuses the drawer, wraps tabs around visible controls, and restores focus on Escape", async () => {
    const user = userEvent.setup();
    render(<Shell />);
    const trigger = screen.getByRole("button", { name: "Open navigation" });
    trigger.focus();
    await user.keyboard("{Enter}");
    const close = screen.getByRole("button", { name: "Close navigation" });
    expect(close).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: /More/ })).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Mobile navigation" })).toBeNull();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("expands groups with the keyboard and closes after navigating", async () => {
    const user = userEvent.setup();
    render(<Shell />);
    const trigger = screen.getByRole("button", { name: "Open navigation" });
    await user.click(trigger);
    await user.tab({ shift: true });
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: /More/ })).toHaveAttribute("aria-expanded", "true");
    await user.tab();
    expect(screen.getByRole("button", { name: "Schedule" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(navigate).toHaveBeenCalledWith("Schedule");
    expect(screen.queryByRole("dialog", { name: "Mobile navigation" })).toBeNull();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("preserves close-button dismissal and restores scrolling and trigger focus", async () => {
    const user = userEvent.setup();
    render(<Shell />);
    const trigger = screen.getByRole("button", { name: "Open navigation" });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Close navigation" }));
    expect(screen.queryByRole("dialog", { name: "Mobile navigation" })).toBeNull();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe("auto");
    await user.tab();
    expect(screen.getByRole("button", { name: "Page action" })).toHaveFocus();
  });
});
