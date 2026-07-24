// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  reset: vi.fn(),
}));

vi.mock("@/components/shared/ProjectContext", () => ({
  useProjectContext: () => ({ activeProject: { id: "p-1", name: "Project One" } }),
}));

vi.mock("../useScheduleAssistant", () => ({
  useScheduleAssistant: () => ({
    messages: [],
    sending: false,
    error: null,
    send: mocks.send,
    reset: mocks.reset,
  }),
}));

vi.mock("../AiMessageBubble", () => ({ default: () => null }));

import AiAssistantDrawer from "../AiAssistantDrawer";

describe("AiAssistantDrawer", () => {
  it("runs a starter prompt immediately instead of only filling the composer", async () => {
    const user = userEvent.setup();
    render(<AiAssistantDrawer open onClose={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Top delay risks in the next 3 weeks?" }));

    expect(mocks.send).toHaveBeenCalledWith("Top delay risks in the next 3 weeks?");
    expect(screen.getByLabelText(/project assistant/i)).toHaveValue("");
  });
});
