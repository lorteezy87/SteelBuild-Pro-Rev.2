import React, { useEffect, useId } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";

export function TabletFormSheet({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}): JSX.Element | null {
  const titleId = useId();
  const dialogRef = useFocusTrap(open) as React.RefObject<HTMLDivElement>;

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="tablet-form-sheet-overlay">
      <div
        ref={dialogRef}
        className="tablet-form-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="tablet-form-sheet__header">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="tablet-touch-target"
            aria-label={`Close ${title}`}
            data-autofocus
            onClick={onClose}
          >
            Close
          </button>
        </header>
        <div className="tablet-form-sheet__body">{children}</div>
        {footer ? <div className="tablet-form-sheet__footer">{footer}</div> : null}
      </div>
    </div>
  );
}
