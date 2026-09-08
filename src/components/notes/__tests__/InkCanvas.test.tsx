// @vitest-environment jsdom
/**
 * Component-level guards for the Apple Pencil path.
 *
 * These cover the failure modes that are effectively impossible to catch by
 * hand: they need a second pointer to arrive mid-stroke, at a specific moment,
 * with a specific pointerId. jsdom returns null from getContext("2d"), so no
 * pixels are produced — the point here is the pointer state machine, which is
 * where the bugs were.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { InkCanvas } from "@/components/notes/InkCanvas";
import { emptyInk } from "@/lib/notesInk/engine";
import type { InkDocument } from "@/lib/notesInk/types";

function setup(overrides: Partial<React.ComponentProps<typeof InkCanvas>> = {}) {
  const onChange = vi.fn();
  const onStrokeCommit = vi.fn();
  const doc: InkDocument = emptyInk("plain");
  const utils = render(
    <InkCanvas
      doc={doc}
      onChange={onChange}
      tool="pen"
      color="#111111"
      size={3}
      mode="ink"
      acceptEvent={overrides.acceptEvent ?? (() => true)}
      onStrokeCommit={onStrokeCommit}
      {...overrides}
    />,
  );
  const canvas = utils.getByLabelText("Ink canvas");
  return { canvas, onChange, onStrokeCommit };
}

const pen = (pointerId: number, x: number, y: number) => ({
  pointerId,
  pointerType: "pen",
  clientX: x,
  clientY: y,
  pressure: 0.6,
  buttons: 1,
  width: 1,
  height: 1,
});

const touch = (pointerId: number, x: number, y: number) => ({
  pointerId,
  pointerType: "touch",
  clientX: x,
  clientY: y,
  pressure: 0.5,
  buttons: 1,
  width: 40,
  height: 45,
});

describe("InkCanvas — pointer isolation", () => {
  it("ignores a palm that lands mid-stroke instead of hijacking the pen stroke", () => {
    const { canvas, onChange, onStrokeCommit } = setup();

    fireEvent.pointerDown(canvas, pen(1, 10, 10));
    fireEvent.pointerMove(canvas, pen(1, 30, 30));

    // Palm arrives while the pen is still down.
    fireEvent.pointerDown(canvas, touch(2, 200, 200));
    fireEvent.pointerMove(canvas, touch(2, 260, 260));
    // ...and lifts. This must NOT end the pen's stroke.
    fireEvent.pointerUp(canvas, touch(2, 260, 260));

    expect(onStrokeCommit).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();

    // The pen finishes and commits exactly one stroke.
    fireEvent.pointerMove(canvas, pen(1, 50, 50));
    fireEvent.pointerUp(canvas, pen(1, 50, 50));

    expect(onStrokeCommit).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    const committed = onChange.mock.calls[0][0] as InkDocument;
    expect(committed.strokes).toHaveLength(1);
    // Every point came from the pen, none from the palm at (200,200)+.
    for (const p of committed.strokes[0].points) {
      expect(p.x).toBeLessThan(100);
      expect(p.y).toBeLessThan(100);
    }
  });

  it("does not start a stroke when acceptEvent rejects the pointer", () => {
    const { canvas, onChange, onStrokeCommit } = setup({
      acceptEvent: (e) => e.pointerType !== "touch",
    });

    fireEvent.pointerDown(canvas, touch(9, 10, 10));
    fireEvent.pointerMove(canvas, touch(9, 40, 40));
    fireEvent.pointerUp(canvas, touch(9, 40, 40));

    expect(onChange).not.toHaveBeenCalled();
    expect(onStrokeCommit).not.toHaveBeenCalled();
  });

  it("commits nothing in text mode", () => {
    const { canvas, onChange } = setup({ mode: "text" });
    fireEvent.pointerDown(canvas, pen(1, 10, 10));
    fireEvent.pointerUp(canvas, pen(1, 10, 10));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("a stray pointerup from another pointer cannot end the active stroke", () => {
    const { canvas, onStrokeCommit } = setup();
    fireEvent.pointerDown(canvas, pen(1, 10, 10));
    fireEvent.pointerUp(canvas, touch(7, 10, 10));
    expect(onStrokeCommit).not.toHaveBeenCalled();
    fireEvent.pointerUp(canvas, pen(1, 12, 12));
    expect(onStrokeCommit).toHaveBeenCalledTimes(1);
  });

  // Read `style.touchAction` directly rather than via toHaveStyle: jsdom keeps
  // the value on the CSSStyleDeclaration but does not serialise it into the
  // style attribute, which is what toHaveStyle parses.
  it("lets a finger scroll the page when palm rejection is on", () => {
    const { canvas } = setup({ allowTouchScroll: true });
    expect((canvas as HTMLCanvasElement).style.touchAction).toBe("pan-y");
  });

  it("captures all touch when palm rejection is off, so fingers can draw", () => {
    const { canvas } = setup({ allowTouchScroll: false });
    expect((canvas as HTMLCanvasElement).style.touchAction).toBe("none");
  });

  it("reports the pencil so the page can learn the device is pen-capable", () => {
    const onPenSeen = vi.fn();
    const { canvas } = setup({ onPenSeen });
    fireEvent.pointerDown(canvas, pen(1, 10, 10));
    expect(onPenSeen).toHaveBeenCalled();
  });
});

describe("InkCanvas — eraser", () => {
  it("erases progressively during the drag rather than only on lift", () => {
    const onChange = vi.fn();
    const doc: InkDocument = {
      ...emptyInk("plain"),
      strokes: [
        {
          id: "s1",
          tool: "pen",
          color: "#111",
          size: 3,
          points: [{ x: 30, y: 30, p: 0.5, t: 0 }],
        },
      ],
    };
    const { getByLabelText } = render(
      <InkCanvas
        doc={doc}
        onChange={onChange}
        tool="eraser"
        color="#111111"
        size={3}
        mode="ink"
        acceptEvent={() => true}
      />,
    );
    const canvas = getByLabelText("Ink canvas");

    fireEvent.pointerDown(canvas, pen(1, 10, 10));
    fireEvent.pointerMove(canvas, pen(1, 30, 30)); // crosses the stroke

    // Erased mid-drag, before any pointerup.
    expect(onChange).toHaveBeenCalled();
    expect((onChange.mock.calls[0][0] as InkDocument).strokes).toHaveLength(0);
  });

  it("never commits the eraser gesture itself as ink", () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <InkCanvas
        doc={emptyInk("plain")}
        onChange={onChange}
        tool="eraser"
        color="#111111"
        size={3}
        mode="ink"
        acceptEvent={() => true}
      />,
    );
    const canvas = getByLabelText("Ink canvas");
    fireEvent.pointerDown(canvas, pen(1, 10, 10));
    fireEvent.pointerMove(canvas, pen(1, 60, 60));
    fireEvent.pointerUp(canvas, pen(1, 60, 60));
    // Nothing to erase and no ink added — the gesture leaves no stroke behind.
    for (const call of onChange.mock.calls) {
      expect((call[0] as InkDocument).strokes).toHaveLength(0);
    }
  });
});
