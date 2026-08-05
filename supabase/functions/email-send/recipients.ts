// Pure recipient validation for email-send. This module deliberately avoids
// Deno-specific imports so the boundary behavior can be exercised by Vitest.

// Pragmatic address check: one local part, one "@", and a dotted domain.
// This is intentionally not a complete RFC 5322 parser; it rejects blanks and
// obvious malformed input before it reaches Resend or Microsoft Graph.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface NormalizedRecipients {
  /** Trimmed, well-formed addresses; first occurrence and casing are retained. */
  valid: string[];
  /** Non-blank entries that are not valid email addresses. */
  invalid: string[];
}

export function isValidEmail(address: unknown): boolean {
  return typeof address === "string" && EMAIL_RE.test(address.trim());
}

/**
 * Trim entries, drop blanks, and de-duplicate case-insensitively while
 * preserving the original order and casing of the first occurrence.
 */
export function normalizeRecipients(list: unknown): NormalizedRecipients {
  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  if (!Array.isArray(list)) return { valid, invalid };

  for (const raw of list) {
    const address = (typeof raw === "string" ? raw : String(raw ?? "")).trim();
    if (!address) continue;

    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    if (isValidEmail(address)) valid.push(address);
    else invalid.push(address);
  }

  return { valid, invalid };
}
