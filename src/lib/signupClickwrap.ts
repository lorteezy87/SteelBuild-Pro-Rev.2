/**
 * H12 clickwrap gate — shared so Landing UI and AuthContext agree on when
 * Terms/Privacy acceptance metadata may be minted.
 */
export function assertTermsAccepted(termsAccepted?: boolean): void {
  if (termsAccepted !== true) {
    throw new Error("Please accept the Terms of Service and Privacy Policy to create an account.");
  }
}

export const TERMS_VERSION = "2026-07-01";
