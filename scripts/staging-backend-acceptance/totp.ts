import { createHmac } from 'node:crypto';

/** RFC 6238 SHA-1, six digits; the enrollment secret stays only in memory. */
export function totp(secret: string, milliseconds = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const normalized = secret.toUpperCase().replace(/=+$/, '');
  if (!normalized || !/^[A-Z2-7]+$/.test(normalized)) throw new Error('Invalid TOTP secret');
  const bits = [...normalized].map(char => alphabet.indexOf(char).toString(2).padStart(5, '0')).join('');
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map(byte => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(milliseconds / 30_000)));
  const digest = createHmac('sha1', key).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
