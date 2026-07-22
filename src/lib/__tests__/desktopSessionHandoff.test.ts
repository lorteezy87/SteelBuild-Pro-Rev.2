import { describe, expect, it } from "vitest";

import {
  DESKTOP_SESSION_ALGORITHM,
  buildDesktopCallbackUrl,
  encodePublicKeyQuery,
  encryptDesktopSession,
  parseDesktopConnectQuery,
} from "../desktopSessionHandoff";

async function publicKeyJwk(): Promise<JsonWebKey> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  return crypto.subtle.exportKey("jwk", pair.publicKey);
}

describe("desktop browser session handoff", () => {
  it("parses only the exact state, challenge, and P-256 public key query", async () => {
    const key = await publicKeyJwk();
    const search = new URLSearchParams({
      state: "A".repeat(43),
      challenge: "B".repeat(43),
      publicKey: encodePublicKeyQuery(key),
    });

    expect(parseDesktopConnectQuery(`?${search}`)).toMatchObject({
      state: "A".repeat(43),
      challenge: "B".repeat(43),
      publicKey: { kty: "EC", crv: "P-256" },
    });

    search.set("unexpected", "true");
    expect(() => parseDesktopConnectQuery(`?${search}`)).toThrow(/unsupported/i);
  });

  it("rejects unsupported encryption algorithms", async () => {
    const key = await publicKeyJwk();
    await expect(encryptDesktopSession({
      algorithm: "RSA-OAEP" as never,
      state: "A".repeat(43),
      publicKey: key,
      session: {
        accessToken: "access-secret-value-123",
        refreshToken: "refresh-secret-value-123",
        expiresAt: 1_800_000_000,
        user: { id: "user-1", email: "pm@example.com" },
      },
    })).rejects.toThrow(/algorithm/i);
  });

  it("encrypts a minimal session without plaintext credentials in the envelope", async () => {
    const key = await publicKeyJwk();
    const envelope = await encryptDesktopSession({
      algorithm: DESKTOP_SESSION_ALGORITHM,
      state: "A".repeat(43),
      publicKey: key,
      session: {
        accessToken: "access-secret-value-123",
        refreshToken: "refresh-secret-value-123",
        expiresAt: 1_800_000_000,
        user: { id: "user-1", email: "pm@example.com" },
      },
      randomBytes: (length) => new Uint8Array(length).fill(7),
    });

    expect(envelope).toMatchObject({
      algorithm: DESKTOP_SESSION_ALGORITHM,
      ephemeralPublicKey: { kty: "EC", crv: "P-256" },
    });
    const serialized = JSON.stringify(envelope);
    expect(serialized).not.toContain("access-secret-value-123");
    expect(serialized).not.toContain("refresh-secret-value-123");
    expect(envelope.ciphertext.length).toBeLessThan(16_384);
  });

  it("builds a callback containing only opaque code and state", () => {
    const callback = buildDesktopCallbackUrl({
      code: "C".repeat(43),
      state: "A".repeat(43),
    });
    expect(callback).toBe(
      `desktop-command-center://steelbuild/callback?code=${"C".repeat(43)}&state=${"A".repeat(43)}`,
    );
    expect(callback).not.toContain("token");
    expect(callback).not.toContain("secret");
  });
});
