import { useEffect, useRef } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useFocusTrap(active = true) {
  const ref = useRef(null);

  useEffect(() => {
    if (!active || !ref.current) return;
    const container = ref.current;
    const previouslyFocused = document.activeElement;

    const getFocusable = () =>
      Array.from(container.querySelectorAll(FOCUSABLE)).filter(
        (el) => !el.closest("[aria-hidden='true']")
      );

    const handleKeyDown = (e) => {
      if (e.key !== "Tab") return;
      const focusable = getFocusable();
      if (focusable.length === 0) { e.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    container.addEventListener("keydown", handleKeyDown);

    const focusable = getFocusable();
    if (focusable.length > 0) {
      const autofocus = container.querySelector("[autofocus], [data-autofocus]");
      (autofocus || focusable[0]).focus();
    }

    return () => {
      container.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused && previouslyFocused.focus) {
        previouslyFocused.focus();
      }
    };
  }, [active]);

  return ref;
}
