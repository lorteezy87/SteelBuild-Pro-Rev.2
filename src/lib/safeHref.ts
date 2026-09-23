/**
 * safeHref — gate a stored, user-supplied URL before it becomes an `href`.
 *
 * React warns about `javascript:` URLs but still renders them, so a link a
 * member typed into a record (a Drive folder, a photo URL) would run script
 * in a colleague's session when clicked. Only absolute http(s), mailto and tel
 * links pass; anything else — other schemes, relative paths, junk — returns
 * undefined, which renders a non-navigating anchor.
 *
 * Parsing uses the WHATWG URL parser, the same one the browser applies to the
 * anchor, so tricks like "java\tscript:" or leading whitespace resolve to the
 * scheme the browser would actually run and are rejected.
 *
 * Private storage paths are not links: resolve them with `resolveFileUrl`.
 */
const SAFE_PROTOCOLS: ReadonlySet<string> = new Set(["http:", "https:", "mailto:", "tel:"]);

export function safeHref(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return undefined;
  }
  return SAFE_PROTOCOLS.has(parsed.protocol) ? parsed.href : undefined;
}
