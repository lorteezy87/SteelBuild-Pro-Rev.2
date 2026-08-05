export const DESKTOP_SESSION_ALGORITHM = "P-256+A256GCM" as const;
export const DESKTOP_SESSION_HKDF_INFO = "desktop-command-center/steelbuild-session/v1";

export type DesktopSessionCryptoStage =
  | "import"
  | "generate"
  | "derive"
  | "kdf"
  | "random"
  | "encrypt"
  | "export";

export class DesktopSessionCryptoError extends Error {
  readonly stage: DesktopSessionCryptoStage;

  constructor(stage: DesktopSessionCryptoStage) {
    super(`Desktop session cryptography failed during ${stage}`);
    this.name = "DesktopSessionCryptoError";
    this.stage = stage;
  }
}

export type DesktopSessionValidationField =
  | "access-token"
  | "refresh-token"
  | "expiry"
  | "user-id"
  | "email";

export class DesktopSessionValidationError extends Error {
  readonly field: DesktopSessionValidationField;

  constructor(field: DesktopSessionValidationField) {
    super(`Desktop session validation failed for ${field}`);
    this.name = "DesktopSessionValidationError";
    this.field = field;
  }
}

export interface DesktopConnectQuery {
  state: string;
  challenge: string;
  publicKey: JsonWebKey;
}

export type DesktopConnectQueryErrorKind = "empty" | "missing" | "invalid";

/** Safe, classifiable parse failure — never carries raw query values. */
export class DesktopConnectQueryError extends Error {
  readonly kind: DesktopConnectQueryErrorKind;

  constructor(kind: DesktopConnectQueryErrorKind, message: string) {
    super(message);
    this.name = "DesktopConnectQueryError";
    this.kind = kind;
  }
}

export const REQUIRED_DESKTOP_CONNECT_PARAMS = ["state", "challenge", "publicKey"] as const;

export function parseDesktopConnectQuery(search: string): DesktopConnectQuery {
  const trimmed = search.trim();
  if (!trimmed || trimmed === "?") {
    throw new DesktopConnectQueryError(
      "empty",
      "Desktop connection query is missing",
    );
  }

  const params = new URLSearchParams(trimmed.startsWith("?") ? trimmed.slice(1) : trimmed);
  const missing = REQUIRED_DESKTOP_CONNECT_PARAMS.filter((key) => !params.get(key));
  if (missing.length > 0) {
    throw new DesktopConnectQueryError(
      "missing",
      `Desktop connection query is missing required fields: ${missing.join(", ")}`,
    );
  }

  try {
    const state = validateBase64Url(params.get("state"), "state", 43, 128);
    const challenge = validateBase64Url(params.get("challenge"), "challenge", 43, 128);
    const encodedKey = validateBase64Url(params.get("publicKey"), "publicKey", 100, 2_048);

    let parsedKey: unknown;
    try {
      parsedKey = JSON.parse(decodeBase64UrlUtf8(encodedKey));
    } catch {
      throw new DesktopConnectQueryError("invalid", "Desktop public key is not valid encoded JSON");
    }

    return { state, challenge, publicKey: normalizeP256PublicKey(parsedKey) };
  } catch (error) {
    if (error instanceof DesktopConnectQueryError) throw error;
    throw new DesktopConnectQueryError(
      "invalid",
      error instanceof Error ? error.message : "Desktop connection query is invalid",
    );
  }
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
  const session = validateMinimalSession(input.session);
  // Validate JWK shape outside the WebCrypto stage so coordinate/format errors
  // are not misreported as DC-CRYPTO-IMPORT. Import the uncompressed SEC1 point
  // via "raw" to avoid browser JWK quirks with Tauri-issued public keys.
  const recipientJwk = normalizeP256PublicKey(input.publicKey);
  const recipientKey = await runCryptoStage("import", () => importP256PublicKeyRaw(recipientJwk));
  const ephemeral = await runCryptoStage("generate", () => crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  ));
  const sharedSecret = await runCryptoStage("derive", () => crypto.subtle.deriveBits(
    { name: "ECDH", public: recipientKey },
    ephemeral.privateKey,
    256,
  ));
  const hkdfMaterial = await runCryptoStage("kdf", () => crypto.subtle.importKey(
    "raw",
    sharedSecret,
    "HKDF",
    false,
    ["deriveKey"],
  ));
  const context = new TextEncoder().encode(DESKTOP_SESSION_HKDF_INFO);
  const encryptionKey = await runCryptoStage("kdf", () => crypto.subtle.deriveKey(
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
  ));

  const randomBytes = input.randomBytes ?? secureRandomBytes;
  let iv: Uint8Array;
  try {
    iv = randomBytes(12);
  } catch {
    throw new DesktopSessionCryptoError("random");
  }
  if (!(iv instanceof Uint8Array) || iv.byteLength !== 12) {
    throw new DesktopSessionCryptoError("random");
  }
  const plaintext = new TextEncoder().encode(JSON.stringify(session));
  const ciphertext = await runCryptoStage("encrypt", () => crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(iv),
      additionalData: toArrayBuffer(context),
      tagLength: 128,
    },
    encryptionKey,
    plaintext,
  ));
  const ephemeralJwk = await runCryptoStage("export", async () => normalizeP256PublicKey(
    await crypto.subtle.exportKey("jwk", ephemeral.publicKey),
  ));

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
  // P-256 coordinates are exactly 32 bytes → 43 chars unpadded base64url.
  // Accepting 44 chars previously let invalid 33-byte values reach importKey
  // and surface as DC-CRYPTO-IMPORT.
  const x = validateBase64Url(key.x, "publicKey.x", 43, 43);
  const y = validateBase64Url(key.y, "publicKey.y", 43, 43);
  if (decodeBase64Url(x).byteLength !== 32 || decodeBase64Url(y).byteLength !== 32) {
    throw new Error("Desktop public key coordinates must decode to 32 bytes");
  }
  if (key.ext !== undefined && key.ext !== true) {
    throw new Error("Desktop public key must be extractable");
  }
  return { kty: "EC", crv: "P-256", x, y, ext: true };
}

async function importP256PublicKeyRaw(publicKey: JsonWebKey): Promise<CryptoKey> {
  const x = decodeBase64Url(String(publicKey.x));
  const y = decodeBase64Url(String(publicKey.y));
  if (x.byteLength !== 32 || y.byteLength !== 32) {
    throw new Error("Desktop public key coordinates must decode to 32 bytes");
  }
  const uncompressed = new Uint8Array(65);
  uncompressed[0] = 0x04;
  uncompressed.set(x, 1);
  uncompressed.set(y, 33);
  return crypto.subtle.importKey(
    "raw",
    toArrayBuffer(uncompressed),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
}

function validateMinimalSession(session: MinimalDesktopSession): MinimalDesktopSession {
  if (!session || typeof session !== "object") throw new DesktopSessionValidationError("access-token");
  const accessToken = requireSecret(session.accessToken, "access-token");
  const refreshToken = requireSecret(session.refreshToken, "refresh-token");
  if (!Number.isSafeInteger(session.expiresAt) || session.expiresAt <= 0) {
    throw new DesktopSessionValidationError("expiry");
  }
  const id = requireIdentifier(session.user?.id);
  const email = requireEmail(session.user?.email);
  return { accessToken, refreshToken, expiresAt: session.expiresAt, user: { id, email } };
}

function requireSecret(value: unknown, field: "access-token" | "refresh-token"): string {
  const minimumLength = field === "refresh-token" ? 1 : 16;
  if (typeof value !== "string" || value.length < minimumLength || value.length > 16_384) {
    throw new DesktopSessionValidationError(field);
  }
  return value;
}

function requireIdentifier(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 200) {
    throw new DesktopSessionValidationError("user-id");
  }
  return value.trim();
}

function requireEmail(value: unknown): string {
  if (typeof value !== "string" || value.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new DesktopSessionValidationError("email");
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

async function runCryptoStage<T>(
  stage: DesktopSessionCryptoStage,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch {
    throw new DesktopSessionCryptoError(stage);
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
