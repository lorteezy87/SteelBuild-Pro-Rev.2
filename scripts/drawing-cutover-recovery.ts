/** Offline only. Importing this module never generates keys, opens files or runs a command. */
import { constants, createCipheriv, createDecipheriv, createPrivateKey, createPublicKey, publicEncrypt, privateDecrypt, randomBytes } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, open, realpath, link, unlink } from 'node:fs/promises';
import type { Stats } from 'node:fs';
import { basename, dirname, isAbsolute, parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { PRIVATE_PAYLOAD_LIMIT, boundedJson, canonicalSetupContext, digest, requireCondition, setupContextSchema, validatePrivateRecoveryPayload,
  validateArtifactBinding } from '../e2e/drawing-cutover-setup.ts';
import type { ArtifactBinding, PrivateRecoveryPayload, SetupContext } from '../e2e/drawing-cutover-setup.ts';
export { validateFoundationReceipt, validateSetupResume } from '../e2e/drawing-cutover-setup.ts';

// Maximum base64 plaintext expansion, RSA block, fixed bounded header and JSON punctuation.
export const RECOVERY_ENVELOPE_LIMIT = Math.ceil(PRIVATE_PAYLOAD_LIMIT / 3) * 4 + 4096;
const envelopeSchema = z.object({ version: z.literal(1), algorithm: z.literal('RSA-3072-OAEP-SHA256+A256GCM'), context: setupContextSchema,
  wrappedKey: z.string().length(512), nonce: z.string().length(16), tag: z.string().length(24),
  ciphertext: z.string().min(4).max(Math.ceil(PRIVATE_PAYLOAD_LIMIT / 3) * 4),
}).strict();
export type RecoveryEnvelope = z.infer<typeof envelopeSchema>;
function decode(value: string, length?: number): Buffer {
  const bytes = Buffer.from(value, 'base64');
  requireCondition(bytes.toString('base64') === value && (length === undefined || bytes.length === length), 'RECOVERY_REFUSED');
  return bytes;
}
function publicRecipient(pem: string): ReturnType<typeof createPublicKey> {
  requireCondition(pem.length <= 4096 && pem.startsWith('-----BEGIN PUBLIC KEY-----'), 'RECOVERY_REFUSED');
  const key = createPublicKey(pem);
  requireCondition(key.asymmetricKeyType === 'rsa' && key.asymmetricKeyDetails?.modulusLength === 3072, 'RECOVERY_REFUSED'); return key;
}
function recipientFingerprint(key: ReturnType<typeof createPublicKey>): string {
  return digest(key.export({ type: 'spki', format: 'der' }));
}
export function encryptRecovery(payload: PrivateRecoveryPayload, recipientSpki: string, context: SetupContext): RecoveryEnvelope {
  let key: Buffer | undefined; let plaintext: Buffer | undefined;
  try {
    const aad = Buffer.from(canonicalSetupContext(context));
    validatePrivateRecoveryPayload(payload, context); const recipient = publicRecipient(recipientSpki);
    requireCondition(recipientFingerprint(recipient) === context.recipientSha256, 'RECOVERY_REFUSED');
    plaintext = Buffer.from(boundedJson(payload)); key = randomBytes(32); const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 }); cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return { version: 1, algorithm: 'RSA-3072-OAEP-SHA256+A256GCM', context: JSON.parse(aad.toString()) as SetupContext,
      wrappedKey: publicEncrypt({ key: recipient, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, key).toString('base64'),
      nonce: nonce.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
  } catch { throw new Error('RECOVERY_REFUSED'); }
  finally { key?.fill(0); plaintext?.fill(0); }
}
export function decryptRecovery(envelope: unknown, privateKey: string, expectedContext: SetupContext): PrivateRecoveryPayload {
  let key: Buffer | undefined; let first: Buffer | undefined; let plaintext: Buffer | undefined;
  try {
    boundedJson(envelope, RECOVERY_ENVELOPE_LIMIT); const parsed = envelopeSchema.safeParse(envelope);
    requireCondition(parsed.success, 'RECOVERY_REFUSED'); const value = parsed.data;
    const aad = canonicalSetupContext(expectedContext);
    requireCondition(canonicalSetupContext(value.context) === aad && privateKey.length <= 8192
      && privateKey.startsWith('-----BEGIN PRIVATE KEY-----'), 'RECOVERY_REFUSED');
    const recipient = createPrivateKey(privateKey); const pub = createPublicKey(recipient);
    requireCondition(pub.asymmetricKeyType === 'rsa' && pub.asymmetricKeyDetails?.modulusLength === 3072
      && recipientFingerprint(pub) === expectedContext.recipientSha256, 'RECOVERY_REFUSED');
    key = privateDecrypt({ key: recipient, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, decode(value.wrappedKey, 384));
    requireCondition(key.length === 32, 'RECOVERY_REFUSED');
    const ciphertext = decode(value.ciphertext); requireCondition(ciphertext.length <= PRIVATE_PAYLOAD_LIMIT, 'RECOVERY_REFUSED');
    const cipher = createDecipheriv('aes-256-gcm', key, decode(value.nonce, 12), { authTagLength: 16 });
    cipher.setAAD(Buffer.from(aad)); cipher.setAuthTag(decode(value.tag, 16));
    first = cipher.update(ciphertext);
    // final() authenticates all bytes before any decoding, JSON parsing or filesystem write.
    plaintext = Buffer.concat([first, cipher.final()]);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(plaintext);
    return validatePrivateRecoveryPayload(JSON.parse(text), expectedContext);
  } catch { throw new Error('RECOVERY_REFUSED'); }
  finally { key?.fill(0); first?.fill(0); plaintext?.fill(0); }
}
/** Decryption alone gives confidentiality, not sender provenance. Callers must obtain
 * expectedArtifact independently; a value copied from the downloaded artifact is not proof. */
export function decryptVerifiedRecovery(raw: string, privateKey: string, expectedContext: SetupContext,
  artifact: ArtifactBinding, independentlyVerifiedExpected: ArtifactBinding): PrivateRecoveryPayload {
  try {
    requireCondition(Buffer.byteLength(raw) <= RECOVERY_ENVELOPE_LIMIT, 'RECOVERY_REFUSED');
    const binding = validateArtifactBinding(artifact, independentlyVerifiedExpected);
    requireCondition(binding.ciphertextSha256 === digest(raw) && binding.workflowRunId === expectedContext.workflowRunId
      && binding.workflowRunAttempt === expectedContext.workflowRunAttempt && binding.candidateSha === expectedContext.candidateSha, 'RECOVERY_REFUSED');
    return decryptRecovery(JSON.parse(raw), privateKey, expectedContext);
  } catch { throw new Error('RECOVERY_REFUSED'); }
}

const execute = promisify(execFile);
const wrapperPath = fileURLToPath(new URL('./drawing-cutover-recovery-local.ps1', import.meta.url));
const psLiteral = (value: string) => `'${value.replaceAll("'", "''")}'`;
async function windowsPrivate(path: string): Promise<void> {
  const command = `$ErrorActionPreference='Stop'; . ${psLiteral(wrapperPath)}; Assert-RecoveryPrivatePath ${psLiteral(path)}`;
  await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    windowsHide: true, timeout: 15_000, maxBuffer: 4096,
    env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: process.env.PATH, TEMP: process.env.TEMP },
  });
}
function safeAbsolute(path: string): string {
  requireCondition(isAbsolute(path) && !path.startsWith('\\\\') && !path.startsWith('//'), 'PRIVATE_PATH_REFUSED');
  const absolute = resolve(path);
  requireCondition(/^[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/.test(basename(absolute))
    && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(basename(absolute)) && !/[. ]$/.test(absolute), 'PRIVATE_PATH_REFUSED');
  return absolute;
}
async function ancestors(path: string): Promise<void> {
  let current = path;
  while (true) {
    const status = await lstat(current);
    requireCondition(!status.isSymbolicLink(), 'PRIVATE_LINK_REFUSED');
    const resolved = await realpath(current);
    requireCondition(process.platform === 'win32' ? resolved.toLowerCase() === current.toLowerCase() : resolved === current, 'PRIVATE_LINK_REFUSED');
    if (current === parse(current).root) break;
    current = dirname(current);
  }
}
function verifyPosix(status: Stats, directory: boolean): void {
  requireCondition(typeof process.getuid === 'function' && status.uid === process.getuid()
    && (status.mode & 0o777) === (directory ? 0o700 : 0o600), 'PRIVATE_PERMISSIONS_REQUIRED');
}
async function privateDirectory(path: string): Promise<Stats> {
  await ancestors(path); const status = await lstat(path);
  requireCondition(status.isDirectory(), 'PRIVATE_DIRECTORY_REQUIRED');
  if (process.platform === 'win32') await windowsPrivate(path); else verifyPosix(status, true);
  return status;
}
async function privateFile(path: string): Promise<Stats> {
  await privateDirectory(dirname(path)); await ancestors(path); const status = await lstat(path);
  requireCondition(status.isFile() && status.nlink === 1, 'PRIVATE_FILE_REQUIRED');
  if (process.platform === 'win32') await windowsPrivate(path); else verifyPosix(status, false);
  return status;
}
function sameFile(before: Stats, after: Stats): void {
  requireCondition(before.dev === after.dev && before.ino === after.ino && after.nlink === 1, 'PRIVATE_FILE_CHANGED');
}
/** Read a private regular file with a fixed allocation cap, including a concurrent-growth check. */
export async function readPrivateText(path: string, limit = PRIVATE_PAYLOAD_LIMIT): Promise<string> {
  let file: Awaited<ReturnType<typeof open>> | undefined;
  try {
    requireCondition(Number.isInteger(limit) && limit > 0 && limit <= RECOVERY_ENVELOPE_LIMIT, 'PRIVATE_FILE_SIZE');
    const absolute = safeAbsolute(path); const before = await privateFile(absolute);
    requireCondition(before.size <= limit, 'PRIVATE_FILE_SIZE');
    file = await open(absolute, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0)); sameFile(before, await file.stat());
    const bytes = Buffer.alloc(limit + 1); let offset = 0;
    try {
      while (offset < bytes.length) { const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, null); if (!bytesRead) break; offset += bytesRead; }
      requireCondition(offset <= limit, 'PRIVATE_FILE_SIZE'); sameFile(before, await privateFile(absolute));
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, offset));
    } finally { bytes.fill(0); }
  } catch { throw new Error('PRIVATE_FILE_REFUSED'); }
  finally { await file?.close(); }
}
export async function readPrivateJson(path: string): Promise<unknown> {
  try { return JSON.parse(await readPrivateText(path)); } catch { throw new Error('PRIVATE_FILE_REFUSED'); }
}
/** Create-new and atomic visibility. A completed checkpoint is never overwritten.
 * An interrupted publication can leave a private temporary file; never auto-adopt it. */
export async function writePrivateJson(path: string, value: unknown): Promise<void> {
  let temporary: string | undefined; let file: Awaited<ReturnType<typeof open>> | undefined;
  try {
    const raw = boundedJson(value); const absolute = safeAbsolute(path); const parent = dirname(absolute);
    const directory = await privateDirectory(parent);
    try { await lstat(absolute); throw new Error('PRIVATE_TARGET_EXISTS'); } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
    temporary = resolve(parent, `${basename(absolute)}.${randomBytes(12).toString('hex')}.tmp`);
    file = await open(temporary, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | (fsConstants.O_NOFOLLOW ?? 0), 0o600);
    const before = await privateFile(temporary); sameFile(before, await file.stat());
    await file.writeFile(raw, 'utf8'); await file.sync(); await file.close(); file = undefined;
    const after = await privateDirectory(parent);
    requireCondition(directory.ino === after.ino && directory.dev === after.dev, 'PRIVATE_DIRECTORY_CHANGED');
    sameFile(before, await privateFile(temporary));
    // link() is create-new, unlike rename() which overwrites an existing target.
    await link(temporary, absolute); await unlink(temporary); temporary = undefined;
    await privateFile(absolute);
  } catch { throw new Error('PRIVATE_WRITE_REFUSED'); }
  finally { await file?.close(); if (temporary) await unlink(temporary).catch(() => undefined); }
}
export function checkpointFilename(context: SetupContext, kind: 'intent' | 'result' | 'initial'): string {
  canonicalSetupContext(context); requireCondition(['intent', 'result', 'initial'].includes(kind), 'PRIVATE_CHECKPOINT_KIND');
  return `${context.runId}-${context.phase}-${context.workflowRunId}-${context.workflowRunAttempt}-${String(context.checkpointSequence).padStart(9, '0')}-${kind}.json`;
}
