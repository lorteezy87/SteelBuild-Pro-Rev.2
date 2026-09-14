import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { eventToPdfPoint, newMarkupId } from "./coords";
import {
  commitAnnotationDraft,
  createPlacedAnnotation,
  cursorForAnnotationTool,
  nextMarkupStatus,
  selectPageAnnotations,
} from "./annotationDerive";
import type {
  AnnotationDraft,
  AnnotationInteractionCallbacks,
  AnnotationItem,
  AnnotationTool,
  MeasurementDraft,
  ViewportLike,
} from "./annotationTypes";

interface UseAnnotationInteractionOptions extends AnnotationInteractionCallbacks {
  viewport: ViewportLike | null;
  pdfPage: number;
  items: AnnotationItem[];
  activeTool?: AnnotationTool | null;
  activeColor: string;
  activeStamp: string;
  hideResolved: boolean;
}

export function useAnnotationInteraction({
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
}: UseAnnotationInteractionOptions) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [draft, setDraft] = useState<AnnotationDraft | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  const pageItems = useMemo(
    () => selectPageAnnotations(items, pdfPage, hideResolved),
    [hideResolved, items, pdfPage],
  );
  const isDrawingTool = Boolean(activeTool && activeTool !== "select");
  const cursor = cursorForAnnotationTool(activeTool);

  const handlePointerDown = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    if (!viewport || !isDrawingTool || event.button !== 0) return;
    event.preventDefault();
    const [x, y] = eventToPdfPoint(event, svgRef.current, viewport);

    if (activeTool === "measure" || activeTool === "calibrate") {
      const isTrackingMeasurement = (
        draft?.kind === "measure" || draft?.kind === "calibrate"
      ) && draft.tracking;
      if (!isTrackingMeasurement) {
        setDraft({
          kind: activeTool,
          x0: x,
          y0: y,
          x1: x,
          y1: y,
          tracking: true,
        });
      } else {
        const measurementDraft = draft as MeasurementDraft;
        const distance = Math.hypot(x - measurementDraft.x0, y - measurementDraft.y0);
        if (distance > 1) {
          if (activeTool === "calibrate") {
            onCalibrate?.(distance / 72);
          } else {
            onAddItem({
              id: newMarkupId(),
              kind: "measure",
              pdf_page: pdfPage,
              color: activeColor,
              geom: {
                x1: measurementDraft.x0,
                y1: measurementDraft.y0,
                x2: x,
                y2: y,
              },
              created_at: new Date().toISOString(),
            });
          }
        }
        setDraft(null);
      }
      return;
    }

    if (activeTool === "note" || activeTool === "stamp") {
      const id = newMarkupId();
      onAddItem(createPlacedAnnotation(
        activeTool,
        { x, y },
        {
          id,
          pdfPage,
          color: activeColor,
          activeStamp,
          createdAt: new Date().toISOString(),
        },
      ));
      if (activeTool === "note") setEditingNoteId(id);
      return;
    }

    if (activeTool === "pen") {
      setDraft({ kind: "pen", points: [{ x, y }] });
    } else if (
      activeTool === "rect"
      || activeTool === "cloud"
      || activeTool === "highlight"
      || activeTool === "arrow"
    ) {
      setDraft({ kind: activeTool, x0: x, y0: y, x1: x, y1: y });
    }

    if (
      activeTool === "pen"
      || activeTool === "rect"
      || activeTool === "cloud"
      || activeTool === "highlight"
      || activeTool === "arrow"
    ) {
      try {
        svgRef.current?.setPointerCapture?.(event.pointerId);
      } catch {
        // Pointer capture is best-effort in browsers without SVG support.
      }
    }
  }, [
    activeColor,
    activeStamp,
    activeTool,
    draft,
    isDrawingTool,
    onAddItem,
    onCalibrate,
    pdfPage,
    viewport,
  ]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    if (!draft || !viewport) return;
    const [x, y] = eventToPdfPoint(event, svgRef.current, viewport);
    setDraft((current) => {
      if (!current) return current;
      if (current.kind === "pen") {
        return { ...current, points: [...current.points, { x, y }] };
      }
      return { ...current, x1: x, y1: y };
    });
  }, [draft, viewport]);

  const handlePointerUp = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    if (!draft) return;
    try {
      svgRef.current?.releasePointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture is best-effort in browsers without SVG support.
    }

    const item = commitAnnotationDraft(draft, {
      id: newMarkupId(),
      pdfPage,
      color: activeColor,
      createdAt: new Date().toISOString(),
    });
    if (item) onAddItem(item);
    setDraft(null);
  }, [activeColor, draft, onAddItem, pdfPage]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (event.key === "Escape") {
        setDraft(null);
        setSelectedId(null);
        setEditingNoteId(null);
      } else if (
        (event.key === "Delete" || event.key === "Backspace")
        && selectedId
      ) {
        event.preventDefault();
        onRemoveItem(selectedId);
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onRemoveItem, selectedId]);

  return {
    svgRef,
    draft,
    selectedId,
    editingNoteId,
    pageItems,
    cursor,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    clearSelection() {
      setSelectedId(null);
      setEditingNoteId(null);
    },
    selectItem(item: AnnotationItem) {
      if (activeTool === "select") setSelectedId(item.id);
    },
    editNote(item: AnnotationItem) {
      if (activeTool === "select" && item.kind === "note") {
        setEditingNoteId(item.id);
      }
    },
    stopEditingNote() {
      setEditingNoteId(null);
    },
    cycleNoteStatus(item: AnnotationItem): MarkupStatusPatch | null {
      if (item.kind !== "note") return null;
      return { status: nextMarkupStatus(item.status) };
    },
  };
}

interface MarkupStatusPatch {
  status: ReturnType<typeof nextMarkupStatus>;
}
