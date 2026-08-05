/** Pure metadata payload for drawing-log import rows. */
export function logMeta(r: any) {
  return {
    drawing_log: {
      detailer: r.detailer || null,
      checker: r.checker || null,
      sheet_size: r.sheet_size || null,
      issued_date: r.issued_date || null,
      category: r.category || null,
      remark: r.remark || null,
      rev_remark: r.rev_remark || null,
      source: "drawing_log",
    },
  };
}

export const monoStyle = { fontFamily: "var(--font-mono)" } as const;
export const displayStyle = {
  fontFamily: "'Space Grotesk', var(--font-display)",
} as const;
export const ACCENT = "var(--accent, #3B82F6)";

