export type AnnotationTool =
  | "select"
  | "pen"
  | "rect"
  | "cloud"
  | "highlight"
  | "arrow"
  | "measure"
  | "calibrate"
  | "note"
  | "stamp";

export type MarkupStatus = "open" | "addressed" | "rejected" | "clarification";

export interface PdfPoint {
  x: number;
  y: number;
}

export interface PdfRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PdfLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ViewportLike {
  convertToViewportPoint(x: number, y: number): [number, number];
  convertToPdfPoint(x: number, y: number): [number, number];
}

interface MarkupBase {
  id: string;
  pdf_page?: number;
  color?: string;
  created_at?: string;
  author?: string | null;
  status?: MarkupStatus | string;
  text?: string;
  stamp?: string;
}

export interface PenMarkup extends MarkupBase {
  kind: "pen";
  geom: { points: PdfPoint[] };
}

export interface RectangleMarkup extends MarkupBase {
  kind: "rect";
  geom: PdfRect;
}

export interface CloudMarkup extends MarkupBase {
  kind: "cloud";
  geom: PdfRect;
}

export interface HighlightMarkup extends MarkupBase {
  kind: "highlight";
  geom: PdfRect;
}

export interface StampMarkup extends MarkupBase {
  kind: "stamp";
  geom: PdfRect;
}

export interface ArrowMarkup extends MarkupBase {
  kind: "arrow";
  geom: PdfLine;
}

export interface MeasureMarkup extends MarkupBase {
  kind: "measure";
  geom: PdfLine;
}

export interface NoteMarkup extends MarkupBase {
  kind: "note";
  geom: PdfPoint;
}

export type AnnotationItem =
  | PenMarkup
  | RectangleMarkup
  | CloudMarkup
  | HighlightMarkup
  | StampMarkup
  | ArrowMarkup
  | MeasureMarkup
  | NoteMarkup;

export type DragDraft = {
  kind: "rect" | "cloud" | "highlight" | "arrow";
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export type MeasurementDraft = {
  kind: "measure" | "calibrate";
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  tracking: true;
};

export type AnnotationDraft =
  | { kind: "pen"; points: PdfPoint[] }
  | DragDraft
  | MeasurementDraft;

export type AddableAnnotationItem = AnnotationItem & { created_at: string };

export interface AnnotationInteractionCallbacks {
  onAddItem(item: AddableAnnotationItem): void;
  onRemoveItem(id: string): void;
  onCalibrate?(pdfInches: number): void;
}
