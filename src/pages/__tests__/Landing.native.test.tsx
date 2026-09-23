// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { nativeState } = vi.hoisted(() => ({
  nativeState: { enabled: true },
}));

vi.mock("@/lib/native/platform", () => ({
  isNativePlatform: () => nativeState.enabled,
}));

vi.mock("@/components/landing/MarketingLanding", () => ({
  default: ({ onLogin, onStart }: { onLogin: () => void; onStart: () => void }) => (
    <div data-testid="marketing-landing">
      <button type="button" onClick={onLogin}>Marketing sign in</button>
      <button type="button" onClick={onStart}>Marketing create account</button>
    </div>
  ),
}));

import Landing from "@/pages/Landing";

const landingProps = {
  onLogin: vi.fn(),
  onSignUp: vi.fn(),
  onForgotPassword: vi.fn(),
  isSubmitting: false,
  loginError: null as string | null,
};

describe("Landing native sign-in-only flow", () => {
  beforeEach(() => {
    nativeState.enabled = true;
    vi.clearAllMocks();
  });

  it("opens directly to a non-dismissible sign-in surface without marketing or account creation", async () => {
    render(<Landing {...landingProps} />);

    const dialog = screen.getByRole("dialog", { name: "Sign in" });
    const overlay = dialog.parentElement;

    expect(screen.queryByTestId("marketing-landing")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close sign in" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create an account" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Forgot password?" })).toBeInTheDocument();
    expect(overlay?.style.paddingTop).toContain("safe-area-inset-top");
    expect(overlay?.style.paddingBottom).toContain("safe-area-inset-bottom");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Sign in" })).toBeInTheDocument();

    if (!overlay) throw new Error("Expected native sign-in overlay");
    await userEvent.click(overlay);
    expect(screen.getByRole("dialog", { name: "Sign in" })).toBeInTheDocument();
  });

  it("keeps the existing marketing and account-creation entry points on web", async () => {
    nativeState.enabled = false;
    const user = userEvent.setup();
    render(<Landing {...landingProps} />);

    expect(screen.getByTestId("marketing-landing")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Marketing sign in" }));
    expect(screen.getByRole("dialog", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close sign in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create an account" })).toBeInTheDocument();
  });

  it("submits password recovery from the native sign-in surface", async () => {
    const user = userEvent.setup();
    landingProps.onForgotPassword.mockResolvedValueOnce({ success: true });
    render(<Landing {...landingProps} />);

    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    await user.type(screen.getByLabelText("Email"), "field@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(landingProps.onForgotPassword).toHaveBeenCalledWith("field@example.com");
    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();
  });
});
