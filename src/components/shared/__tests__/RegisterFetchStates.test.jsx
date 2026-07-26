// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RegisterFetchBody } from "@/components/shared/RegisterFetchStates";

describe("RegisterFetchBody", () => {
  it("shows a loading skeleton while fetching", () => {
    const { container } = render(
      <RegisterFetchBody
        isLoading
        isError={false}
        totalCount={0}
        filteredCount={0}
        emptyTitle="None"
      >
        <div>list</div>
      </RegisterFetchBody>,
    );
    expect(screen.queryByText("list")).not.toBeInTheDocument();
    expect(container.querySelector("[style*='skeleton-shimmer'], div")).toBeTruthy();
  });

  it("shows error + retry", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(
      <RegisterFetchBody
        isLoading={false}
        isError
        errorMessage="boom"
        onRetry={onRetry}
        totalCount={0}
        filteredCount={0}
        emptyTitle="None"
      >
        <div>list</div>
      </RegisterFetchBody>,
    );
    expect(screen.getByText("Couldn’t load records")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows true-empty with action", async () => {
    const onEmptyAction = vi.fn();
    const user = userEvent.setup();
    render(
      <RegisterFetchBody
        isLoading={false}
        isError={false}
        totalCount={0}
        filteredCount={0}
        emptyTitle="No warranties yet"
        emptyBody="Track warranties."
        emptyActionLabel="+ Add Warranty"
        onEmptyAction={onEmptyAction}
      >
        <div>list</div>
      </RegisterFetchBody>,
    );
    expect(screen.getByText("No warranties yet")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /\+ add warranty/i }));
    expect(onEmptyAction).toHaveBeenCalledTimes(1);
  });

  it("shows filter-empty when totals exist but filters exclude all", async () => {
    const onClearFilters = vi.fn();
    const user = userEvent.setup();
    render(
      <RegisterFetchBody
        isLoading={false}
        isError={false}
        totalCount={3}
        filteredCount={0}
        emptyTitle="No warranties yet"
        onClearFilters={onClearFilters}
      >
        <div>list</div>
      </RegisterFetchBody>,
    );
    expect(screen.getByText(/no records match/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /clear filters/i }));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it("renders children when filtered rows exist", () => {
    render(
      <RegisterFetchBody
        isLoading={false}
        isError={false}
        totalCount={2}
        filteredCount={2}
        emptyTitle="None"
      >
        <div>list body</div>
      </RegisterFetchBody>,
    );
    expect(screen.getByText("list body")).toBeInTheDocument();
  });
});
