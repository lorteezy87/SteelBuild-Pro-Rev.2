import type { CSSProperties, MouseEvent } from "react";
import {
  ANNOTATION_NOTE_TEXT,
  authorTitle,
  cloudPathFromRect,
  deriveDraftView,
  deriveLineView,
  deriveMeasurementView,
  deriveNoteView,
  deriveRectView,
  deriveStampView,
} from "./annotationDerive";
import { pointsToSvgAttr } from "./coords";
import type {
  AnnotationDraft,
  AnnotationItem,
  ViewportLike,
} from "./annotationTypes";

const htmlNamespace = { xmlns: "http://www.w3.org/1999/xhtml" };

interface AnnotationDraftPreviewProps {
  draft: AnnotationDraft;
  viewport: ViewportLike;
  color: string;
  markupScale: number | null;
}

export function AnnotationDraftPreview({
  draft,
  viewport,
  color,
  markupScale,
}: AnnotationDraftPreviewProps) {
  const view = deriveDraftView(draft, viewport, color, markupScale);

  if (view.kind === "pen") {
    return (
      <polyline
        points={view.points}
        stroke={color}
        strokeWidth={2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity={0.85}
      />
    );
  }
  if (view.kind === "rect") {
    return (
      <rect
        x={view.rect.left}
        y={view.rect.top}
        width={view.rect.width}
        height={view.rect.height}
        stroke={color}
        strokeWidth={2}
        fill={color}
        fillOpacity={0.10}
        strokeDasharray="4 3"
      />
    );
  }
  if (view.kind === "cloud") {
    return (
      <path
        d={view.path}
        stroke={color}
        strokeWidth={2}
        fill="none"
        strokeDasharray="4 3"
        opacity={0.9}
      />
    );
  }
  if (view.kind === "highlight") {
    return (
      <rect
        x={view.rect.left}
        y={view.rect.top}
        width={view.rect.width}
        height={view.rect.height}
        stroke="none"
        fill={color}
        fillOpacity={0.28}
      />
    );
  }
  if (view.kind === "measure" || view.kind === "calibrate") {
    return (
      <g>
        <circle cx={view.x1} cy={view.y1} r={5} fill="none" stroke={view.stroke} strokeWidth={2} />
        <circle cx={view.x2} cy={view.y2} r={5} fill="none" stroke={view.stroke} strokeWidth={2} />
        <line
          x1={view.x1}
          y1={view.y1}
          x2={view.x2}
          y2={view.y2}
          stroke={view.stroke}
          strokeWidth={2}
          strokeDasharray="6 4"
          opacity={0.9}
        />
        <rect
          x={view.midX - 56}
          y={view.midY - 11}
          width={112}
          height={22}
          rx={3}
          fill="rgba(12,14,17,0.88)"
          stroke={view.stroke}
          strokeWidth={1}
        />
        <text
          x={view.midX}
          y={view.midY + 4}
          textAnchor="middle"
          fontFamily="var(--font-mono)"
          fontSize={11}
          fontWeight={700}
          fill="#fff"
        >
          {view.label}
        </text>
      </g>
    );
  }
  return (
    <line
      x1={view.x1}
      y1={view.y1}
      x2={view.x2}
      y2={view.y2}
      stroke={color}
      strokeWidth={2.25}
      strokeLinecap="round"
      markerEnd="url(#sbp-arrowhead)"
      opacity={0.85}
      strokeDasharray="4 3"
    />
  );
}

interface AnnotationItemViewProps {
  item: AnnotationItem;
  viewport: ViewportLike;
  markupScale: number | null;
  selected: boolean;
  editing: boolean;
  interactive: boolean;
  onSelect(): void;
  onNoteDoubleClick(): void;
  onNoteTextChange(text: string): void;
  onNoteBlur(): void;
  onCycleStatus(): void;
}

export function AnnotationItemView({
  item,
  viewport,
  markupScale,
  selected,
  editing,
  interactive,
  onSelect,
  onNoteDoubleClick,
  onNoteTextChange,
  onNoteBlur,
  onCycleStatus,
}: AnnotationItemViewProps) {
  const color = item.color || "#FF3D3D";
  const selectionOutline: CSSProperties = selected
    ? { filter: "drop-shadow(0 0 3px rgba(200,155,32,0.9))" }
    : {};
  const style = {
    cursor: interactive ? "pointer" : "default",
    ...selectionOutline,
  };
  const handleClick = (event: MouseEvent<SVGElement>) => {
    if (!interactive) return;
    event.stopPropagation();
    onSelect();
  };

  if (item.kind === "pen") {
    return (
      <polyline
        points={pointsToSvgAttr(item.geom.points, viewport)}
        stroke={color}
        strokeWidth={selected ? 3 : 2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        style={style}
        onClick={handleClick}
      >
        <title>{authorTitle(item)}</title>
      </polyline>
    );
  }

  if (item.kind === "rect" || item.kind === "highlight") {
    const rect = deriveRectView(viewport, item.geom);
    const isHighlight = item.kind === "highlight";
    return (
      <rect
        x={rect.left}
        y={rect.top}
        width={rect.width}
        height={rect.height}
        stroke={isHighlight ? (selected ? color : "none") : color}
        strokeWidth={isHighlight ? (selected ? 1.5 : 0) : (selected ? 2.5 : 2)}
        fill={color}
        fillOpacity={isHighlight ? 0.28 : 0.12}
        style={style}
        onClick={handleClick}
      >
        <title>{authorTitle(item)}</title>
      </rect>
    );
  }

  if (item.kind === "cloud") {
    const rect = deriveRectView(viewport, item.geom);
    return (
      <path
        d={cloudPathFromRect(rect.left, rect.top, rect.width, rect.height)}
        stroke={color}
        strokeWidth={selected ? 3 : 2.25}
        strokeLinejoin="round"
        fill={color}
        fillOpacity={0.05}
        style={style}
        onClick={handleClick}
      >
        <title>{authorTitle(item)}</title>
      </path>
    );
  }

  if (item.kind === "stamp") {
    const view = deriveStampView(viewport, item);
    const { rect } = view;
    return (
      <g style={style} onClick={handleClick}>
        <title>{authorTitle(item)}</title>
        <rect
          x={rect.left}
          y={rect.top}
          width={rect.width}
          height={rect.height}
          rx={rect.height * 0.12}
          fill="#ffffff"
          fillOpacity={0.82}
          stroke={view.color}
          strokeWidth={Math.max(1.5, rect.height * 0.055)}
        />
        <rect
          x={rect.left + rect.height * 0.09}
          y={rect.top + rect.height * 0.09}
          width={Math.max(0, rect.width - rect.height * 0.18)}
          height={Math.max(0, rect.height - rect.height * 0.18)}
          rx={rect.height * 0.08}
          fill="none"
          stroke={view.color}
          strokeWidth={Math.max(0.75, rect.height * 0.025)}
        />
        <text
          x={rect.left + rect.width / 2}
          y={rect.top + rect.height / 2 + view.fontSize * 0.36}
          textAnchor="middle"
          fontFamily="var(--font-mono)"
          fontSize={view.fontSize}
          fontWeight={800}
          letterSpacing="0.08em"
          fill={view.color}
        >
          {view.label}
        </text>
      </g>
    );
  }

  if (item.kind === "measure") {
    const view = deriveMeasurementView(viewport, item.geom, markupScale);
    return (
      <g style={style} onClick={handleClick}>
        <circle cx={view.x1} cy={view.y1} r={4} fill={color} />
        <circle cx={view.x2} cy={view.y2} r={4} fill={color} />
        <line
          x1={view.x1}
          y1={view.y1}
          x2={view.x2}
          y2={view.y2}
          stroke={color}
          strokeWidth={selected ? 2.5 : 2}
        />
        <rect
          x={view.midX - 42}
          y={view.midY - 11}
          width={84}
          height={22}
          rx={3}
          fill="rgba(12,14,17,0.88)"
          stroke={color}
          strokeWidth={1}
        />
        <text
          x={view.midX}
          y={view.midY + 4}
          textAnchor="middle"
          fontFamily="var(--font-mono)"
          fontSize={11}
          fontWeight={700}
          fill="#fff"
        >
          {view.label}
        </text>
      </g>
    );
  }

  if (item.kind === "arrow") {
    const view = deriveLineView(viewport, item.geom);
    return (
      <line
        x1={view.x1}
        y1={view.y1}
        x2={view.x2}
        y2={view.y2}
        stroke={color}
        strokeWidth={selected ? 3 : 2.25}
        strokeLinecap="round"
        markerEnd="url(#sbp-arrowhead)"
        style={style}
        onClick={handleClick}
      >
        <title>{authorTitle(item)}</title>
      </line>
    );
  }

  if (item.kind !== "note") return null;

  const view = deriveNoteView(viewport, item);
  return (
    <g
      style={style}
      onClick={handleClick}
      onDoubleClick={onNoteDoubleClick}
    >
      <circle cx={view.cx} cy={view.cy} r={view.size / 2} fill={color} opacity={0.92} />
      <circle cx={view.cx} cy={view.cy} r={view.size / 2 - 3} fill="#fff" opacity={0.85} />
      <circle cx={view.cx} cy={view.cy} r={3} fill={color} />

      {interactive && (
        <g
          transform={view.statusTransform}
          style={{ cursor: "pointer" }}
          onClick={(event) => {
            event.stopPropagation();
            onCycleStatus();
          }}
        >
          <rect
            x={0}
            y={0}
            width={36}
            height={12}
            rx={6}
            fill={view.statusColor}
            stroke="rgba(0,0,0,0.35)"
            strokeWidth={0.75}
          />
          <text
            x={18}
            y={9}
            textAnchor="middle"
            fontFamily="var(--font-mono)"
            fontSize={8}
            fontWeight={700}
            fill="#fff"
            style={{ letterSpacing: "0.06em" }}
          >
            {view.statusLabel}
          </text>
        </g>
      )}

      {editing ? (
        <foreignObject
          x={view.cx + view.size / 2 + 4}
          y={view.cy - view.size / 2}
          width={220}
          height={90}
        >
          <textarea
            {...htmlNamespace}
            id={`sbp-note-${item.id}`}
            name={`sbp-note-${item.id}`}
            aria-label="Markup note"
            autoFocus
            defaultValue={item.text || ""}
            onChange={(event) => onNoteTextChange(event.target.value)}
            onBlur={onNoteBlur}
            onKeyDown={(event) => {
              if (event.key === "Escape") event.currentTarget.blur();
            }}
            style={{
              width: 220,
              height: 86,
              padding: "6px 8px",
              fontFamily: "var(--font-body)",
              fontSize: 12,
              color: "var(--text-primary)",
              background: "var(--bg-surface)",
              border: "1px solid var(--accent)",
              borderRadius: 4,
              resize: "none",
              outline: "none",
              boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
              boxSizing: "border-box",
            }}
            placeholder="Note…"
          />
        </foreignObject>
      ) : item.text ? (
        <foreignObject
          x={view.cx + view.size / 2 + 4}
          y={view.cy - view.size / 2}
          width={220}
          height={92}
          pointerEvents="none"
        >
          <div
            {...htmlNamespace}
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 11,
              color: ANNOTATION_NOTE_TEXT,
              background: "rgba(255,240,180,0.95)",
              border: "1px solid rgba(0,0,0,0.25)",
              borderRadius: 3,
              padding: "4px 6px",
              maxWidth: 220,
              boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
              whiteSpace: "pre-wrap",
              lineHeight: 1.35,
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {item.text}
            {(item.author || item.created_at) && (
              <div
                style={{
                  marginTop: 3,
                  fontSize: 9,
                  color: "rgba(0,0,0,0.55)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {[
                  item.author,
                  item.created_at
                    ? new Date(item.created_at).toLocaleDateString()
                    : null,
                ].filter(Boolean).join(" · ")}
              </div>
            )}
          </div>
        </foreignObject>
      ) : null}
    </g>
  );
}
