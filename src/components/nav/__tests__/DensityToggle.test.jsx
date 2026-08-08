// @vitest-environment jsdom
//
// DensityToggle drives two density signals from one click: the dashboard_density
// user pref (persisted through useSaveUserPrefs → drives the dashboard) and the legacy
// <html data-density> attribute (drives list-page row height). These tests lock
// that wiring.

import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";

let prefs;
const savePatchConfirmed = vi.fn().mockResolvedValue({ status: "persisted" });

vi.mock("@/hooks/useUserPrefs", () => ({ useUserPrefs: () => prefs }));
vi.mock("@/hooks/useSaveUserPrefs", () => ({ useSaveUserPrefs: () => ({ savePatchConfirmed }) }));

import DensityToggle from "@/components/nav/DensityToggle";

describe("DensityToggle", () => {
  beforeEach(() => {
    prefs = { dashboard_density: "normal" };
    savePatchConfirmed.mockClear();
    document.documentElement.removeAttribute("data-density");
    try { localStorage.clear(); } catch { /* ignore */ }
  });

  it("from a non-compact pref, persists compact and mirrors data-density", () => {
    render(<DensityToggle />);
    fireEvent.click(screen.getByRole("button"));
    expect(savePatchConfirmed).toHaveBeenCalledWith({ dashboard_density: "compact" });
    expect(document.documentElement.getAttribute("data-density")).toBe("compact");
    expect(localStorage.getItem("sbp-density")).toBe("compact");
  });

  it("from compact, toggles back to comfortable", () => {
    prefs = { dashboard_density: "compact" };
    render(<DensityToggle />);
    fireEvent.click(screen.getByRole("button"));
    expect(savePatchConfirmed).toHaveBeenCalledWith({ dashboard_density: "comfortable" });
    expect(document.documentElement.getAttribute("data-density")).toBe("comfortable");
  });

  it("reflects the compact state via aria-pressed", () => {
    prefs = { dashboard_density: "compact" };
    render(<DensityToggle />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("activates via keyboard (Enter)", () => {
    render(<DensityToggle />);
    fireEvent.keyDown(screen.getByRole("button"), { key: "Enter" });
    expect(savePatchConfirmed).toHaveBeenCalledWith({ dashboard_density: "compact" });
  });
});
