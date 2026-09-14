import { describe, expect, it } from "vitest";
import {
  commitAnnotationDraft,
  createPlacedAnnotation,
  deriveDraftView,
  deriveMeasurementView,
  deriveNoteView,
  deriveStampView,
  nextMarkupStatus,
  rectFromDrag,
  selectPageAnnotations,
} from "../annotationDerive";
import type { AnnotationItem, ViewportLike } from "../annotationTypes";

const viewport: ViewportLike = {
  convertToViewportPoint: (x, y) => [y * 2 + 5, x * 3 + 7],
  convertToPdfPoint: (x, y) => [(y - 7) / 3, (x - 5) / 2],
};

const createdAt = "2026-09-12T20:00:00.000Z";
const commitOptions = {
  id: "markup-1",
  pdfPage: 3,
  color: "#ef4444",
  createdAt,
};

describe("annotation item derivation", () => {
  it("keeps page ordering and only hides resolved notes", () => {
    const items: AnnotationItem[] = [
      {
        id: "resolved-note",
        kind: "note",
        pdf_page: 3,
        status: "addressed",
        geom: { x: 1, y: 2 },
      },
      {
        id: "resolved-rect",
        kind: "rect",
        pdf_page: 3,
        status: "rejected",
        geom: { x: 1, y: 2, w: 3, h: 4 },
      },
      {
        id: "open-note",
        kind: "note",
        pdf_page: 3,
        geom: { x: 5, y: 6 },
      },
      {
        id: "other-page",
        kind: "note",
        pdf_page: 2,
        geom: { x: 7, y: 8 },
      },
    ];

    expect(selectPageAnnotations(items, 3, true).map((item) => item.id))
      .toEqual(["resolved-rect", "open-note"]);
    expect(selectPageAnnotations(items, 3, false).map((item) => item.id))
      .toEqual(["resolved-note", "resolved-rect", "open-note"]);
  });

  it("normalizes reverse drags without changing dimensions", () => {
    expect(rectFromDrag(40, 60, 10, 20)).toEqual({
      x: 10,
      y: 20,
      w: 30,
      h: 40,
    });
  });

  it("cycles known and unknown note statuses exactly", () => {
    expect(nextMarkupStatus()).toBe("addressed");
    expect(nextMarkupStatus("addressed")).toBe("rejected");
    expect(nextMarkupStatus("rejected")).toBe("clarification");
    expect(nextMarkupStatus("clarification")).toBe("open");
    expect(nextMarkupStatus("legacy")).toBe("open");
  });
});

describe("annotation draft commits", () => {
  it("preserves strict rectangle and cloud hit thresholds", () => {
    expect(commitAnnotationDraft(
      { kind: "rect", x0: 0, y0: 0, x1: 2, y1: 3 },
      commitOptions,
    )).toBeNull();
    expect(commitAnnotationDraft(
      { kind: "cloud", x0: 0, y0: 0, x1: 5, y1: 4 },
      commitOptions,
    )).toBeNull();

    expect(commitAnnotationDraft(
      { kind: "cloud", x0: 5, y0: 7, x1: 0, y1: 2 },
      commitOptions,
    )).toMatchObject({
      kind: "cloud",
      geom: { x: 0, y: 2, w: 5, h: 5 },
    });
  });

  it("preserves the squared arrow threshold and endpoint order", () => {
    expect(commitAnnotationDraft(
      { kind: "arrow", x0: 2, y0: 4, x1: 4, y1: 4 },
      commitOptions,
    )).toBeNull();
    expect(commitAnnotationDraft(
      { kind: "arrow", x0: 4, y0: 5, x1: 1, y1: 5 },
      commitOptions,
    )).toMatchObject({
      kind: "arrow",
      geom: { x1: 4, y1: 5, x2: 1, y2: 5 },
    });
  });

  it("simplifies pen points with the existing half-point tolerance", () => {
    const item = commitAnnotationDraft({
      kind: "pen",
      points: [
        { x: 0, y: 0 },
        { x: 0.1, y: 0.1 },
        { x: 1, y: 1 },
      ],
    }, commitOptions);

    expect(item).toMatchObject({
      kind: "pen",
      geom: {
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
      },
    });
  });
});

describe("annotation view models", () => {
  it("projects measurement endpoints before deriving the label midpoint", () => {
    const view = deriveMeasurementView(
      viewport,
      { x1: 0, y1: 0, x2: 72, y2: 0 },
      12,
    );

    expect(view).toEqual({
      x1: 5,
      y1: 7,
      x2: 5,
      y2: 223,
      midX: 5,
      midY: 115,
      label: `1'-0"`,
    });
  });

  it("uses raw page inches and cyan only for calibration previews", () => {
    const calibration = deriveDraftView({
      kind: "calibrate",
      x0: 0,
      y0: 0,
      x1: 72,
      y1: 0,
      tracking: true,
    }, viewport, "#ef4444", 96);
    const measurement = deriveDraftView({
      kind: "measure",
      x0: 0,
      y0: 0,
      x1: 72,
      y1: 0,
      tracking: true,
    }, viewport, "#ef4444", 96);

    expect(calibration).toMatchObject({
      kind: "calibrate",
      label: 'SET: ~1.0"',
      stroke: "#00E5FF",
    });
    expect(measurement).toMatchObject({
      kind: "measure",
      label: `8'-0"`,
      stroke: "#ef4444",
    });
  });

  it("derives stamp sizing and note status-handle placement", () => {
    const stamp = createPlacedAnnotation("stamp", { x: 100, y: 50 }, {
      id: "stamp-1",
      pdfPage: 1,
      color: "#000000",
      activeStamp: "REJECTED",
      createdAt,
    });
    if (stamp.kind !== "stamp") throw new Error("Expected a stamp");

    expect(stamp.geom).toEqual({ x: 15, y: 28, w: 170, h: 44 });
    expect(deriveStampView(viewport, stamp)).toMatchObject({
      color: "var(--status-error)",
      label: "REJECTED",
    });
    expect(deriveNoteView(viewport, {
      geom: { x: 10, y: 20 },
      status: "addressed",
    })).toMatchObject({
      cx: 45,
      cy: 37,
      statusColor: "#10b981",
      statusLabel: "DONE",
      statusTransform: "translate(50, 14)",
    });
  });
});
