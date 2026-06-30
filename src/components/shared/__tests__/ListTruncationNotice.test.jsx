// @vitest-environment jsdom
//
// Truncation notice (perf P0): renders only when a capped list hit its row
// ceiling, so silent truncation at the list cap becomes visible.

import { describe, it, expect } from "vitest";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import ListTruncationNotice, { DEFAULT_LIST_CAP } from "@/components/shared/ListTruncationNotice";
import { LIST_ROW_CAP } from "@/api/supabaseClient";

describe("ListTruncationNotice", () => {
  it("default cap stays in sync with the data-layer LIST_ROW_CAP", () => {
    // The component keeps its own literal (it can't import LIST_ROW_CAP — see the
    // component's note on the mocked-module temporal dead zone). Guard drift here,
    // where "@/api/supabaseClient" is the real, unmocked module.
    expect(DEFAULT_LIST_CAP).toBe(LIST_ROW_CAP);
  });

  it("renders nothing below the cap", () => {
    const { container } = render(<ListTruncationNotice count={DEFAULT_LIST_CAP - 1} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a non-numeric count", () => {
    const { container } = render(<ListTruncationNotice count={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the notice at the cap, with the formatted cap + label", () => {
    render(<ListTruncationNotice count={DEFAULT_LIST_CAP} label="drawings" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText(/showing first/i)).toBeInTheDocument();
    expect(screen.getByText(/DRAWINGS/)).toBeInTheDocument();
    expect(screen.getAllByText(new RegExp(DEFAULT_LIST_CAP.toLocaleString())).length).toBeGreaterThan(0);
  });

  it("falls back to the default cap (no crash) when cap is undefined", () => {
    render(<ListTruncationNotice count={5000} cap={undefined} label="rows" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getAllByText(/2,000/).length).toBeGreaterThan(0);
  });

  it("respects an explicit cap prop", () => {
    const { container, rerender } = render(<ListTruncationNotice count={50} cap={100} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<ListTruncationNotice count={100} cap={100} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
