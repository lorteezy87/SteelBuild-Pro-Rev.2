// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import StatusPill from "@/components/desktop/module/StatusPill";

describe("StatusPill", () => {
  it("renders children and tone class", () => {
    const { getByText, container } = render(<StatusPill tone="open">Open</StatusPill>);
    expect(getByText("Open")).toBeTruthy();
    expect(container.querySelector(".desk-status-pill--open")).toBeTruthy();
  });
  it("falls back to neutral for unknown tone", () => {
    const { container } = render(<StatusPill tone="weird">X</StatusPill>);
    expect(container.querySelector(".desk-status-pill")).toBeTruthy();
    expect(container.querySelector(".desk-status-pill--weird")).toBeNull();
  });
});
