/**
 * BoardCanvas — the infinite surface, and every gesture on it.
 *
 * ## One pointer map, one gesture
 *
 * All input arrives as Pointer Events and is tracked in a single map of live
 * pointers. Mouse, stylus and up to two fingers therefore take exactly the same
 * path through this component: the *number* of pointers decides whether a
 * gesture is a drag or a pinch, not which input device produced it. Mixing a
 * touch handler with a mouse handler is how canvases end up dropping the second
 * finger, or firing a synthetic click at the end of a pan.
 *
 * ## The second finger cancels whatever the first was doing
 *
 * Putting a second finger down mid-drag means "I want to zoom", not "keep
 * dragging that card as well". So a second pointer discards the in-progress
 * drag or stroke and starts a pinch. Without this, a two-finger zoom over a card
 * drags the card across the board at the same time.
 *
 * ## The world layer is one CSS transform
 *
 * Nodes are positioned at their world coordinates inside a single transformed
 * element. The browser composites the pan and zoom; no node re-renders because
 * the viewport moved. The grid is painted on the *untransformed* element from
 * the same numbers, because a transformed background would blur as it scaled.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BoardAction } from "@/lib/board/document";
import { hitTestOverlay, resolveNodeRect } from "@/lib/board/document";
import { createInkNode, createNoteNode, createTaskNode } from "@/lib/board/factory";
import { distance, midpoint, toNormalized, type Rect, type Vec2 } from "@/lib/board/geometry";
import { DEFAULT_SIMPLIFY_TOLERANCE, isKeepableStroke, simplifyStroke, strokesBounds } from "@/lib/board/ink";
import type { BoardColor, BoardDoc, BoardNode } from "@/lib/board/types";
import { panByScreen, pinch, screenToWorld, zoomAt, type Viewport } from "@/lib/board/viewport";
import BoardNodeCard from "./BoardNodeCard";
import ConnectorLayer from "./ConnectorLayer";
import InkLayer from "./InkLayer";
import { isOneShotTool, type BoardTool } from "./tools";

/** World units between grid lines. */
const GRID_SIZE = 40;
/** Snap step while dragging. Large enough to line cards up, small enough not to fight the user. */
const DRAG_SNAP = 8;
/** Stroke width in world units. */
const INK_WIDTH = 3;

type Gesture =
  | { kind: "none" }
  | { kind: "pan" }
  | { kind: "drag"; nodeIds: string[]; primaryId: string }
  | { kind: "resize"; nodeId: string }
  | { kind: "ink" }
  | { kind: "pinch"; prev: { center: Vec2; distance: number } };

export interface BoardCanvasProps {
  doc: BoardDoc;
  viewport: Viewport;
  setViewport: (next: Viewport | ((prev: Viewport) => Viewport)) => void;
  tool: BoardTool;
  onToolChange: (tool: BoardTool) => void;
  color: BoardColor;
  selection: string[];
  setSelection: (ids: string[]) => void;
  selectedEdgeId: string | null;
  setSelectedEdgeId: (id: string | null) => void;
  dispatch: (action: BoardAction, options?: { key?: string; label?: string }) => void;
  assetUrl: (assetId: string) => string | null;
  onSizeChange?: (size: { width: number; height: number }) => void;
  /** Disables every edit gesture — used while the Time Machine is scrubbing. */
  readOnly?: boolean;
}

export default function BoardCanvas({
  doc,
  viewport,
  setViewport,
  tool,
  onToolChange,
  color,
  selection,
  setSelection,
  selectedEdgeId,
  setSelectedEdgeId,
  dispatch,
  assetUrl,
  onSizeChange,
  readOnly = false,
}: BoardCanvasProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const pointers = useRef(new Map<number, Vec2>());
  const gesture = useRef<Gesture>({ kind: "none" });
  const [panning, setPanning] = useState(false);
  const [liveStroke, setLiveStroke] = useState<number[] | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [connectTo, setConnectTo] = useState<Vec2 | null>(null);

  // The viewport is read inside pointer handlers that are attached once; a ref
  // keeps them reading the current value without re-binding on every frame.
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  const rects = useMemo(() => {
    const map = new Map<string, Rect>();
    for (const node of doc.nodes) map.set(node.id, resolveNodeRect(doc, node));
    return map;
  }, [doc]);

  const ordered = useMemo(() => [...doc.nodes].sort((a, b) => a.z - b.z), [doc.nodes]);

  const localPoint = useCallback((event: { clientX: number; clientY: number }): Vec2 => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return { x: event.clientX, y: event.clientY };
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }, []);

  const worldPoint = useCallback(
    (event: { clientX: number; clientY: number }): Vec2 => screenToWorld(viewportRef.current, localPoint(event)),
    [localPoint],
  );

  // ── Size reporting ───────────────────────────────────────────────────────
  useEffect(() => {
    const element = surfaceRef.current;
    if (!element || !onSizeChange) return undefined;
    const report = () =>
      onSizeChange({ width: element.clientWidth, height: element.clientHeight });
    report();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(report);
    observer.observe(element);
    return () => observer.disconnect();
  }, [onSizeChange]);

  // ── Wheel / trackpad zoom ────────────────────────────────────────────────
  //
  // Bound imperatively because React's onWheel is passive, and a passive
  // handler cannot preventDefault — so the page scrolls behind the board and a
  // pinch on a trackpad zooms the whole browser instead of the canvas.
  useEffect(() => {
    const element = surfaceRef.current;
    if (!element) return undefined;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      if (event.ctrlKey) {
        // A trackpad pinch arrives as ctrl+wheel with small deltas.
        setViewport((prev) => zoomAt(prev, anchor, Math.exp(-event.deltaY / 100)));
        return;
      }
      setViewport((prev) => panByScreen(prev, -event.deltaX, -event.deltaY));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [setViewport]);

  const commitStroke = useCallback(
    (points: number[]) => {
      if (!isKeepableStroke(points)) return;
      const simplified = simplifyStroke(points, DEFAULT_SIMPLIFY_TOLERANCE);
      const stroke = { points: simplified, width: INK_WIDTH, color };
      const bounds = strokesBounds([stroke]);
      if (!bounds) return;
      const node = createInkNode(bounds, color);
      dispatch({ type: "add_node", node: { ...node, strokes: [stroke] } }, { label: "Drew markup" });
    },
    [color, dispatch],
  );

  /** Pin a dropped node to whatever sheet it landed on, or unpin it. */
  const settleDrop = useCallback(
    (nodeId: string) => {
      const node = doc.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      const rect = resolveNodeRect(doc, node);
      const centre = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
      const overlay = hitTestOverlay(doc, centre, true);
      if (!overlay) {
        if (node.anchor) dispatch({ type: "pin_node", id: nodeId, anchor: null }, { label: "Unpinned" });
        return;
      }
      const n = toNormalized(overlay.rect, { x: rect.x, y: rect.y });
      dispatch(
        { type: "pin_node", id: nodeId, anchor: { overlay_id: overlay.id, u: n.x, v: n.y } },
        { label: `Pinned to ${overlay.sheet_number || overlay.name}` },
      );
    },
    [doc, dispatch],
  );

  const endGesture = useCallback(() => {
    const current = gesture.current;
    if (current.kind === "ink" && liveStroke) commitStroke(liveStroke);
    if (current.kind === "drag") settleDrop(current.primaryId);
    gesture.current = { kind: "none" };
    setPanning(false);
    setLiveStroke(null);
  }, [commitStroke, liveStroke, settleDrop]);

  // ── Pointer handlers ─────────────────────────────────────────────────────

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const surface = surfaceRef.current;
    surface?.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, localPoint(event));

    if (pointers.current.size === 2) {
      // The second finger cancels whatever the first was doing. An in-progress
      // stroke is discarded rather than committed: the user is zooming, and half
      // a scribble is not a mark they meant to leave.
      setLiveStroke(null);
      const [a, b] = Array.from(pointers.current.values());
      gesture.current = { kind: "pinch", prev: { center: midpoint(a, b), distance: distance(a, b) } };
      setPanning(false);
      return;
    }
    if (pointers.current.size > 2) return;

    // A tap on empty canvas.
    setSelectedEdgeId(null);
    const world = worldPoint(event);

    if (readOnly) {
      gesture.current = { kind: "pan" };
      setPanning(true);
      return;
    }

    if (tool === "connect") {
      setConnectFrom(null);
      setConnectTo(null);
      gesture.current = { kind: "pan" };
      setPanning(true);
      return;
    }

    if (tool === "note" || tool === "task") {
      const node = tool === "note" ? createNoteNode(world, "", color) : createTaskNode(world, "", color);
      dispatch({ type: "add_node", node }, { label: tool === "note" ? "Added note" : "Added task" });
      setSelection([node.id]);
      if (isOneShotTool(tool)) onToolChange("select");
      gesture.current = { kind: "none" };
      return;
    }

    if (tool === "ink") {
      gesture.current = { kind: "ink" };
      setLiveStroke([world.x, world.y]);
      return;
    }

    setSelection([]);
    gesture.current = { kind: "pan" };
    setPanning(true);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) {
      // Not a pointer we are tracking — but a connector being drawn still needs
      // to follow the cursor.
      if (connectFrom) setConnectTo(worldPoint(event));
      return;
    }
    const previous = pointers.current.get(event.pointerId) ?? localPoint(event);
    const current = localPoint(event);
    pointers.current.set(event.pointerId, current);
    const dx = current.x - previous.x;
    const dy = current.y - previous.y;
    const scale = viewportRef.current.scale;

    const active = gesture.current;

    if (active.kind === "pinch") {
      if (pointers.current.size < 2) return;
      const [a, b] = Array.from(pointers.current.values());
      const next = { center: midpoint(a, b), distance: distance(a, b) };
      setViewport((prev) => pinch(prev, active.prev, next));
      gesture.current = { kind: "pinch", prev: next };
      return;
    }

    switch (active.kind) {
      case "pan":
        setViewport((prev) => panByScreen(prev, dx, dy));
        if (connectFrom) setConnectTo(worldPoint(event));
        break;

      case "drag":
        dispatch(
          {
            type: "move_nodes",
            ids: active.nodeIds,
            dx: dx / scale,
            dy: dy / scale,
            grid: DRAG_SNAP,
          },
          { key: `move:${active.nodeIds.join(",")}`, label: `Moved ${active.nodeIds.length} card${active.nodeIds.length === 1 ? "" : "s"}` },
        );
        break;

      case "resize":
        dispatch(
          { type: "resize_node", id: active.nodeId, dw: dx / scale, dh: dy / scale },
          { key: `resize:${active.nodeId}`, label: "Resized card" },
        );
        break;

      case "ink":
        setLiveStroke((prev) => {
          const world = screenToWorld(viewportRef.current, current);
          return prev ? [...prev, world.x, world.y] : [world.x, world.y];
        });
        break;

      default:
        if (connectFrom) setConnectTo(worldPoint(event));
        break;
    }
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    surfaceRef.current?.releasePointerCapture?.(event.pointerId);
    if (pointers.current.size === 0) {
      endGesture();
    } else if (pointers.current.size === 1 && gesture.current.kind === "pinch") {
      // One finger lifted out of a pinch: continue as a pan from where the
      // remaining finger is, rather than leaving a stale pinch that jumps the
      // board when it next moves.
      gesture.current = { kind: "pan" };
      setPanning(true);
    }
  };

  const onNodePointerDown = (event: React.PointerEvent<HTMLDivElement>, node: BoardNode) => {
    if (pointers.current.size >= 1) return; // let the surface start a pinch
    event.stopPropagation();
    surfaceRef.current?.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, localPoint(event));
    setSelectedEdgeId(null);

    if (tool === "connect" && !readOnly) {
      if (!connectFrom) {
        setConnectFrom(node.id);
        setConnectTo(worldPoint(event));
        setSelection([node.id]);
      } else if (connectFrom !== node.id) {
        dispatch(
          {
            type: "add_edge",
            edge: {
              id: `edge_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
              from_node_id: connectFrom,
              to_node_id: node.id,
              kind: "relates",
              label: "",
              color,
              created_at: new Date().toISOString(),
            },
          },
          { label: "Connected two cards" },
        );
        setConnectFrom(null);
        setConnectTo(null);
      }
      gesture.current = { kind: "none" };
      return;
    }

    const alreadySelected = selection.includes(node.id);
    const ids = alreadySelected && selection.length > 1 ? selection : [node.id];
    setSelection(ids);
    if (readOnly) {
      gesture.current = { kind: "pan" };
      setPanning(true);
      return;
    }
    dispatch({ type: "bring_to_front", id: node.id }, { label: "Raised card" });
    gesture.current = { kind: "drag", nodeIds: ids, primaryId: node.id };
  };

  const onResizePointerDown = (event: React.PointerEvent<HTMLDivElement>, node: BoardNode) => {
    if (readOnly) return;
    event.stopPropagation();
    surfaceRef.current?.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, localPoint(event));
    gesture.current = { kind: "resize", nodeId: node.id };
  };

  const gridSize = GRID_SIZE * viewport.scale;
  const connectRect = connectFrom ? rects.get(connectFrom) ?? null : null;

  return (
    <div
      ref={surfaceRef}
      className={`sbp-canvas${panning ? " sbp-canvas--panning" : ""}${tool === "ink" ? " sbp-canvas--ink" : ""}${tool === "connect" ? " sbp-canvas--connect" : ""}`}
      data-testid="board-canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        className="sbp-canvas__grid"
        style={{
          backgroundSize: `${gridSize}px ${gridSize}px`,
          // Modulo keeps the offset small; without it the value grows without
          // bound as the board is panned and the pattern drifts out of step.
          backgroundPosition: `${(-viewport.x * viewport.scale) % gridSize}px ${(-viewport.y * viewport.scale) % gridSize}px`,
          // Below roughly 8px a grid is visual noise rather than a guide.
          opacity: gridSize < 8 ? 0 : 0.5,
        }}
      />

      <div
        className="sbp-canvas__world"
        data-testid="board-world"
        style={{
          transform: `translate(${-viewport.x * viewport.scale}px, ${-viewport.y * viewport.scale}px) scale(${viewport.scale})`,
        }}
      >
        {doc.overlays.map((overlay) => {
          const url = assetUrl(overlay.asset_id);
          return (
            <div
              key={overlay.id}
              className="sbp-sheet"
              data-testid={`board-sheet-${overlay.id}`}
              style={{
                left: overlay.rect.x,
                top: overlay.rect.y,
                width: overlay.rect.w,
                height: overlay.rect.h,
                opacity: overlay.opacity,
              }}
            >
              {url ? <img className="sbp-sheet__img" src={url} alt={overlay.name} /> : null}
              <span className="sbp-sheet__tag">{overlay.sheet_number || overlay.name}</span>
            </div>
          );
        })}

        <InkLayer doc={doc} live={liveStroke ? { points: liveStroke, width: INK_WIDTH, color } : null} />

        <ConnectorLayer
          doc={doc}
          scale={viewport.scale}
          selectedEdgeId={selectedEdgeId}
          onSelectEdge={setSelectedEdgeId}
          draft={connectRect && connectTo ? { fromRect: connectRect, to: connectTo } : null}
          dispatch={dispatch}
        />

        {ordered.map((node) => (
          <BoardNodeCard
            key={node.id}
            node={node}
            rect={rects.get(node.id) ?? node.rect}
            selected={selection.includes(node.id)}
            connectSource={connectFrom === node.id}
            assetUrl={assetUrl}
            onPointerDown={onNodePointerDown}
            onResizePointerDown={onResizePointerDown}
          />
        ))}
      </div>
    </div>
  );
}
