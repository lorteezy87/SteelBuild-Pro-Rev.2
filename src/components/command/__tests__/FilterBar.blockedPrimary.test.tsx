// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FilterBar } from "../FilterBar";

/**
 * FilterBar rendered its primary action only when `onPrimary` was non-null, so
 * every caller that gates the action — plan limits, permissions, a register
 * mid-refetch — removed the button rather than disabling it. The new
 * `primaryDisabledReason` lets a caller gate the action and still say why.
 * Callers that pass no reason keep the old behaviour exactly.
 */
const base = { search: "", onSearch: () => {} };

describe("FilterBar — a gated primary action", () => {
  it("renders the primary action when it is available", () => {
    render(<FilterBar {...base} primaryLabel="New Project" onPrimary={() => {}} />);
    expect(screen.getByRole("button", { name: /New Project/ })).toBeEnabled();
  });

  it("keeps the button, disabled and explained, when a reason is given", () => {
    render(<FilterBar {...base} primaryLabel="New Project" onPrimary={null} primaryDisabledReason="1 of 1 projects used." />);
    const button = screen.getByRole("button", { name: /New Project/ });
    expect(button).toBeDisabled();
    expect(screen.getByText("1 of 1 projects used.")).toBeInTheDocument();
    expect(document.getElementById(button.getAttribute("aria-describedby")!)?.textContent).toBe(
      "1 of 1 projects used.",
    );
  });

  // Back-compat: the other Control Centers pass `onPrimary: null` with no
  // reason to mean "this surface has no create action". They must not sprout
  // a dead button.
  it("renders nothing when the action is absent and no reason is given", () => {
    render(<FilterBar {...base} primaryLabel="New Project" onPrimary={null} />);
    expect(screen.queryByRole("button", { name: /New Project/ })).toBeNull();
  });
});
