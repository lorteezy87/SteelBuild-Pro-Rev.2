/**
 * `rgb(r, g, b)` / `rgba(r, g, b, a)` — the form getComputedStyle reports any
 * sRGB colour in — as the `#RRGGBB` string the Capacitor StatusBar plugin
 * accepts.
 *
 * Returns null for anything else (a keyword, a wide-gamut `color()` value) and
 * for a fully transparent colour, so the caller leaves the native status-bar
 * strip as it is rather than painting it a guess.
 */
export function cssColorToHex(value: string): string | null {
  const match = value
    .trim()
    .match(/^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*(?:[,/]\s*([\d.]+)%?\s*)?\)$/i)
  if (!match) return null
  const [, red, green, blue, alpha] = match
  if (alpha !== undefined && Number(alpha) === 0) return null
  const channels = [red, green, blue].map(Number)
  if (channels.some((channel) => channel > 255)) return null
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('').toUpperCase()}`
}
