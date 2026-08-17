/**
 * Vercel's Vite integration does not append deployment IDs automatically.
 * When project-level Skew Protection is enabled, pin every emitted asset URL
 * to the deployment that built the HTML so an older open tab can still load
 * its matching lazy chunks after a new production promotion.
 */
export function vercelSkewAssetUrl(filename, env = process.env) {
  const enabled = env.VERCEL_SKEW_PROTECTION_ENABLED === "1";
  const deploymentId = String(env.VERCEL_DEPLOYMENT_ID || "").trim();
  if (!enabled || !deploymentId) return null;
  const separator = String(filename).includes("?") ? "&" : "?";
  return `/${filename}${separator}dpl=${encodeURIComponent(deploymentId)}`;
}
