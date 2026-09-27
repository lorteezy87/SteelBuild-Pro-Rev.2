const PRODUCTION_WEB_ORIGIN = "https://steelbuild-pro.com";

/**
 * Supabase recovery emails must land on an allowlisted HTTP(S) origin. A
 * Capacitor webview reports `capacitor://localhost`, which email clients cannot
 * use to complete this app's current web-based recovery flow.
 */
export function passwordResetRedirect(
  currentOrigin: string | undefined,
  native: boolean,
): string | undefined {
  const origin = native ? PRODUCTION_WEB_ORIGIN : currentOrigin;
  return origin ? `${origin.replace(/\/$/, "")}/update-password` : undefined;
}
