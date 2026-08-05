/**
 * Pure RGB palette + status colors for generateTransmittal PDF.
 */

export const TRANSMITTAL_PDF_COLORS = {
  black: [15, 17, 24] as const,
  accent: [0, 175, 215] as const,
  muted: [100, 110, 130] as const,
  border: [210, 215, 225] as const,
  rowEven: [245, 247, 250] as const,
  rowOdd: [255, 255, 255] as const,
  errorFill: [254, 242, 242] as const,
  warnFill: [255, 251, 235] as const,
  successFill: [240, 253, 244] as const,
  white: [255, 255, 255] as const,
};

export const TRANSMITTAL_STATUS_COLOR: Record<string, readonly [number, number, number]> = {
  Approved: [22, 163, 74],
  "Approved as Noted": [22, 163, 74],
  "Under Review": [37, 99, 235],
  "Revise & Resubmit": [202, 138, 4],
  Rejected: [220, 38, 38],
  Draft: [100, 116, 139],
};
