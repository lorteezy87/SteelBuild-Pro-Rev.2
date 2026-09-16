/**
 * ConnectorLayer — the connectors, drawn in world space.
 *
 * Rendered inside the canvas's transformed layer, so the browser scales the
 * whole SVG with the board and nothing here has to know the zoom. The one
 * exception is stroke width: a line scaled with the board vanishes when zoomed
 * out and turns into a ribbon when zoomed in, so widths are divided by the scale
 * to hold a constant on-screen thickness.
 */

import { Fragment } from "react";
import {
  arrowHeadPoints,
  connectorPath,
  draftConnectorPath,
  edgeDash,
  edgeKindLabel,
} from "@/lib/board/connectors";
import { resolveNodeRect, type BoardAction } from "@/lib/board/document";
import { boardStroke } from "@/lib/board/palette";
import type { Rect, Vec2 } from "@/lib/board/geometry";
import type { BoardDoc } from "@/lib/board/types";

export interface ConnectorLayerProps {
  doc: BoardDoc;
  scale: number;
  selectedEdgeId: string | null;
  onSelectEdge: (edgeId: string | null) => void;
  /** Rubber band while a connector is being drawn, or null. */
  draft: { fromRect: Rect; to: Vec2 } | null;
  dispatch: (action: BoardAction, options?: { key?: string; label?: string }) => void;
}

export default function ConnectorLayer({
  doc,
  scale,
  selectedEdgeId,
  onSelectEdge,
  draft,
}: ConnectorLayerProps) {
  const rectFor = new Map(doc.nodes.map((node) => [node.id, resolveNodeRect(doc, node)]));
  // Held constant on screen. Guarded against a zero scale, which would divide to
  // Infinity and make every connector disappear.
  const px = (n: number) => n / (scale || 1);

  return (
    <svg className="sbp-canvas__svg" aria-hidden="true">
      {doc.edges.map((edge) => {
        const from = rectFor.get(edge.from_node_id);
        const to = rectFor.get(edge.to_node_id);
        // A connector whose endpoints are gone is not drawn. The reducer deletes
        // these with their nodes; this guards the frame between a remote change
        // and the next reconcile.
        if (!from || !to) return null;
        const path = connectorPath(from, to);
        const stroke = boardStroke(edge.color);
        const dash = edgeDash(edge.kind);
        const selected = edge.id === selectedEdgeId;
        const label = edge.label.trim() || edgeKindLabel(edge.kind);
        return (
          <Fragment key={edge.id}>
            {/* A fat transparent copy underneath: a 2px line is impossible to
                hit with a fingertip, and widening the visible stroke to suit
                touch would make the board unreadable. */}
            <path
              className="sbp-edge sbp-edge--hit"
              d={path.d}
              strokeWidth={px(24)}
              style={{ pointerEvents: "stroke" }}
              onPointerDown={(event) => {
                event.stopPropagation();
                onSelectEdge(edge.id);
              }}
            />
            <path
              className="sbp-edge"
              d={path.d}
              stroke={stroke}
              strokeWidth={px(selected ? 4 : 2)}
              strokeDasharray={dash ? dash.split(" ").map((n) => px(Number(n))).join(" ") : undefined}
            />
            <polygon points={arrowHeadPoints(path.end, path.direction, px(12))} fill={stroke} />
            <text
              className="sbp-edge__label"
              x={path.label.x}
              y={path.label.y - px(6)}
              textAnchor="middle"
              fill={stroke}
              style={{ fontSize: px(11), strokeWidth: px(4) }}
            >
              {label}
            </text>
          </Fragment>
        );
      })}

      {draft ? (
        <path
          className="sbp-edge"
          d={draftConnectorPath(draft.fromRect, draft.to).d}
          stroke="var(--cmd-info)"
          strokeWidth={px(2)}
          strokeDasharray={`${px(6)} ${px(6)}`}
        />
      ) : null}
    </svg>
  );
}
