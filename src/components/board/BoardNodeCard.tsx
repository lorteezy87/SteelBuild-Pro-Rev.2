/**
 * BoardNodeCard — one node on the canvas.
 *
 * Positioned in world coordinates inside the transformed layer, so this
 * component never sees the viewport. Text is rendered read-only here; editing
 * happens in the inspector panel, which keeps a tap on a card unambiguous (it
 * selects) rather than depending on whether the tap landed on a text run.
 */

import { boardFill, boardStroke, boardText } from "@/lib/board/palette";
import type { Rect } from "@/lib/board/geometry";
import type { BoardNode } from "@/lib/board/types";

export interface BoardNodeCardProps {
  node: BoardNode;
  rect: Rect;
  selected: boolean;
  connectSource: boolean;
  /** Resolves a stored asset id to a displayable URL, or null when not on this device. */
  assetUrl: (assetId: string) => string | null;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>, node: BoardNode) => void;
  onResizePointerDown: (event: React.PointerEvent<HTMLDivElement>, node: BoardNode) => void;
}

const KIND_LABEL: Record<BoardNode["kind"], string> = {
  note: "Note",
  task: "Task",
  photo: "Photo",
  link: "Link",
  ink: "Markup",
};

export default function BoardNodeCard({
  node,
  rect,
  selected,
  connectSource,
  assetUrl,
  onPointerDown,
  onResizePointerDown,
}: BoardNodeCardProps) {
  const className = [
    "sbp-card",
    // Ink is drawn in the SVG layer underneath, so its card must not paint over
    // it — the card is only the strokes' selection and drag target.
    node.kind === "ink" ? "sbp-card--ink" : "",
    selected ? "sbp-card--selected" : "",
    connectSource ? "sbp-card--connect-source" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={className}
      data-testid={`board-node-${node.id}`}
      data-node-kind={node.kind}
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        background: node.kind === "ink" ? "transparent" : boardFill(node.color),
        borderLeftColor: boardStroke(node.color),
        color: boardText(node.color),
      }}
      onPointerDown={(event) => onPointerDown(event, node)}
    >
      <div className="sbp-card__kind">
        <span>{KIND_LABEL[node.kind]}</span>
        {node.anchor ? <span className="sbp-card__pill sbp-card__pill--pinned">pinned</span> : null}
      </div>

      {renderBody(node, assetUrl)}

      {selected ? (
        <div
          className="sbp-card__handle"
          data-testid={`board-resize-${node.id}`}
          onPointerDown={(event) => onResizePointerDown(event, node)}
        />
      ) : null}
    </div>
  );
}

function renderBody(node: BoardNode, assetUrl: (assetId: string) => string | null) {
  switch (node.kind) {
    case "note":
      return (
        <div className={`sbp-card__text${node.text ? "" : " sbp-card__text--empty"}`}>
          {node.text || "Empty note"}
        </div>
      );

    case "task":
      return (
        <>
          <div className={`sbp-card__text${node.text ? "" : " sbp-card__text--empty"}`}>
            {node.text || "Untitled task"}
          </div>
          <div className="sbp-card__meta">
            <span className="sbp-card__pill">{node.status}</span>
            {node.blocked ? (
              <span className="sbp-card__pill sbp-card__pill--blocked">blocked</span>
            ) : null}
            {node.owner ? <span className="sbp-card__pill">{node.owner}</span> : null}
            {/* An unscheduled task says so. Showing today's date, or nothing at
                all, would both read as if it were planned. */}
            <span>{node.start_date && node.end_date ? `${node.start_date} → ${node.end_date}` : "not scheduled"}</span>
          </div>
        </>
      );

    case "photo": {
      const url = assetUrl(node.asset_id);
      return (
        <>
          {url ? (
            <img className="sbp-card__img" src={url} alt={node.caption || "Board photo"} />
          ) : (
            // The photo lives in this device's store. On another device the card
            // still says what it is rather than showing a broken image.
            <div className="sbp-card__text sbp-card__text--empty">Photo not on this device</div>
          )}
          {node.caption ? <div className="sbp-card__meta">{node.caption}</div> : null}
        </>
      );
    }

    case "link":
      return (
        <>
          <div className={`sbp-card__text${node.title ? "" : " sbp-card__text--empty"}`}>
            {node.title || "Untitled link"}
          </div>
          <div className="sbp-card__link">{node.url}</div>
        </>
      );

    case "ink":
      // The strokes themselves are drawn in the SVG layer beneath, in world
      // space; nothing is painted here.
      return null;

    default:
      return null;
  }
}
