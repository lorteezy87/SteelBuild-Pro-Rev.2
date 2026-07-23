// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DesktopConnect, type DesktopConnectDependencies } from "../DesktopConnect";
import { DesktopSessionCryptoError } from "@/lib/desktopSessionHandoff";

describe("DesktopConnect", () => {
  it("identifies invalid desktop request parameters before reading the browser session", async () => {
    const dependencies: DesktopConnectDependencies = {
      getSession: vi.fn(),
      encryptSession: vi.fn(),
      createHandoff: vi.fn(),
      redirect: vi.fn(),
    };

    render(
      <DesktopConnect
        dependencies={dependencies}
        search="?invalid=true"
        parseQuery={() => { throw new Error("raw-query-detail"); }}
      />,
    );

    expect(await screen.findByText(/DC-QUERY/)).toBeInTheDocument();
    expect(screen.queryByText(/raw-query-detail/i)).not.toBeInTheDocument();
    expect(dependencies.getSession).not.toHaveBeenCalled();
  });

  it("creates an encrypted handoff and redirects without credentials", async () => {
    const redirect = vi.fn();
    const createHandoff = vi.fn().mockResolvedValue({
      code: "C".repeat(43),
      expiresAt: "2026-07-21T20:02:00.000Z",
    });
    const dependencies: DesktopConnectDependencies = {
      getSession: vi.fn().mockResolvedValue({
        access_token: "access-secret",
        refresh_token: "refresh-secret",
        expires_at: 1_800_000_000,
        user: { id: "user-1", email: "pm@example.com" },
      }),
      encryptSession: vi.fn().mockResolvedValue({
        algorithm: "P-256+A256GCM",
        ephemeralPublicKey: { kty: "EC", crv: "P-256", x: "X".repeat(43), y: "Y".repeat(43), ext: true },
        iv: "I".repeat(16),
        ciphertext: "E".repeat(64),
      }),
      createHandoff,
      redirect,
    };

    render(
      <DesktopConnect
        dependencies={dependencies}
        search={`?state=${"A".repeat(43)}&challenge=${"B".repeat(43)}&publicKey=test-key`}
        parseQuery={() => ({
          state: "A".repeat(43),
          challenge: "B".repeat(43),
          publicKey: { kty: "EC", crv: "P-256", x: "X".repeat(43), y: "Y".repeat(43), ext: true },
        })}
      />,
    );

    expect(screen.getByText(/connecting/i)).toBeInTheDocument();
    await waitFor(() => expect(redirect).toHaveBeenCalledTimes(1));
    const callback = redirect.mock.calls[0]?.[0] as string;
    expect(callback).toContain("desktop-command-center://steelbuild/callback?");
    expect(callback).not.toContain("access-secret");
    expect(callback).not.toContain("refresh-secret");
    expect(createHandoff).toHaveBeenCalledWith(expect.objectContaining({
      state: "A".repeat(43),
      codeChallenge: "B".repeat(43),
    }));
  });

  it("offers a safe retry without rendering session material", async () => {
    const dependencies: DesktopConnectDependencies = {
      getSession: vi.fn().mockRejectedValue(new Error("refresh-secret leaked by provider")),
      encryptSession: vi.fn(),
      createHandoff: vi.fn(),
      redirect: vi.fn(),
    };

    render(
      <DesktopConnect
        dependencies={dependencies}
        search="?invalid=true"
        parseQuery={() => ({
          state: "A".repeat(43),
          challenge: "B".repeat(43),
          publicKey: { kty: "EC", crv: "P-256", x: "X".repeat(43), y: "Y".repeat(43), ext: true },
        })}
      />,
    );

    expect(await screen.findByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(screen.getByText(/DC-SESSION/)).toBeInTheDocument();
    expect(screen.getByText(/sign in to SteelBuild/i)).toBeInTheDocument();
    expect(screen.queryByText(/refresh-secret/i)).not.toBeInTheDocument();
  });

  it("identifies browser encryption failures without exposing the underlying error", async () => {
    const dependencies: DesktopConnectDependencies = {
      getSession: vi.fn().mockResolvedValue({
        access_token: "access-secret-value",
        refresh_token: "refresh-secret-value",
        expires_at: 1_800_000_000,
        user: { id: "user-1", email: "pm@example.com" },
      }),
      encryptSession: vi.fn().mockRejectedValue(new Error("private-key-material")),
      createHandoff: vi.fn(),
      redirect: vi.fn(),
    };

    render(
      <DesktopConnect
        dependencies={dependencies}
        search="?valid=true"
        parseQuery={() => ({
          state: "A".repeat(43),
          challenge: "B".repeat(43),
          publicKey: { kty: "EC", crv: "P-256", x: "X".repeat(43), y: "Y".repeat(43), ext: true },
        })}
      />,
    );

    expect(await screen.findByText(/DC-CRYPTO/)).toBeInTheDocument();
    expect(screen.queryByText(/private-key-material/i)).not.toBeInTheDocument();
  });

  it("shows the safe WebCrypto substage when the failure is classified", async () => {
    const dependencies: DesktopConnectDependencies = {
      getSession: vi.fn().mockResolvedValue({
        access_token: "access-secret-value",
        refresh_token: "refresh-secret-value",
        expires_at: 1_800_000_000,
        user: { id: "user-1", email: "pm@example.com" },
      }),
      encryptSession: vi.fn().mockRejectedValue(new DesktopSessionCryptoError("import")),
      createHandoff: vi.fn(),
      redirect: vi.fn(),
    };

    render(
      <DesktopConnect
        dependencies={dependencies}
        search="?valid=true"
        parseQuery={() => ({
          state: "A".repeat(43),
          challenge: "B".repeat(43),
          publicKey: { kty: "EC", crv: "P-256", x: "X".repeat(43), y: "Y".repeat(43), ext: true },
        })}
      />,
    );

    expect(await screen.findByText(/DC-CRYPTO-IMPORT/)).toBeInTheDocument();
  });

  it("identifies handoff service failures without exposing the underlying error", async () => {
    const dependencies: DesktopConnectDependencies = {
      getSession: vi.fn().mockResolvedValue({
        access_token: "access-secret-value",
        refresh_token: "refresh-secret-value",
        expires_at: 1_800_000_000,
        user: { id: "user-1", email: "pm@example.com" },
      }),
      encryptSession: vi.fn().mockResolvedValue({
        algorithm: "P-256+A256GCM",
        ephemeralPublicKey: { kty: "EC", crv: "P-256", x: "X".repeat(43), y: "Y".repeat(43), ext: true },
        iv: "I".repeat(16),
        ciphertext: "E".repeat(64),
      }),
      createHandoff: vi.fn().mockRejectedValue(new Error("backend-internal-detail")),
      redirect: vi.fn(),
    };

    render(
      <DesktopConnect
        dependencies={dependencies}
        search="?valid=true"
        parseQuery={() => ({
          state: "A".repeat(43),
          challenge: "B".repeat(43),
          publicKey: { kty: "EC", crv: "P-256", x: "X".repeat(43), y: "Y".repeat(43), ext: true },
        })}
      />,
    );

    expect(await screen.findByText(/DC-HANDOFF/)).toBeInTheDocument();
    expect(screen.queryByText(/backend-internal-detail/i)).not.toBeInTheDocument();
  });
});
