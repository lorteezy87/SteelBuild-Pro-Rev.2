/** Pure helpers for Tutorial page (TOC + search filter). */

export function slugify(s: string | null | undefined): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export type TocEntry = { depth: number; text: string; id: string };

/** Pull H2/H3 titles out of markdown for the left-rail TOC. */
export function buildToc(md: string): TocEntry[] {
  const out: TocEntry[] = [];
  const re = /^(#{2,3})\s+(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md || "")) !== null) {
    const depth = m[1].length;
    const text = m[2].trim();
    out.push({ depth, text, id: slugify(text) });
  }
  return out;
}

/**
 * Filter markdown by search: split on H2 boundaries, keep preamble + matching chunks.
 * Empty query returns the original source.
 */
export function filterMarkdownBySearch(source: string, search: string): string {
  const q = (search || "").trim().toLowerCase();
  if (!q) return source || "";
  const parts = (source || "").split(/^(?=## )/m);
  const kept = parts.filter((p, i) => {
    if (i === 0) return true;
    return p.toLowerCase().includes(q);
  });
  return kept.join("");
}
