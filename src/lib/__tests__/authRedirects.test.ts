import { describe, expect, it } from "vitest";

import { passwordResetRedirect } from "@/lib/authRedirects";

describe("passwordResetRedirect", () => {
  it("uses the allowlisted production URL inside the native shell", () => {
    expect(passwordResetRedirect("capacitor://localhost", true)).toBe(
      "https://steelbuild-pro.com/update-password",
    );
  });

  it("keeps the current web origin for browser deployments", () => {
    expect(passwordResetRedirect("https://preview.example.com", false)).toBe(
      "https://preview.example.com/update-password",
    );
  });

  it("returns undefined when no browser origin is available", () => {
    expect(passwordResetRedirect(undefined, false)).toBeUndefined();
  });
});
