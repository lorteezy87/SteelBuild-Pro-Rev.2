// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import DesktopConnectSignIn from "../DesktopConnectSignIn";

describe("DesktopConnectSignIn", () => {
  it("renders a branded sign-in shell with accessible form fields", () => {
    render(<DesktopConnectSignIn onLogin={vi.fn()} />);

    expect(screen.getByText("SteelBuild Pro")).toBeInTheDocument();
    expect(screen.getByText("Desktop Command Center")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /sign in to connect/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/work email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in and continue/i })).toBeInTheDocument();
  });

  it("submits trimmed credentials and surfaces login errors", async () => {
    const onLogin = vi.fn().mockImplementation(
      () => new Promise((resolve) => { setTimeout(resolve, 50); }),
    );
    render(
      <DesktopConnectSignIn
        onLogin={onLogin}
        loginError="Invalid login credentials"
      />,
    );

    fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: "  pm@example.com  " } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in and continue/i }));

    expect(screen.getByRole("button", { name: /signing in/i })).toBeDisabled();

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledWith({ email: "pm@example.com", password: "secret" });
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid login credentials");
  });
});
