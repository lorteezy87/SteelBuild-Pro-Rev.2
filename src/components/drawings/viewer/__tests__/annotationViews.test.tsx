import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AnnotationLayer from "../AnnotationLayer";
import { AnnotationItemView } from "../AnnotationViews";
import type { AnnotationItem, ViewportLike } from "../annotationTypes";

const viewport: ViewportLike = {
  convertToViewportPoint: (x, y) => [x, y],
  convertToPdfPoint: (x, y) => [x, y],
};

const noop = () => {};

describe("annotation rendering characterization", () => {
  it("keeps defs first and persisted annotations in source order", () => {
    const items: AnnotationItem[] = [
      {
        id: "first-pen",
        kind: "pen",
        geom: { points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] },
        author: "First author",
      },
      {
        id: "second-arrow",
        kind: "arrow",
        geom: { x1: 5, y1: 6, x2: 7, y2: 8 },
        author: "Second author",
      },
    ];

    const markup = renderToStaticMarkup(
      <AnnotationLayer
        viewport={viewport}
        canvasWidth={400}
        canvasHeight={300}
        pdfPage={1}
        items={items}
        activeTool="select"
        activeColor="#ef4444"
        markupScale={null}
        onAddItem={noop}
        onRemoveItem={noop}
        onUpdateItem={noop}
        onCalibrate={noop}
      />,
    );

    expect(markup.indexOf("<defs>")).toBeLessThan(markup.indexOf("First author"));
    expect(markup.indexOf("First author")).toBeLessThan(markup.indexOf("Second author"));
    expect(markup).toContain('viewBox="0 0 400 300"');
    expect(markup).toContain('marker-end="url(#sbp-arrowhead)"');
  });

  it("preserves the note editor accessibility contract", () => {
    const note: AnnotationItem = {
      id: "note-42",
      kind: "note",
      text: "Field verify",
      geom: { x: 10, y: 20 },
    };
    const markup = renderToStaticMarkup(
      <svg>
        <AnnotationItemView
          item={note}
          viewport={viewport}
          markupScale={null}
          selected
          editing
          interactive
          onSelect={noop}
          onNoteDoubleClick={noop}
          onNoteTextChange={noop}
          onNoteBlur={noop}
          onCycleStatus={noop}
        />
      </svg>,
    );

    expect(markup).toContain('id="sbp-note-note-42"');
    expect(markup).toContain('name="sbp-note-note-42"');
    expect(markup).toContain('aria-label="Markup note"');
    expect(markup).toContain("Field verify");
  });
});
