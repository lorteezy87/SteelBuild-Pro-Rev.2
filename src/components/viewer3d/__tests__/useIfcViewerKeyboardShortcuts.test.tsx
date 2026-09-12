// @vitest-environment jsdom
import { useRef } from "react";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { useIfcViewerKeyboardShortcuts } from "../useIfcViewerKeyboardShortcuts";

function Harness({
  canvas,
  fitView,
  fitToBox,
  applyVisibility,
  clearSelection,
}: {
  canvas: HTMLCanvasElement;
  fitView: () => void;
  fitToBox: (box: THREE.Box3 | null) => void;
  applyVisibility: () => void;
  clearSelection: () => void;
}): null {
  const mesh = new THREE.Mesh() as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
  mesh.userData.guid = "A";
  const apiRef = useRef({
    model: {},
    renderer: { domElement: canvas } as THREE.WebGLRenderer,
    isolated: null as Set<string> | null,
    hidden: new Set<string>(),
    fitView,
  });
  const selectedRef = useRef(new Map([[mesh.uuid, mesh]]));
  const measureRef = useRef({ a: null, b: null });
  const measureModeRef = useRef(false);
  const onMeasureRef = useRef<((value: null) => void) | undefined>();

  useIfcViewerKeyboardShortcuts({
    status: "ready",
    apiRef,
    selectedRef,
    measureRef,
    measureModeRef,
    onMeasureRef,
    clearMeasureVisuals: vi.fn(),
    clearMeasureLabel: vi.fn(),
    clearSelection,
    boundsForGuids: () => new THREE.Box3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 1, 1),
    ),
    fitToBox,
    applyVisibility,
  });
  return null;
}

describe("IFC viewer keyboard shortcuts", () => {
  it("binds scene commands to the focused canvas and removes them on cleanup", () => {
    const canvas = document.createElement("canvas");
    const fitView = vi.fn();
    const fitToBox = vi.fn();
    const applyVisibility = vi.fn();
    const clearSelection = vi.fn();
    const view = render(
      <Harness
        canvas={canvas}
        fitView={fitView}
        fitToBox={fitToBox}
        applyVisibility={applyVisibility}
        clearSelection={clearSelection}
      />,
    );

    fireEvent.keyDown(canvas, { key: "f" });
    fireEvent.keyDown(canvas, { key: "i" });
    fireEvent.keyDown(canvas, { key: "h" });
    fireEvent.keyDown(canvas, { key: "u" });
    fireEvent.keyDown(canvas, { key: "Escape" });

    expect(fitView).not.toHaveBeenCalled();
    expect(fitToBox).toHaveBeenCalledTimes(2);
    expect(applyVisibility).toHaveBeenCalledTimes(3);
    expect(clearSelection).toHaveBeenCalledOnce();

    view.unmount();
    fireEvent.keyDown(canvas, { key: "Escape" });
    expect(clearSelection).toHaveBeenCalledOnce();
  });
});
