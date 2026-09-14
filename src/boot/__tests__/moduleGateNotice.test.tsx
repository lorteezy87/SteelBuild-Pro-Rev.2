// @vitest-environment jsdom
/**
 * A page whose module is switched off must SAY SO in place, not silently
 * redirect to the Dashboard.
 *
 * The old ModuleGate rendered `<Navigate to="/" replace />`, which was
 * indistinguishable from a broken route: /Reports, /ActionItems,
 * /ExecutiveView, /ResourceHub and friends all dumped the user on the
 * Dashboard with no message, no flag name, and no way to enable the module.
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import ModuleDisabledNotice from "@/components/shared/ModuleDisabledNotice";
import { gateFlagForPage, isGatedPage, MODULE_GATE_LABELS } from "@/config/moduleGating";

const LABELS = MODULE_GATE_LABELS as Record<string, string>;

const renderNotice = (page: string) =>
  render(
    <MemoryRouter>
      <ModuleDisabledNotice page={page} flagKey={gateFlagForPage(page)} />
    </MemoryRouter>,
  );

describe("ModuleDisabledNotice", () => {
  it("names the module instead of leaving the user guessing", () => {
    renderNotice("Reports");
    const label = LABELS.module_advanced_reports.split(" (")[0];
    expect(screen.getByText(new RegExp(label, "i"))).toBeTruthy();
    expect(screen.getByText(/isn’t enabled for this workspace/i)).toBeTruthy();
  });

  it("states nothing is broken and no data was lost", () => {
    renderNotice("ActionItems");
    expect(screen.getByText(/Nothing is broken and no data was lost/i)).toBeTruthy();
  });

  it("surfaces the exact flag key an admin flips", () => {
    renderNotice("ResourceHub");
    expect(screen.getByText("module_resources")).toBeTruthy();
  });

  it("offers a route to manage modules and a way back", () => {
    renderNotice("ExecutiveView");
    expect(screen.getByRole("link", { name: /manage modules/i }).getAttribute("href")).toBe("/FeatureFlagsAdmin");
    expect(screen.getByRole("link", { name: /back to dashboard/i }).getAttribute("href")).toBe("/");
  });

  it("is not presented as an error", () => {
    const { container } = renderNotice("Reports");
    expect(container.textContent).not.toMatch(/error|failed|something went wrong/i);
  });
});

describe("gate coverage for the pages reported as silent Dashboard dumps", () => {
  // Each of these was reported as "dumps you on Dashboard"; all are gated, so
  // all now render the notice with a resolvable flag key.
  it.each([
    "Reports",
    "ReportsHub",
    "ExecutiveView",
    "ActionItems",
    "ResourceHub",
    "ResourceScheduling",
  ])("%s is gated and resolves to a labelled flag", (page: string) => {
    expect(isGatedPage(page)).toBe(true);
    const flag = gateFlagForPage(page);
    expect(flag).toBeTruthy();
    expect(LABELS[flag as string]).toBeTruthy();
  });
});
