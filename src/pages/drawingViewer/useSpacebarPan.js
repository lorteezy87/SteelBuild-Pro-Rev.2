import { useEffect, useRef, useState } from "react";

// Spacebar-hold pan. Track press/release + change cursor to "grab"/"grabbing".
// While held, the markup tool is suppressed so dragging pans instead of drawing.
// spacebarPanRef is read by the pan event handlers attached via the container
// ref callback, which close over a stable ref not React state.
//
// Returns:
//   - spacePan        — boolean state, drives container cursor styling.
//   - spacebarPanRef  — mutable ref that mirrors spacePan, suitable for use
//                       inside imperative event handlers that close over a
//                       stable reference (e.g. addEventListener callbacks).
export function useSpacebarPan() {
  const [spacePan, setSpacePan] = useState(false);
  const spacebarPanRef = useRef(false);
  useEffect(() => { spacebarPanRef.current = spacePan; }, [spacePan]);
  useEffect(() => {
    const onDown = (e) => {
      if (e.code !== "Space") return;
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      e.preventDefault();
      setSpacePan(true);
    };
    const onUp = (e) => { if (e.code === "Space") setSpacePan(false); };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);
  return { spacePan, spacebarPanRef };
}
