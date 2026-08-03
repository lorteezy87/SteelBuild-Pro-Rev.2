// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/AuthContext", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@planner/app/PlannerAuthGate", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import PlannerApp from "@planner/app/PlannerApp";

describe("PlannerApp", () => {
  it("renders the SteelBuild Planner identity", () => {
    render(<PlannerApp />);

    expect(screen.getByRole("heading", { level: 1, name: "STEELBUILD-PLANNER" })).toBeInTheDocument();
    expect(screen.getByText("Construction Action & Lookahead Control")).toBeInTheDocument();
  });
});
