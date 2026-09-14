import { useCallback, useEffect, useRef, useState } from "react";
import type { Model3DColorMode, Model3DColorStats } from "./model3dTabDerive";

export interface Model3DViewerHandle {
  clearSelection(): void;
  exitFullscreen?(): void;
  fitToGuids(guids: string[]): void;
  getModelHandle(): unknown;
  hide(guids: string[]): void;
  isolate(guids: string[]): void;
  selectGuids(guids: string[], options?: { fly?: boolean }): void;
  setClipHeight(value: number | null): void;
  showAll(): void;
}

export interface Model3DPick {
  assemblyMark?: string | null;
  partMark?: string | null;
  name?: string | null;
  sequence?: string | null;
  guid?: string | null;
}

export interface Model3DMeasureResult {
  phase?: "a" | "done" | string;
  ftIn?: string | null;
  decimalFeet?: number | null;
  meters?: number | null;
  snappedA?: boolean;
}

const readStoredColorMode = (): Model3DColorMode => {
  try {
    const value = localStorage.getItem("sbp:viewer-colormode");
    if (value === "model" || value === "fab" || value === "type" || value === "sequence" || value === "status") {
      return value;
    }
  } catch {
    // Storage can be unavailable in privacy-restricted browsing contexts.
  }
  return "fab";
};

export function useModel3DInteractionState(projectId?: string | null) {
  const viewerRef = useRef<Model3DViewerHandle | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [picked, setPicked] = useState<Model3DPick | null>(null);
  const [selectedGuids, setSelectedGuids] = useState<string[]>([]);
  const [colorStats, setColorStats] = useState<Model3DColorStats | null>(null);
  const [colorMode, setColorMode] = useState<Model3DColorMode>(readStoredColorMode);
  const [markFallback, setMarkFallback] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [measureMode, setMeasureMode] = useState(false);
  const [measureResult, setMeasureResult] = useState<Model3DMeasureResult | null>(null);
  const [isolatedKey, setIsolatedKey] = useState<string | null>(null);
  const [findQuery, setFindQuery] = useState("");
  const [findResult, setFindResult] = useState<{
    query: string;
    guids: string[];
    marks: string[];
    matchKind: "none" | "exact" | "prefix" | "contains";
  } | null>(null);
  const [clipEnabled, setClipEnabled] = useState(false);
  const [clipPct, setClipPct] = useState(100);

  useEffect(() => {
    try {
      localStorage.setItem("sbp:viewer-colormode", colorMode);
    } catch {
      // Storage can be unavailable in privacy-restricted browsing contexts.
    }
  }, [colorMode]);

  useEffect(() => {
    setMarkFallback(false);
  }, [projectId]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const resetViewerState = useCallback(() => {
    setSelectedGuids([]);
    setPicked(null);
    setIsolatedKey(null);
    setFindQuery("");
    setFindResult(null);
    setClipEnabled(false);
    setClipPct(100);
    setMeasureMode(false);
    setMeasureResult(null);
    setColorStats(null);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) void containerRef.current?.requestFullscreen?.();
    else void document.exitFullscreen?.();
  }, []);

  const toggleMeasure = useCallback(() => {
    setMeasureMode((enabled) => {
      if (enabled) setMeasureResult(null);
      return !enabled;
    });
  }, []);

  const isolateBucket = useCallback((key: string, guids: string[] | undefined) => {
    if (!viewerRef.current) return;
    if (isolatedKey === key) {
      viewerRef.current.showAll();
      setIsolatedKey(null);
      return;
    }
    if (!guids?.length) return;
    viewerRef.current.isolate(guids);
    setIsolatedKey(key);
  }, [isolatedKey]);

  const isolateSelection = useCallback(() => {
    if (!selectedGuids.length) return;
    viewerRef.current?.isolate(selectedGuids);
    setIsolatedKey("selection");
  }, [selectedGuids]);

  const hideSelection = useCallback(() => {
    if (!selectedGuids.length) return;
    viewerRef.current?.hide(selectedGuids);
    setIsolatedKey((key) => key ?? "hidden");
  }, [selectedGuids]);

  const showAll = useCallback(() => {
    viewerRef.current?.showAll();
    setIsolatedKey(null);
  }, []);

  return {
    viewerRef,
    containerRef,
    picked,
    setPicked,
    selectedGuids,
    setSelectedGuids,
    colorStats,
    setColorStats,
    colorMode,
    setColorMode,
    markFallback,
    setMarkFallback,
    isFullscreen,
    measureMode,
    setMeasureMode,
    measureResult,
    setMeasureResult,
    isolatedKey,
    findQuery,
    setFindQuery,
    findResult,
    setFindResult,
    clipEnabled,
    setClipEnabled,
    clipPct,
    setClipPct,
    resetViewerState,
    toggleFullscreen,
    toggleMeasure,
    isolateBucket,
    isolateSelection,
    hideSelection,
    showAll,
  };
}
