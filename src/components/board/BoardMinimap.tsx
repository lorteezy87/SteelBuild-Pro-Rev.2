/**
 * BoardMinimap — where you are on the board, and the saved places you go back to.
 *
 * The map is fitted to the board's own content bounds rather than a fixed
 * extent, because the board is infinite: a fixed extent either clips the work or
 * renders it as a speck. An empty board draws nothing and says so, rather than
 * showing an empty frame that looks like a rendering failure.
 */

import { useState } from "react";
import { boundsOf, padRect, type Rect } from "@/lib/board/geometry";
import { resolveNodeRect } from "@/lib/board/document";
import { visibleWorldRect, type Viewport, type ViewportSize } from "@/lib/board/viewport";
import type { BoardBookmark, BoardDoc } from "@/lib/board/types";

export interface BoardMinimapProps {
  doc: BoardDoc;
  viewport: Viewport;
  size: ViewportSize;
  onJumpTo: (world: { x: number; y: number }) => void;
  bookmarks: BoardBookmark[];
  onRecallBookmark: (bookmark: BoardBookmark) => void;
  onDeleteBookmark: (bookmarkId: string) => void;
  onSaveBookmark: (label: string) => void;
}

const MAP_HEIGHT = 130;

export default function BoardMinimap({
  doc,
  viewport,
  size,
  onJumpTo,
  bookmarks,
  onRecallBookmark,
  onDeleteBookmark,
  onSaveBookmark,
}: BoardMinimapProps) {
  const [label, setLabel] = useState("");
  const view = visibleWorldRect(viewport, size);
  const content = boundsOf([
    ...doc.nodes.map((node) => resolveNodeRect(doc, node)),
    ...doc.overlays.map((overlay) => overlay.rect),
  ]);
  // The current view is included so the marker stays on the map even when the
  // user has panned away from everything.
  const extent = content ? padRect(unionRect(content, view), 200) : null;

  const project = (rect: Rect, mapWidth: number): Rect | null => {
    if (!extent || extent.w <= 0 || extent.h <= 0) return null;
    const scale = Math.min(mapWidth / extent.w, MAP_HEIGHT / extent.h);
    return {
      x: (rect.x - extent.x) * scale,
      y: (rect.y - extent.y) * scale,
      w: Math.max(2, rect.w * scale),
      h: Math.max(2, rect.h * scale),
    };
  };

  // The map element is a fixed CSS width; 200 matches .sbp-minimap.
  const MAP_WIDTH = 200;

  const handleJump = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!extent) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const scale = Math.min(bounds.width / extent.w, bounds.height / extent.h);
    onJumpTo({
      x: extent.x + (event.clientX - bounds.left) / scale,
      y: extent.y + (event.clientY - bounds.top) / scale,
    });
  };

  const viewBox = project(view, MAP_WIDTH);

  return (
    <div className="sbp-minimap" data-testid="board-minimap">
      <div className="sbp-minimap__canvas" onClick={handleJump} role="presentation">
        {!extent ? (
          <div className="sbp-empty" style={{ padding: 10 }}>
            Nothing on the board yet.
          </div>
        ) : null}
        {doc.overlays.map((overlay) => {
          const box = project(overlay.rect, MAP_WIDTH);
          return box ? (
            <div
              key={overlay.id}
              className="sbp-minimap__sheet"
              style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
            />
          ) : null;
        })}
        {doc.nodes.map((node) => {
          const box = project(resolveNodeRect(doc, node), MAP_WIDTH);
          return box ? (
            <div
              key={node.id}
              className="sbp-minimap__node"
              style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
            />
          ) : null;
        })}
        {viewBox ? (
          <div
            className="sbp-minimap__view"
            data-testid="board-minimap-view"
            style={{ left: viewBox.x, top: viewBox.y, width: viewBox.w, height: viewBox.h }}
          />
        ) : null}
      </div>

      <div className="sbp-minimap__marks">
        {/* Named on the way in. A bookmark called "View 3" is one nobody ever
            taps again; "Bay 3 canopy" is the point of the feature. */}
        <input
          className="sbp-minimap__name"
          value={label}
          placeholder="Name this view"
          aria-label="Name this view"
          onChange={(event) => setLabel(event.target.value)}
        />
        <button
          type="button"
          className="sbp-btn sbp-btn--sm"
          disabled={label.trim().length === 0}
          onClick={() => {
            onSaveBookmark(label.trim());
            setLabel("");
          }}
        >
          Save view
        </button>
        {bookmarks.length === 0 ? (
          <span className="sbp-empty">No spatial bookmarks yet.</span>
        ) : (
          bookmarks.map((bookmark) => (
            <span key={bookmark.id} className="sbp-mark">
              <button
                type="button"
                className="sbp-mark"
                style={{ border: "none", padding: 0, background: "transparent" }}
                onClick={() => onRecallBookmark(bookmark)}
              >
                {bookmark.label}
              </button>
              <button
                type="button"
                aria-label={`Delete bookmark ${bookmark.label}`}
                style={{ border: "none", background: "transparent", cursor: "pointer", color: "inherit" }}
                onClick={() => onDeleteBookmark(bookmark.id)}
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>
    </div>
  );
}

function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
}
