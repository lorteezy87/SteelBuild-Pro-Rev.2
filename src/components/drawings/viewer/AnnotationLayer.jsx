/**
 * SVG overlay for persisted drawing markup and in-progress pointer input.
 *
 * The legacy JSX boundary remains because DrawingViewer and useMarkup are
 * still JavaScript. Typed derivations, rendering, and interaction state live
 * in focused TypeScript modules beside it.
 */

import React from "react";
import {
  ARROW_HEAD_SIZE,
  MARKUP_STATUS_COLOR,
  MARKUP_STATUS_ORDER,
  STAMP_TYPES,
  cloudPathFromRect,
} from "./annotationDerive";
import {
  AnnotationDraftPreview,
  AnnotationItemView,
} from "./AnnotationViews";
import { useAnnotationInteraction } from "./useAnnotationInteraction";

export {
  MARKUP_STATUS_COLOR,
  MARKUP_STATUS_ORDER,
  STAMP_TYPES,
  cloudPathFromRect,
};

export default function AnnotationLayer({
  viewport,
  canvasWidth,
  canvasHeight,
  pdfPage,
  items,
  activeTool,
  activeColor,
  activeStamp = "APPROVED",
  markupScale,
  onAddItem,
  onRemoveItem,
  onUpdateItem,
  onCalibrate,
  hideResolved = false,
}) {
  const interaction = useAnnotationInteraction({
    viewport,
    pdfPage,
    items,
    activeTool,
    activeColor,
    activeStamp,
    hideResolved,
    onAddItem,
    onRemoveItem,
    onCalibrate,
  });

  if (!viewport || !canvasWidth || !canvasHeight) return null;

  return (
    <svg
      ref={interaction.svgRef}
      width={canvasWidth}
      height={canvasHeight}
      viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: canvasWidth,
        height: canvasHeight,
        pointerEvents: "auto",
        cursor: interaction.cursor,
        touchAction: "none",
      }}
      onPointerDown={interaction.handlePointerDown}
      onPointerMove={interaction.handlePointerMove}
      onPointerUp={interaction.handlePointerUp}
      onPointerCancel={interaction.handlePointerUp}
      onClick={(event) => {
        if (
          activeTool === "select"
          && event.target === interaction.svgRef.current
        ) {
          interaction.clearSelection();
        }
      }}
    >
      <defs>
        <marker
          id="sbp-arrowhead"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth={ARROW_HEAD_SIZE}
          markerHeight={ARROW_HEAD_SIZE}
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
        </marker>
      </defs>

      {interaction.pageItems.map((item) => (
        <AnnotationItemView
          key={item.id}
          item={item}
          viewport={viewport}
          markupScale={markupScale}
          selected={interaction.selectedId === item.id}
          editing={interaction.editingNoteId === item.id}
          interactive={activeTool === "select"}
          onSelect={() => interaction.selectItem(item)}
          onNoteDoubleClick={() => interaction.editNote(item)}
          onNoteTextChange={(text) => onUpdateItem(item.id, { text })}
          onNoteBlur={interaction.stopEditingNote}
          onCycleStatus={() => {
            const patch = interaction.cycleNoteStatus(item);
            if (patch) onUpdateItem(item.id, patch);
          }}
        />
      ))}

      {interaction.draft && (
        <AnnotationDraftPreview
          draft={interaction.draft}
          viewport={viewport}
          color={activeColor}
          markupScale={markupScale}
        />
      )}
    </svg>
  );
}
