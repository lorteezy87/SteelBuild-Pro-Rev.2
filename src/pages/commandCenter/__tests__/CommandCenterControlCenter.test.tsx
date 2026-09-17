// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CommandCenterControlCenter from "../CommandCenterControlCenter";

vi.mock("@/components/command", async () => {
  const actual = await vi.importActual<typeof import("@/components/command")>("@/components/command");
  return { ...actual, useCommandSkin: (): void => undefined };
});

describe("CommandCenterControlCenter", () => {
  it("renders the three tactical horizons and preserves the full action register", () => {
    render(
      <CommandCenterControlCenter
        sources={{
          rfis: [],
          submittals: [],
          changeOrders: [],
          deliveries: [],
          workPackages: [],
          projects: [],
          scheduleTasks: [],
        }}
        projectName="BIMC ED Expansion"
        search=""
        onSearch={vi.fn()}
        typeFilter="All"
        onTypeChange={vi.fn()}
        onOpenItem={vi.fn()}
        onForwardLook={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Command Center" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "NOW" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "48 HOURS" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "10 DAYS" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "All Action Items" })).toBeInTheDocument();
    expect(screen.getByText("Forward Look →")).toBeInTheDocument();
  });
});
