// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import EmptyState from "@/components/desktop/module/states/EmptyState";
import ErrorState from "@/components/desktop/module/states/ErrorState";
import PermissionDenied from "@/components/desktop/module/states/PermissionDenied";
import LoadingSkeleton from "@/components/desktop/module/states/LoadingSkeleton";

describe("states kit", () => {
  it("EmptyState renders title, message, and CTA", () => {
    const onAct = vi.fn();
    const { getByText } = render(<EmptyState title="No RFIs yet" message="Create your first RFI." action={{ label: "New RFI", onClick: onAct }} />);
    expect(getByText("No RFIs yet")).toBeTruthy();
    expect(getByText("Create your first RFI.")).toBeTruthy();
    fireEvent.click(getByText("New RFI"));
    expect(onAct).toHaveBeenCalled();
  });
  it("ErrorState shows message and Retry when onRetry given", () => {
    const onRetry = vi.fn();
    const { getByText } = render(<ErrorState message="Something went wrong." onRetry={onRetry} />);
    fireEvent.click(getByText("Retry"));
    expect(onRetry).toHaveBeenCalled();
  });
  it("PermissionDenied renders a default message", () => {
    const { getByText } = render(<PermissionDenied />);
    expect(getByText(/don.t have access/i)).toBeTruthy();
  });
  it("LoadingSkeleton renders the requested number of skeleton rows", () => {
    const { container } = render(<LoadingSkeleton rows={4} />);
    expect(container.querySelectorAll(".desk-skeleton").length).toBe(4);
  });
});
