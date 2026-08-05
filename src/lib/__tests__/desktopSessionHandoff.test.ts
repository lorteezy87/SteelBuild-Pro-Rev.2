import { describe, expect, it, vi } from "vitest";

import {
  DESKTOP_SESSION_ALGORITHM,
  DesktopConnectQueryError,
  DesktopSessionCryptoError,
  DesktopSessionValidationError,
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
  it("parses state, challenge, and P-256 public key from the connect query", async () => {
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
  });

  it("ignores unknown query params when the three required fields are present", async () => {
    const key = await publicKeyJwk();
    const search = new URLSearchParams({
      state: "A".repeat(43),
      challenge: "B".repeat(43),
      publicKey: encodePublicKeyQuery(key),
      nonce: "vercel-sso-nonce",
      utm_source: "preview",
    });

    expect(parseDesktopConnectQuery(`?${search}`)).toMatchObject({
      state: "A".repeat(43),
      challenge: "B".repeat(43),
    });
  });

  it("classifies an empty connect query separately from invalid values", () => {
    expect(() => parseDesktopConnectQuery("")).toThrow(DesktopConnectQueryError);
    expect(() => parseDesktopConnectQuery("")).toThrow(expect.objectContaining({ kind: "empty" }));
    expect(() => parseDesktopConnectQuery("?")).toThrow(expect.objectContaining({ kind: "empty" }));
  });

  it("classifies a partial connect query as missing required fields", () => {
    expect(() => parseDesktopConnectQuery(`?state=${"A".repeat(43)}`)).toThrow(DesktopConnectQueryError);
    expect(() => parseDesktopConnectQuery(`?state=${"A".repeat(43)}`)).toThrow(
      expect.objectContaining({ kind: "missing" }),
    );
  });

  it("rejects malformed required field values as invalid", async () => {
    const key = await publicKeyJwk();
    const search = new URLSearchParams({
      state: "A".repeat(43),
      challenge: "B".repeat(43),
      publicKey: encodePublicKeyQuery(key),
    });
    search.set("state", "not!!!valid");

    expect(() => parseDesktopConnectQuery(`?${search}`)).toThrow(
      expect.objectContaining({ kind: "invalid" }),
    );
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

  it("reports a safe stage when the recipient public key cannot be imported", async () => {
    const key = await publicKeyJwk();
    const importKey = vi.spyOn(crypto.subtle, "importKey").mockRejectedValueOnce(
      new DOMException("sensitive browser detail", "DataError"),
    );

    await expect(encryptDesktopSession({
      algorithm: DESKTOP_SESSION_ALGORITHM,
      state: "A".repeat(43),
      publicKey: key,
      session: {
        accessToken: "access-secret-value-123",
        refreshToken: "refresh-secret-value-123",
        expiresAt: 1_800_000_000,
        user: { id: "user-1", email: "pm@example.com" },
      },
    })).rejects.toEqual(new DesktopSessionCryptoError("import"));

    expect(importKey).toHaveBeenCalledWith(
      "raw",
      expect.any(ArrayBuffer),
      { name: "ECDH", namedCurve: "P-256" },
      false,
      [],
    );
    importKey.mockRestore();
  });

  it("rejects 44-character P-256 coordinates before WebCrypto import", async () => {
    const key = await publicKeyJwk();
    const importKey = vi.spyOn(crypto.subtle, "importKey");

    await expect(encryptDesktopSession({
      algorithm: DESKTOP_SESSION_ALGORITHM,
      state: "A".repeat(43),
      publicKey: {
        kty: "EC",
        crv: "P-256",
        x: `${key.x}A`,
        y: key.y,
        ext: true,
      },
      session: {
        accessToken: "access-secret-value-123",
        refreshToken: "refresh-secret-value-123",
        expiresAt: 1_800_000_000,
        user: { id: "user-1", email: "pm@example.com" },
      },
    })).rejects.toThrow(/publicKey\.x must be bounded unpadded base64url/i);

    expect(importKey).not.toHaveBeenCalled();
    importKey.mockRestore();
  });

  it("encrypts using a Tauri-shaped P-256 public key from the connect query", async () => {
    // Tauri URL JWK: kty/crv/x/y only (no ext), 43-char base64url coords.
    const tauriPublicKeyJson = JSON.stringify({
      crv: "P-256",
      kty: "EC",
      x: "X-TArsWbKT5Z8Ewtzi1NaSMoUC9-foUm236WRCuC_s8",
      y: "X4LPq_lKtaS53aMcbaF5vgHPVvo5qNoUq2h33C0dsn8",
    });
    const encodedKey = btoa(tauriPublicKeyJson)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
    const query = parseDesktopConnectQuery(
      `?state=${"A".repeat(43)}&challenge=${"B".repeat(43)}&publicKey=${encodedKey}`,
    );

    const envelope = await encryptDesktopSession({
      algorithm: DESKTOP_SESSION_ALGORITHM,
      state: query.state,
      publicKey: query.publicKey,
      session: {
        accessToken: "access-secret-value-123",
        refreshToken: "refresh-secret-value-123",
        expiresAt: 1_800_000_000,
        user: { id: "user-1", email: "pm@example.com" },
      },
      randomBytes: (length) => new Uint8Array(length).fill(3),
    });

    expect(envelope.algorithm).toBe(DESKTOP_SESSION_ALGORITHM);
    expect(envelope.ephemeralPublicKey).toMatchObject({ kty: "EC", crv: "P-256", ext: true });
    expect(envelope.ciphertext.length).toBeGreaterThan(20);
  });

  it("accepts a bounded non-empty opaque refresh token shorter than 16 characters", async () => {
    const key = await publicKeyJwk();

    const envelope = await encryptDesktopSession({
      algorithm: DESKTOP_SESSION_ALGORITHM,
      state: "A".repeat(43),
      publicKey: key,
      session: {
        accessToken: "access-secret-value-123",
        refreshToken: "short",
        expiresAt: 1_800_000_000,
        user: { id: "user-1", email: "pm@example.com" },
      },
    });

    expect(envelope.algorithm).toBe(DESKTOP_SESSION_ALGORITHM);
  });

  it("classifies an empty refresh token without exposing its value", async () => {
    const key = await publicKeyJwk();

    await expect(encryptDesktopSession({
      algorithm: DESKTOP_SESSION_ALGORITHM,
      state: "A".repeat(43),
      publicKey: key,
      session: {
        accessToken: "access-secret-value-123",
        refreshToken: "",
        expiresAt: 1_800_000_000,
        user: { id: "user-1", email: "pm@example.com" },
      },
    })).rejects.toEqual(new DesktopSessionValidationError("refresh-token"));
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
