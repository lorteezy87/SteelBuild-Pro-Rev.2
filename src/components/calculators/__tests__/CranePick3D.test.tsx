// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import * as THREE from "three";
import CranePick3D from "../CranePick3D";
import type { CraneSceneSpec } from "../cranePickScene";

const mockState = vi.hoisted(() => ({
  render: vi.fn(),
  controls: null as { target: import("three").Vector3 } | null,
}));

vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  return {
    ...actual,
    WebGLRenderer: class {
      domElement = document.createElement("canvas");
      setPixelRatio() {}
      setSize() {}
      render(...args: unknown[]) { mockState.render(...args); }
      dispose() {}
    },
  };
});

vi.mock("three/examples/jsm/controls/OrbitControls.js", async () => {
  const { Vector3 } = await import("three");
  return {
    OrbitControls: class {
      target = new Vector3();
      screenSpacePanning = false;
      maxPolarAngle = 0;
      minDistance = 0;
      maxDistance = 0;
      constructor() { mockState.controls = this; }
      addEventListener() {}
      removeEventListener() {}
      update() {}
      dispose() {}
    },
  };
});

const spec: CraneSceneSpec = {
  boomLength: 100,
  radius: 50,
  legHeight: 8,
  pickPoints: [],
  loadLength: 20,
  loadWidth: 1,
  capacityStatus: null,
  illustrative: false,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  mockState.render.mockClear();
  mockState.controls = null;
});

describe("CranePick3D viewport", () => {
  it("keeps the current orbit and pan framed as the viewport narrows and widens", () => {
    let width = 720;
    const height = 360;
    let notifyResize: (() => void) | undefined;
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => width);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(() => height);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: ResizeObserverCallback) {
        notifyResize = () => callback([], this as ResizeObserver);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    });

    render(<CranePick3D spec={spec} ariaLabel="Crane pick" />);
    const camera = mockState.render.mock.lastCall?.[1] as THREE.PerspectiveCamera;
    const controls = mockState.controls!;
    const target = new THREE.Vector3(12, 16, 3);
    const offset = new THREE.Vector3(70, 40, 90);
    controls.target.copy(target);
    camera.position.copy(target).add(offset);

    width = 240;
    act(() => notifyResize?.());

    const verticalHalfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    const portraitHalfFov = Math.atan(Math.tan(verticalHalfFov) * (width / height));
    const expectedScale = Math.sin(verticalHalfFov) / Math.sin(portraitHalfFov);
    expect(camera.aspect).toBeCloseTo(width / height);
    expect(camera.position.distanceTo(target)).toBeCloseTo(offset.length() * expectedScale, 8);
    expect(camera.position.clone().sub(target).normalize().distanceTo(offset.clone().normalize())).toBeLessThan(1e-10);
    expect(controls.target.equals(target)).toBe(true);

    width = 720;
    act(() => notifyResize?.());
    expect(camera.position.distanceTo(target)).toBeCloseTo(offset.length(), 8);
  });
});
