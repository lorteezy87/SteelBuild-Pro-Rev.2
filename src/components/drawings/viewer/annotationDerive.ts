import { formatMeasureLabel } from "./measureLabel";
import {
  pdfRectToCanvas,
  pdfToCanvas,
  pointsToSvgAttr,
  simplifyStroke,
} from "./coords";
import type {
  AddableAnnotationItem,
  AnnotationDraft,
  AnnotationItem,
  AnnotationTool,
  MarkupStatus,
  PdfLine,
  PdfPoint,
  PdfRect,
  ViewportLike,
} from "./annotationTypes";

export const ARROW_HEAD_SIZE = 10;
export const NOTE_PIN_SIZE = 22;
export const ANNOTATION_NOTE_TEXT = "#111";
export const STAMP_W_PDF = 170;
export const STAMP_H_PDF = 44;

export const STAMP_TYPES = [
  { key: "APPROVED", label: "APPROVED", color: "var(--status-success)" },
  { key: "APPROVED_AS_NOTED", label: "APPROVED AS NOTED", color: "var(--status-success-bright)" },
  { key: "REVISE_RESUBMIT", label: "REVISE & RESUBMIT", color: "var(--status-warning)" },
  { key: "REJECTED", label: "REJECTED", color: "var(--status-error)" },
  { key: "FOR_REVIEW", label: "FOR REVIEW", color: "var(--status-info)" },
] as const;

export const STAMP_BY_KEY = Object.fromEntries(
  STAMP_TYPES.map((stamp) => [stamp.key, stamp]),
) as Record<string, (typeof STAMP_TYPES)[number]>;

export const MARKUP_STATUS_ORDER: MarkupStatus[] = [
  "open",
  "addressed",
  "rejected",
  "clarification",
];

export const MARKUP_STATUS_COLOR: Record<MarkupStatus, string> = {
  open: "#9ca3af",
  addressed: "#10b981",
  rejected: "#ef4444",
  clarification: "#f59e0b",
};

export const MARKUP_STATUS_LABEL: Record<MarkupStatus, string> = {
  open: "OPEN",
  addressed: "DONE",
  rejected: "NO",
  clarification: "?",
};

export function cloudPathFromRect(
  left: number,
  top: number,
  width: number,
  height: number,
  scallop = 9,
): string {
  const parts = [`M ${left.toFixed(2)} ${top.toFixed(2)}`];
  const edge = (x0: number, y0: number, x1: number, y1: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const count = Math.max(1, Math.round(len / (scallop * 2)));
    const stepX = (x1 - x0) / count;
    const stepY = (y1 - y0) / count;
    const radius = Math.hypot(stepX, stepY) / 2;
    for (let index = 1; index <= count; index += 1) {
      parts.push(
        `A ${radius.toFixed(2)} ${radius.toFixed(2)} 0 0 0 ${(x0 + stepX * index).toFixed(2)} ${(y0 + stepY * index).toFixed(2)}`,
      );
    }
  };
  edge(left, top, left + width, top);
  edge(left + width, top, left + width, top + height);
  edge(left + width, top + height, left, top + height);
  edge(left, top + height, left, top);
  parts.push("Z");
  return parts.join(" ");
}

export function authorTitle(item: AnnotationItem): string {
  const who = item.author || "Unknown";
  if (!item.created_at) return who;
  const when = new Date(item.created_at);
  return Number.isNaN(when.getTime()) ? who : `${who} · ${when.toLocaleString()}`;
}

export function nextMarkupStatus(current?: string): MarkupStatus {
  const index = MARKUP_STATUS_ORDER.indexOf((current || "open") as MarkupStatus);
  return MARKUP_STATUS_ORDER[(index + 1) % MARKUP_STATUS_ORDER.length];
}

export function cursorForAnnotationTool(tool?: AnnotationTool | null): string {
  if (["pen", "rect", "cloud", "highlight", "arrow", "measure", "calibrate"].includes(tool || "")) {
    return "crosshair";
  }
  if (tool === "note" || tool === "stamp") return "copy";
  return "default";
}

export function selectPageAnnotations(
  items: AnnotationItem[],
  pdfPage: number,
  hideResolved: boolean,
): AnnotationItem[] {
  return items.filter((item) => {
    if ((item.pdf_page || 1) !== pdfPage) return false;
    if (!hideResolved || item.kind !== "note") return true;
    return item.status !== "addressed" && item.status !== "rejected";
  });
}

export function rectFromDrag(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): PdfRect {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    w: Math.abs(x1 - x0),
    h: Math.abs(y1 - y0),
  };
}

export function createPlacedAnnotation(
  tool: "note" | "stamp",
  point: PdfPoint,
  options: {
    id: string;
    pdfPage: number;
    color: string;
    activeStamp: string;
    createdAt: string;
  },
): AddableAnnotationItem {
  if (tool === "note") {
    return {
      id: options.id,
      kind: "note",
      pdf_page: options.pdfPage,
      color: options.color,
      geom: point,
      text: "",
      created_at: options.createdAt,
    };
  }
  const stamp = STAMP_BY_KEY[options.activeStamp] || STAMP_TYPES[0];
  return {
    id: options.id,
    kind: "stamp",
    pdf_page: options.pdfPage,
    color: stamp.color,
    stamp: stamp.key,
    geom: {
      x: point.x - STAMP_W_PDF / 2,
      y: point.y - STAMP_H_PDF / 2,
      w: STAMP_W_PDF,
      h: STAMP_H_PDF,
    },
    created_at: options.createdAt,
  };
}

export function commitAnnotationDraft(
  draft: AnnotationDraft,
  options: { id: string; pdfPage: number; color: string; createdAt: string },
): AddableAnnotationItem | null {
  if (draft.kind === "pen") {
    const points = simplifyStroke(draft.points, 0.5) as PdfPoint[];
    if (points.length < 2) return null;
    return {
      id: options.id,
      kind: "pen",
      pdf_page: options.pdfPage,
      color: options.color,
      geom: { points },
      created_at: options.createdAt,
    };
  }

  if (draft.kind === "rect" || draft.kind === "cloud" || draft.kind === "highlight") {
    const geom = rectFromDrag(draft.x0, draft.y0, draft.x1, draft.y1);
    const minimum = draft.kind === "cloud" ? 4 : 2;
    if (geom.w <= minimum || geom.h <= minimum) return null;
    return {
      id: options.id,
      kind: draft.kind,
      pdf_page: options.pdfPage,
      color: options.color,
      geom,
      created_at: options.createdAt,
    };
  }

  if (draft.kind === "arrow") {
    const dx = draft.x1 - draft.x0;
    const dy = draft.y1 - draft.y0;
    if (dx * dx + dy * dy <= 4) return null;
    return {
      id: options.id,
      kind: "arrow",
      pdf_page: options.pdfPage,
      color: options.color,
      geom: { x1: draft.x0, y1: draft.y0, x2: draft.x1, y2: draft.y1 },
      created_at: options.createdAt,
    };
  }

  return null;
}

export function deriveLineView(
  viewport: ViewportLike,
  line: PdfLine,
): { x1: number; y1: number; x2: number; y2: number } {
  const [x1, y1] = pdfToCanvas(viewport, line.x1, line.y1);
  const [x2, y2] = pdfToCanvas(viewport, line.x2, line.y2);
  return { x1, y1, x2, y2 };
}

export function deriveMeasurementView(
  viewport: ViewportLike,
  line: PdfLine,
  scale: number | null,
) {
  const projected = deriveLineView(viewport, line);
  const distance = Math.hypot(line.x2 - line.x1, line.y2 - line.y1);
  return {
    ...projected,
    midX: (projected.x1 + projected.x2) / 2,
    midY: (projected.y1 + projected.y2) / 2,
    label: formatMeasureLabel(distance, scale),
  };
}

export function deriveRectView(viewport: ViewportLike, rect: PdfRect) {
  return pdfRectToCanvas(viewport, rect) as {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

export function deriveStampView(viewport: ViewportLike, item: RectMarkupLike) {
  const rect = deriveRectView(viewport, item.geom);
  const stamp = STAMP_BY_KEY[item.stamp || ""] || null;
  const color = stamp?.color || item.color || "#FF3D3D";
  const label = stamp?.label || item.stamp || "STAMP";
  const fontSize = Math.max(
    8,
    Math.min(rect.height * 0.34, rect.width / Math.max(6, label.length * 0.62)),
  );
  return { rect, color, label, fontSize };
}

interface RectMarkupLike {
  color?: string;
  stamp?: string;
  geom: PdfRect;
}

export function deriveNoteView(viewport: ViewportLike, item: NoteMarkupLike) {
  const [cx, cy] = pdfToCanvas(viewport, item.geom.x, item.geom.y);
  const status = item.status || "open";
  return {
    cx,
    cy,
    size: NOTE_PIN_SIZE,
    statusColor: MARKUP_STATUS_COLOR[status as MarkupStatus] || MARKUP_STATUS_COLOR.open,
    statusLabel: MARKUP_STATUS_LABEL[status as MarkupStatus] || status.toUpperCase(),
    statusTransform: `translate(${cx + NOTE_PIN_SIZE / 2 - 6}, ${cy - NOTE_PIN_SIZE / 2 - 12})`,
  };
}

interface NoteMarkupLike {
  status?: string;
  geom: PdfPoint;
}

export type AnnotationDraftView =
  | { kind: "pen"; points: string }
  | { kind: "rect"; rect: ReturnType<typeof deriveRectView> }
  | { kind: "highlight"; rect: ReturnType<typeof deriveRectView> }
  | { kind: "cloud"; path: string }
  | ({ kind: "arrow" } & ReturnType<typeof deriveLineView>)
  | ({ kind: "measure" | "calibrate"; stroke: string } & ReturnType<typeof deriveMeasurementView>);

export function deriveDraftView(
  draft: AnnotationDraft,
  viewport: ViewportLike,
  color: string,
  scale: number | null,
): AnnotationDraftView {
  if (draft.kind === "pen") {
    return {
      kind: "pen",
      points: pointsToSvgAttr(draft.points, viewport),
    };
  }
  if (draft.kind === "rect" || draft.kind === "highlight") {
    return {
      kind: draft.kind,
      rect: deriveRectView(
        viewport,
        rectFromDrag(draft.x0, draft.y0, draft.x1, draft.y1),
      ),
    };
  }
  if (draft.kind === "cloud") {
    const rect = deriveRectView(
      viewport,
      rectFromDrag(draft.x0, draft.y0, draft.x1, draft.y1),
    );
    return {
      kind: "cloud",
      path: cloudPathFromRect(rect.left, rect.top, rect.width, rect.height),
    };
  }
  if (draft.kind === "arrow") {
    return {
      kind: "arrow",
      ...deriveLineView(viewport, {
        x1: draft.x0,
        y1: draft.y0,
        x2: draft.x1,
        y2: draft.y1,
      }),
    };
  }
  const measurement = deriveMeasurementView(
    viewport,
    { x1: draft.x0, y1: draft.y0, x2: draft.x1, y2: draft.y1 },
    draft.kind === "calibrate" ? null : scale,
  );
  return {
    kind: draft.kind,
    ...measurement,
    label: draft.kind === "calibrate" ? `SET: ${measurement.label}` : measurement.label,
    stroke: draft.kind === "calibrate" ? "#00E5FF" : color,
  };
}
