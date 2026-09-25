// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import NativeSignIn from "@/pages/NativeSignIn";

afterEach(cleanup);

function props() {
  return {
    onLogin: vi.fn().mockResolvedValue(undefined),
    onForgotPassword: vi.fn().mockResolvedValue({ success: true }),
    isSubmitting: false,
    loginError: null as string | null,
  };
}

describe("native account entry", () => {
  it("offers existing customers sign-in and password recovery without signup or pricing", async () => {
    const handlers = props();
    render(<NativeSignIn {...handlers} />);

    expect(screen.getByRole("heading", { name: "Sign in to SteelBuild Pro" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create account/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/\$99|\$299|pricing/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "crew@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "example-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(handlers.onLogin).toHaveBeenCalledWith({
      email: "crew@example.com",
      password: "example-password",
    });

    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(handlers.onForgotPassword).toHaveBeenCalledWith("crew@example.com");
    expect(await screen.findByText(/If an account exists/)).toBeInTheDocument();
  });
});
