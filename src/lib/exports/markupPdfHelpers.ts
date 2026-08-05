/**
 * Pure RGB palette + markup status colors for markupPDF export.
 */

export const MARKUP_PDF_COLORS = {
  black: [15, 17, 24] as const,
  accent: [200, 155, 32] as const,
  muted: [100, 110, 130] as const,
  border: [210, 215, 225] as const,
  rowEven: [245, 247, 250] as const,
  rowOdd: [255, 255, 255] as const,
  white: [255, 255, 255] as const,
};

export const MARKUP_STATUS_COLOR: Record<string, readonly [number, number, number]> = {
  open: [202, 138, 4],
  addressed: [22, 163, 74],
  rejected: [220, 38, 38],
};
