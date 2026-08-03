/**
 * Shared work-package title formatting for operator-facing labels.
 *
 * Prefer "WP-004 - ladder" when both number and description/name exist.
 */

export type WorkPackageTitleSource = {
  wp_number?: string | null;
  name?: string | null;
  title?: string | null;
  description?: string | null;
  package_name?: string | null;
} | null | undefined;

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Description / name half of a WP title (not the WP number). */
export function getWorkPackageDescription(
  wp: WorkPackageTitleSource,
): string {
  if (!wp) return "";
  return (
    trimText(wp.name) ||
    trimText(wp.title) ||
    trimText(wp.description) ||
    trimText(wp.package_name)
  );
}

/**
 * Operator-facing WP title.
 * Examples: "WP-004 - ladder", "WP-004", "ladder", "Unnamed package".
 */
export function formatWorkPackageTitle(
  wp: WorkPackageTitleSource,
  fallback = "Unnamed package",
): string {
  if (!wp) return fallback;
  const number = trimText(wp.wp_number);
  const description = getWorkPackageDescription(wp);
  if (number && description && description !== number) {
    return `${number} - ${description}`;
  }
  return number || description || fallback;
}
