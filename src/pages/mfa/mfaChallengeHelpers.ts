/** Pure helpers for MfaChallenge page. */

export function normalizeMfaCode(code: string): string {
  return (code || "").replace(/\s/g, "");
}

export function isMfaCodeReady(code: string, minLength = 6): boolean {
  return normalizeMfaCode(code).length >= minLength;
}
