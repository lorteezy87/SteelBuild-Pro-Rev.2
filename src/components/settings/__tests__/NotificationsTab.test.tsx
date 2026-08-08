// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import NotificationsTab from "../NotificationsTab";

describe("NotificationsTab", () => {
  it("labels in-app filtering active and disables unconfigured delivery channels", () => {
    render(<NotificationsTab preferences={{}} onSave={vi.fn()} isSaving={false} />);

    expect(screen.getByText(/active for in-app alerts/i)).toBeInTheDocument();
    expect(screen.getAllByText(/delivery service not configured/i)).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "UNAVAILABLE" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "UNAVAILABLE" })[0]).toBeDisabled();
  });
});
