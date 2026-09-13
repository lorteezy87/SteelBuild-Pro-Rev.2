import { useEffect, type MutableRefObject } from "react";
import * as THREE from "three";
import type { IfcViewerMesh } from "./ifcViewerScene";
import { selectedGuids } from "./ifcViewerScene";

interface KeyboardViewerApi {
  model: unknown | null;
  renderer: THREE.WebGLRenderer;
  isolated: Set<string> | null;
  hidden: Set<string>;
  fitView?: () => void;
}

interface MeasureState {
  a: THREE.Vector3 | null;
  b: THREE.Vector3 | null;
}

interface UseIfcViewerKeyboardShortcutsOptions {
  status: string;
  apiRef: MutableRefObject<KeyboardViewerApi | null>;
  selectedRef: MutableRefObject<Map<string, IfcViewerMesh>>;
  measureRef: MutableRefObject<MeasureState>;
  measureModeRef: MutableRefObject<boolean>;
  onMeasureRef: MutableRefObject<((value: null) => void) | undefined>;
  clearMeasureVisuals(): void;
  clearMeasureLabel(): void;
  clearSelection(): void;
  boundsForGuids(guids: Iterable<string>): THREE.Box3 | null;
  fitToBox(box: THREE.Box3 | null): void;
  applyVisibility(): void;
}

export function useIfcViewerKeyboardShortcuts({
  status,
  apiRef,
  selectedRef,
  measureRef,
  measureModeRef,
  onMeasureRef,
  clearMeasureVisuals,
  clearMeasureLabel,
  clearSelection,
  boundsForGuids,
  fitToBox,
  applyVisibility,
}: UseIfcViewerKeyboardShortcutsOptions): void {
  useEffect(() => {
    const api = apiRef.current;
    const canvas = api?.renderer.domElement;
    if (!api?.model || !canvas || status !== "ready") return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      const current = apiRef.current;
      if (!current?.model) return;
      if (event.key === "Escape") {
        if (measureModeRef.current) {
          clearMeasureVisuals();
          measureRef.current.a = null;
          measureRef.current.b = null;
          clearMeasureLabel();
          onMeasureRef.current?.(null);
        } else {
          clearSelection();
        }
        event.preventDefault();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const key = event.key.toLowerCase();
      const guids = selectedGuids(selectedRef.current.values());
      if (key === "f") {
        if (guids.length) fitToBox(boundsForGuids(guids));
        else current.fitView?.();
      } else if (key === "i" && guids.length) {
        current.isolated = new Set(guids);
        applyVisibility();
        fitToBox(boundsForGuids(guids));
      } else if (key === "h" && guids.length) {
        for (const guid of guids) current.hidden.add(guid);
        applyVisibility();
      } else if (key === "u") {
        current.isolated = null;
        current.hidden = new Set();
        applyVisibility();
      } else {
        return;
      }
      event.preventDefault();
    };

    canvas.addEventListener("keydown", onKeyDown);
    return () => canvas.removeEventListener("keydown", onKeyDown);
  // Callbacks intentionally dereference current refs and stay bound for one
  // loaded scene instead of rebinding after every selection update.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);
}
