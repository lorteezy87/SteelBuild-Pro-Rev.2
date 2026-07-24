// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("../AiAssistantDrawer", () => ({
  default: ({ open }) => open ? <div data-testid="assistant-drawer" /> : null,
}));

import AiAssistantLauncher from "../AiAssistantLauncher";

describe("AiAssistantLauncher", () => {
  it("opens from the explicit launcher button", () => {
    render(<AiAssistantLauncher />);
    fireEvent.click(screen.getByRole("button", { name: /open project assistant/i }));
    expect(screen.getByTestId("assistant-drawer")).toBeInTheDocument();
  });

  it("does not claim the global Ctrl+K search shortcut", () => {
    render(<AiAssistantLauncher />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.queryByTestId("assistant-drawer")).not.toBeInTheDocument();
  });
});
