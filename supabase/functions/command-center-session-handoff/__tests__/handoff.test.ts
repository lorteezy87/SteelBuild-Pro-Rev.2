import { describe, expect, it } from "vitest";

import {
  HANDOFF_TTL_MS,
  base64UrlEncode,
  buildRedeemResponse,
  createHandoff,
  deriveCodeChallenge,
  hashOpaqueValue,
  parseEncryptedSessionEnvelope,
  validateBase64Url,
  validateRedeemAttempt,
} from "../handoff";

const now = new Date("2026-07-21T20:00:00.000Z");
const state = base64UrlEncode(new Uint8Array(32).fill(1));
const verifier = base64UrlEncode(new Uint8Array(32).fill(2));
const envelope = {
  algorithm: "P-256+A256GCM" as const,
  ephemeralPublicKey: {
    kty: "EC" as const,
    crv: "P-256" as const,
    x: base64UrlEncode(new Uint8Array(32).fill(3)),
    y: base64UrlEncode(new Uint8Array(32).fill(4)),
    ext: true,
  },
  iv: base64UrlEncode(new Uint8Array(12).fill(5)),
  ciphertext: base64UrlEncode(new Uint8Array(256).fill(6)),
};

describe("desktop session handoff", () => {
  it("validates bounded base64url inputs", () => {
    expect(validateBase64Url(state, "state", 32, 64)).toBe(state);
    for (const invalid of ["", "contains+plus", "contains/slash", "has=padding", "white space"]) {
      expect(() => validateBase64Url(invalid, "value", 1, 128)).toThrow();
    }
  });

  it("accepts only the strict bounded encrypted envelope", () => {
    expect(parseEncryptedSessionEnvelope(envelope)).toEqual(envelope);
    expect(() => parseEncryptedSessionEnvelope({ ...envelope, algorithm: "RSA-OAEP" })).toThrow();
    expect(() => parseEncryptedSessionEnvelope({ ...envelope, accessToken: "secret" })).toThrow();
    expect(() => parseEncryptedSessionEnvelope({ ...envelope, ciphertext: "a".repeat(17_000) })).toThrow();
  });

  it("creates a user-bound handoff with an exact two-minute expiry", async () => {
    const codeChallenge = await deriveCodeChallenge(verifier);
    const result = await createHandoff({
      userId: "user-1",
      state,
      codeChallenge,
      encryptedSession: envelope,
      now,
      randomBytes: () => new Uint8Array(32).fill(9),
    });

    expect(Date.parse(result.expiresAt) - now.getTime()).toBe(HANDOFF_TTL_MS);
    expect(result.record.userId).toBe("user-1");
    expect(result.record.codeHash).toBe(await hashOpaqueValue(result.code));
    expect(JSON.stringify(result.record)).not.toContain(result.code);
  });

  it("matches the SHA-256 verifier challenge and rejects the wrong verifier", async () => {
    const challenge = await deriveCodeChallenge(verifier);
    expect(challenge).toHaveLength(43);

    const created = await createHandoff({
      userId: "user-1",
      state,
      codeChallenge: challenge,
      encryptedSession: envelope,
      now,
      randomBytes: () => new Uint8Array(32).fill(7),
    });

    await expect(validateRedeemAttempt({
      row: created.record,
      code: created.code,
      verifier,
      now,
    })).resolves.toEqual(expect.objectContaining({ state }));

    const wrongVerifier = base64UrlEncode(new Uint8Array(32).fill(8));
    await expect(validateRedeemAttempt({
      row: created.record,
      code: created.code,
      verifier: wrongVerifier,
      now,
    })).rejects.toThrow(/invalid/i);
  });

  it("rejects expired, consumed, and replayed rows", async () => {
    const challenge = await deriveCodeChallenge(verifier);
    const created = await createHandoff({
      userId: "user-1",
      state,
      codeChallenge: challenge,
      encryptedSession: envelope,
      now,
      randomBytes: () => new Uint8Array(32).fill(7),
    });

    await expect(validateRedeemAttempt({
      row: created.record,
      code: created.code,
      verifier,
      now: new Date(now.getTime() + HANDOFF_TTL_MS + 1),
    })).rejects.toThrow(/expired/i);

    const consumed = { ...created.record, consumedAt: now.toISOString() };
    await expect(validateRedeemAttempt({ row: consumed, code: created.code, verifier, now })).rejects.toThrow(/consumed/i);
    await expect(validateRedeemAttempt({ row: consumed, code: created.code, verifier, now })).rejects.toThrow(/consumed/i);
  });

  it("returns only state and ciphertext after redemption", () => {
    const response = buildRedeemResponse({ state, encryptedSession: envelope });
    expect(response).toEqual({ state, encryptedSession: envelope });
    expect(response).not.toHaveProperty("userId");
    expect(response).not.toHaveProperty("codeHash");
    expect(response).not.toHaveProperty("verifier");
  });
});
