// recipients.ts — pure helpers for validating + normalizing outbound email
// recipient lists. Deliberately free of Deno-specific imports so the logic
// can be unit-tested directly under Vitest (see src/__tests__/emailRecipients.test.ts),
// the same pattern used for the llm-proxy router/cost modules.

// Pragmatic address check: one local part, one "@", and a dotted domain.
// Not full RFC 5322 — just enough to reject blanks / obvious garbage at the
// boundary before we hand the list to Resend / Microsoft Graph.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(addr: unknown): boolean {
  return typeof addr === "string" && EMAIL_RE.test(addr.trim());
}

export interface NormalizedRecipients {
  /** Well-formed addresses, trimmed + de-duplicated (first casing wins). */
  valid: string[];
  /** Non-blank entries that are not valid email addresses. */
  invalid: string[];
}

/**
 * Trim entries, drop blanks, de-duplicate case-insensitively (preserving the
 * original order + casing of the first occurrence), and split the result into
 * valid vs invalid addresses. Non-array input yields empty lists.
 */
export function normalizeRecipients(list: unknown): NormalizedRecipients {
  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  if (!Array.isArray(list)) return { valid, invalid };

  for (const raw of list) {
    const addr = (typeof raw === "string" ? raw : String(raw ?? "")).trim();
    if (!addr) continue; // blanks are noise, not errors
    const key = addr.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (isValidEmail(addr)) valid.push(addr);
    else invalid.push(addr);
  }

  return { valid, invalid };
}
