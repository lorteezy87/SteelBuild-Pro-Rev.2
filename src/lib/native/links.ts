const STEELBUILD_WEB_ORIGIN = "https://steelbuild-pro.com";
const TRUSTED_STEELBUILD_HOSTS = new Set(["steelbuild-pro.com", "www.steelbuild-pro.com"]);

export function passwordResetRedirectUrl(origin: string, native: boolean): string {
  const base = native ? STEELBUILD_WEB_ORIGIN : origin.replace(/\/$/, "");
  return `${base}/update-password`;
}

export function trustedSteelBuildPath(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !TRUSTED_STEELBUILD_HOSTS.has(parsed.hostname.toLowerCase())) {
      return null;
    }
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return path && path !== "/" ? path : null;
  } catch {
    return null;
  }
}
