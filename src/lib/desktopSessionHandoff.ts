export const DESKTOP_SESSION_ALGORITHM = "P-256+A256GCM" as const;
export const DESKTOP_SESSION_HKDF_INFO = "desktop-command-center/steelbuild-session/v1";

export interface DesktopConnectQuery {
  state: string;
  challenge: string;
  publicKey: JsonWebKey;
}

export interface MinimalDesktopSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: { id: string; email: string };
}

export interface DesktopEncryptedSession {
  algorithm: typeof DESKTOP_SESSION_ALGORITHM;
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

export function parseDesktopConnectQuery(search: string): DesktopConnectQuery {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const keys: string[] = [];
  params.forEach((_value, key) => keys.push(key));
  const expected = ["challenge", "publicKey", "state"];
  if (keys.length !== expected.length || [...keys].sort().some((key, index) => key !== expected[index])) {
    throw new Error("Desktop connection query contains unsupported, duplicate, or missing fields");
  }

  const state = validateBase64Url(params.get("state"), "state", 43, 128);
  const challenge = validateBase64Url(params.get("challenge"), "challenge", 43, 128);
  const encodedKey = validateBase64Url(params.get("publicKey"), "publicKey", 100, 2_048);

  let parsedKey: unknown;
  try {
    parsedKey = JSON.parse(decodeBase64UrlUtf8(encodedKey));
  } catch {
    throw new Error("Desktop public key is not valid encoded JSON");
  }

  return { state, challenge, publicKey: normalizeP256PublicKey(parsedKey) };
}

export async function encryptDesktopSession(input: {
  algorithm: typeof DESKTOP_SESSION_ALGORITHM;
  state: string;
  publicKey: JsonWebKey;
  session: MinimalDesktopSession;
  randomBytes?: (length: number) => Uint8Array;
}): Promise<DesktopEncryptedSession> {
  if (input.algorithm !== DESKTOP_SESSION_ALGORITHM) {
    throw new Error(`Unsupported desktop session encryption algorithm: ${String(input.algorithm)}`);
  }

  const state = validateBase64Url(input.state, "state", 43, 128);
  const recipientJwk = normalizeP256PublicKey(input.publicKey);
  const session = validateMinimalSession(input.session);
  const recipientKey = await crypto.subtle.importKey(
    "jwk",
    recipientJwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const ephemeral = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: recipientKey },
    ephemeral.privateKey,
    256,
  );
  const hkdfMaterial = await crypto.subtle.importKey("raw", sharedSecret, "HKDF", false, ["deriveKey"]);
  const context = new TextEncoder().encode(DESKTOP_SESSION_HKDF_INFO);
  const encryptionKey = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: toArrayBuffer(decodeBase64Url(state)),
      info: toArrayBuffer(context),
    },
    hkdfMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );

  const randomBytes = input.randomBytes ?? secureRandomBytes;
  const iv = randomBytes(12);
  if (!(iv instanceof Uint8Array) || iv.byteLength !== 12) {
    throw new Error("AES-GCM requires a 12-byte IV");
  }
  const plaintext = new TextEncoder().encode(JSON.stringify(session));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(iv),
      additionalData: toArrayBuffer(context),
      tagLength: 128,
    },
    encryptionKey,
    plaintext,
  );
  const ephemeralJwk = normalizeP256PublicKey(
    await crypto.subtle.exportKey("jwk", ephemeral.publicKey),
  );

  return {
    algorithm: DESKTOP_SESSION_ALGORITHM,
    ephemeralPublicKey: {
      kty: "EC",
      crv: "P-256",
      x: ephemeralJwk.x as string,
      y: ephemeralJwk.y as string,
      ext: true,
    },
    iv: encodeBase64Url(iv),
    ciphertext: encodeBase64Url(new Uint8Array(ciphertext)),
  };
}

export function buildDesktopCallbackUrl(input: { code: string; state: string }): string {
  const code = validateBase64Url(input.code, "code", 43, 64);
  const state = validateBase64Url(input.state, "state", 43, 128);
  const url = new URL("desktop-command-center://steelbuild/callback");
  url.searchParams.set("code", code);
  url.searchParams.set("state", state);
  return url.href;
}

export function encodePublicKeyQuery(key: JsonWebKey): string {
  return encodeBase64Url(new TextEncoder().encode(JSON.stringify(normalizeP256PublicKey(key))));
}

function normalizeP256PublicKey(value: unknown): JsonWebKey {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Desktop public key must be a JWK object");
  }
  const key = value as Record<string, unknown>;
  if (key.kty !== "EC" || key.crv !== "P-256") {
    throw new Error("Desktop public key must use P-256 ECDH");
  }
  const x = validateBase64Url(key.x, "publicKey.x", 43, 44);
  const y = validateBase64Url(key.y, "publicKey.y", 43, 44);
  if (key.ext !== undefined && key.ext !== true) {
    throw new Error("Desktop public key must be extractable");
  }
  return { kty: "EC", crv: "P-256", x, y, ext: true };
}

function validateMinimalSession(session: MinimalDesktopSession): MinimalDesktopSession {
  if (!session || typeof session !== "object") throw new Error("SteelBuild session is unavailable");
  const accessToken = requireSecret(session.accessToken, "access token");
  const refreshToken = requireSecret(session.refreshToken, "refresh token");
  if (!Number.isSafeInteger(session.expiresAt) || session.expiresAt <= 0) {
    throw new Error("SteelBuild session expiry is invalid");
  }
  const id = requireIdentifier(session.user?.id, "user ID");
  const email = requireEmail(session.user?.email);
  return { accessToken, refreshToken, expiresAt: session.expiresAt, user: { id, email } };
}

function requireSecret(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length < 16 || value.length > 16_384) {
    throw new Error(`SteelBuild ${field} is invalid`);
  }
  return value;
}

function requireIdentifier(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 200) {
    throw new Error(`SteelBuild ${field} is invalid`);
  }
  return value.trim();
}

function requireEmail(value: unknown): string {
  if (typeof value !== "string" || value.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error("SteelBuild account email is invalid");
  }
  return value;
}

function validateBase64Url(
  value: unknown,
  field: string,
  minimumLength: number,
  maximumLength: number,
): string {
  if (typeof value !== "string"
    || value.length < minimumLength
    || value.length > maximumLength
    || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`${field} must be bounded unpadded base64url`);
  }
  return value;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeBase64UrlUtf8(value: string): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(decodeBase64Url(value));
}

function secureRandomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}
