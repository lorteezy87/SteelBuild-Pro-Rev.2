const DEFAULT_STEELBUILD_MAIN_APP_URL = "https://steelbuild-pro.com";

/**
 * Resolves the separately deployed Planner back to the main SteelBuild app.
 * Deployment configuration may include a trailing slash; route construction
 * always receives an origin/base without one.
 */
export function normalizeSteelBuildMainAppUrl(value: string | undefined): string {
  const configuredUrl = value?.trim();
  if (!configuredUrl) return DEFAULT_STEELBUILD_MAIN_APP_URL;

  try {
    const parsedUrl = new URL(configuredUrl);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return DEFAULT_STEELBUILD_MAIN_APP_URL;
    }
    return parsedUrl.origin;
  } catch {
    return DEFAULT_STEELBUILD_MAIN_APP_URL;
  }
}

export function getSteelBuildMainAppUrl(
  configuredUrl: string | undefined = import.meta.env.VITE_STEELBUILD_APP_URL,
): string {
  return normalizeSteelBuildMainAppUrl(configuredUrl);
}

export function getSteelBuildOnboardingUrl(): string {
  return `${getSteelBuildMainAppUrl()}/Onboarding`;
}
