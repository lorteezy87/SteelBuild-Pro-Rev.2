/**
 * Avatar helpers — initials and a stable color from a string seed.
 *
 * Used by the user list, project switcher, comment threads, etc. The
 * seed-based color picker means the same name always gets the same color
 * across the app without storing anything per user.
 */

const AVATAR_COLORS = [
  "#3F6FB5", // blue
  "#2F8F6A", // green
  "#D99A2B", // amber
  "#D2452F", // red
  "#0D9488", // teal
  "#CC4E17", // orange
  "#2C8C9E", // cyan
] as const;

/**
 * Two-letter initials from a name. "John Doe" → "JD"; "Madonna" → "M";
 * empty / nullish → "?". Unicode-safe — `parts[0][0]` indexes the first
 * code unit, which is acceptable for typed names but will misbehave on
 * surrogate-pair-leading first letters (rare).
 */
export function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "?";
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0][0].toUpperCase();
}

/**
 * Stable hex color for a string seed. Same seed → same color, every time.
 * Falls back to a neutral pick when the seed is empty.
 *
 * Seed is intentionally a plain string (not a user object): callers pass
 * `user.full_name || user.email` so the color follows the display name
 * rather than internal IDs that can change.
 */
export function getAvatarColor(seed: string | null | undefined): string {
  const str = seed || "";
  return AVATAR_COLORS[str.length % AVATAR_COLORS.length];
}
