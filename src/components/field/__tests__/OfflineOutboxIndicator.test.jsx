// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import OfflineOutboxIndicator from "../OfflineOutboxIndicator";

describe("OfflineOutboxIndicator", () => {
  it("renders nothing when online with an empty queue", () => {
    const { container } = render(<OfflineOutboxIndicator online pending={0} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows an offline message when offline", () => {
    render(<OfflineOutboxIndicator online={false} pending={0} />);
    expect(screen.getByRole("status").textContent).toMatch(/offline/i);
  });

  it("counts queued changes when offline with a backlog", () => {
    render(<OfflineOutboxIndicator online={false} pending={3} />);
    expect(screen.getByRole("status").textContent).toMatch(/3 changes queued/i);
  });

  it("singularizes a single queued change", () => {
    render(<OfflineOutboxIndicator online={false} pending={1} />);
    expect(screen.getByRole("status").textContent).toMatch(/1 change queued/i);
  });

  it("offers Sync now only when online with a backlog, and calls onSync", () => {
    const onSync = vi.fn();
    render(<OfflineOutboxIndicator online pending={2} onSync={onSync} />);
    screen.getByRole("button", { name: /sync now/i }).click();
    expect(onSync).toHaveBeenCalledTimes(1);
  });

  it("has no Sync button while offline", () => {
    render(<OfflineOutboxIndicator online={false} pending={2} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
