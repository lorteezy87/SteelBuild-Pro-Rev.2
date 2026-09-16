/**
 * InkLayer — handwriting, drawn in world space.
 *
 * Separate from the connector layer so a stroke is never obscured by a card, and
 * separate from the cards so the strokes scale with the board: ink is a mark
 * made *on the board* at a size, unlike a connector, whose thickness is a
 * property of the line rather than of the drawing.
 *
 * The in-progress stroke is passed in rather than read from the document. A
 * stroke is only committed when the pointer lifts — appending to the document on
 * every pointer move would put several hundred history frames behind one
 * scribble and write the board to storage at display refresh rate.
 */

import { strokePath } from "@/lib/board/ink";
import { boardStroke } from "@/lib/board/palette";
import { isInkNode, type BoardColor, type BoardDoc } from "@/lib/board/types";

export interface InkLayerProps {
  doc: BoardDoc;
  live: { points: number[]; width: number; color: BoardColor } | null;
}

export default function InkLayer({ doc, live }: InkLayerProps) {
  return (
    <svg className="sbp-canvas__svg" aria-hidden="true">
      {doc.nodes.filter(isInkNode).map((node) =>
        node.strokes.map((stroke, index) => (
          <path
            key={`${node.id}-${index}`}
            className="sbp-stroke"
            d={strokePath(stroke.points)}
            stroke={boardStroke(stroke.color)}
            strokeWidth={stroke.width}
          />
        )),
      )}
      {live && live.points.length >= 2 ? (
        <path
          className="sbp-stroke"
          data-testid="board-live-stroke"
          d={strokePath(live.points)}
          stroke={boardStroke(live.color)}
          strokeWidth={live.width}
        />
      ) : null}
    </svg>
  );
}
