export const HANDOFF_TTL_MS = 2 * 60 * 1_000;
export const HANDOFF_ALGORITHM = "P-256+A256GCM" as const;

export interface EncryptedSessionEnvelope {
  algorithm: typeof HANDOFF_ALGORITHM;
  ephemeralPublicKey: {
    kty: "EC";
    crv: "P-256";
    x: string;
    y: string;
    ext: true;
  };
  iv: string;
  ciphertext: string;
}

export interface HandoffRecord {
  codeHash: string;
  userId: string;
  state: string;
  codeChallenge: string;
  encryptedSession: EncryptedSessionEnvelope;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
}

interface CreateHandoffInput {
  userId: string;
  state: string;
  codeChallenge: string;
  encryptedSession: unknown;
  now?: Date;
  randomBytes?: () => Uint8Array;
}

export async function createHandoff(input: CreateHandoffInput): Promise<{
  code: string;
  expiresAt: string;
  record: HandoffRecord;
}> {
  const userId = requireIdentifier(input.userId, "userId");
  const state = validateBase64Url(input.state, "state", 32, 128);
  const codeChallenge = validateBase64Url(input.codeChallenge, "codeChallenge", 43, 128);
  const encryptedSession = parseEncryptedSessionEnvelope(input.encryptedSession);
  const createdAt = input.now ?? new Date();
  if (!Number.isFinite(createdAt.getTime())) throw new Error("Invalid handoff creation time");

  const random = input.randomBytes ?? secureRandomCode;
  const codeBytes = random();
  if (!(codeBytes instanceof Uint8Array) || codeBytes.byteLength !== 32) {
    throw new Error("Handoff codes require exactly 32 random bytes");
  }

  const code = base64UrlEncode(codeBytes);
  const expiresAt = new Date(createdAt.getTime() + HANDOFF_TTL_MS).toISOString();
  const record: HandoffRecord = {
    codeHash: await hashOpaqueValue(code),
    userId,
    state,
    codeChallenge,
    encryptedSession,
    createdAt: createdAt.toISOString(),
    expiresAt,
    consumedAt: null,
  };

  return { code, expiresAt, record };
}

export async function validateRedeemAttempt(input: {
  row: HandoffRecord;
  code: string;
  verifier: string;
  now?: Date;
}): Promise<{ state: string; encryptedSession: EncryptedSessionEnvelope }> {
  const now = input.now ?? new Date();
  const code = validateBase64Url(input.code, "code", 43, 64);
  const verifier = validateBase64Url(input.verifier, "verifier", 43, 128);

  if (input.row.consumedAt !== null) throw new Error("Handoff has already been consumed");
  if (now.getTime() >= Date.parse(input.row.expiresAt)) throw new Error("Handoff has expired");

  const [codeHash, challenge] = await Promise.all([
    hashOpaqueValue(code),
    deriveCodeChallenge(verifier),
  ]);
  if (!constantTimeEqual(codeHash, input.row.codeHash) || !constantTimeEqual(challenge, input.row.codeChallenge)) {
    throw new Error("Invalid handoff code or verifier");
  }

  return buildRedeemResponse(input.row);
}

export function buildRedeemResponse(input: {
  state: string;
  encryptedSession: EncryptedSessionEnvelope;
}): { state: string; encryptedSession: EncryptedSessionEnvelope } {
  return {
    state: validateBase64Url(input.state, "state", 32, 128),
    encryptedSession: parseEncryptedSessionEnvelope(input.encryptedSession),
  };
}

export function parseEncryptedSessionEnvelope(value: unknown): EncryptedSessionEnvelope {
  const envelope = requirePlainObject(value, "encryptedSession");
  requireExactKeys(envelope, ["algorithm", "ephemeralPublicKey", "iv", "ciphertext"], "encryptedSession");
  if (envelope.algorithm !== HANDOFF_ALGORITHM) {
    throw new Error(`encryptedSession.algorithm must be ${HANDOFF_ALGORITHM}`);
  }

  const key = requirePlainObject(envelope.ephemeralPublicKey, "ephemeralPublicKey");
  requireExactKeys(key, ["kty", "crv", "x", "y", "ext"], "ephemeralPublicKey");
  if (key.kty !== "EC" || key.crv !== "P-256" || key.ext !== true) {
    throw new Error("ephemeralPublicKey must be an extractable P-256 EC key");
  }

  return {
    algorithm: HANDOFF_ALGORITHM,
    ephemeralPublicKey: {
      kty: "EC",
      crv: "P-256",
      x: validateBase64Url(key.x, "ephemeralPublicKey.x", 43, 44),
      y: validateBase64Url(key.y, "ephemeralPublicKey.y", 43, 44),
      ext: true,
    },
    iv: validateBase64Url(envelope.iv, "iv", 16, 24),
    ciphertext: validateBase64Url(envelope.ciphertext, "ciphertext", 1, 16_384),
  };
}

export function validateBase64Url(
  value: unknown,
  field: string,
  minimumLength: number,
  maximumLength: number,
): string {
  if (typeof value !== "string"
    || value.length < minimumLength
    || value.length > maximumLength
    || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`${field} must be unpadded base64url between ${minimumLength} and ${maximumLength} characters`);
  }
  return value;
}

export async function deriveCodeChallenge(verifier: string): Promise<string> {
  const normalized = validateBase64Url(verifier, "verifier", 43, 128);
  return hashOpaqueValue(normalized);
}

export async function hashOpaqueValue(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64UrlEncode(new Uint8Array(digest));
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

function secureRandomCode(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

function requireIdentifier(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 200) {
    throw new Error(`${field} must be a non-empty identifier no longer than 200 characters`);
  }
  return value.trim();
}

function requirePlainObject(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(value: Record<string, unknown>, keys: readonly string[], field: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${field} contains unsupported or missing fields`);
  }
}
