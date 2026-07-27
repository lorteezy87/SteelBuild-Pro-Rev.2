import React, { useEffect, useId, useState } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";

export function TabletFilterBar({
  search,
  filters,
  overflow,
  overflowLabel = "Filters",
}: {
  search?: React.ReactNode;
  filters?: React.ReactNode;
  overflow?: React.ReactNode;
  overflowLabel?: string;
}): JSX.Element {
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const overflowRef = useFocusTrap(isOverflowOpen) as React.RefObject<HTMLDivElement>;
  const dialogId = useId();
  const closeLabel = `Close ${overflowLabel.toLowerCase()}`;

  const closeOverflow = () => {
    setIsOverflowOpen(false);
  };

  useEffect(() => {
    if (!isOverflowOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeOverflow();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOverflowOpen]);

  return (
    <div
      className={`tablet-filter-bar ${isOverflowOpen ? "tablet-filter-bar--expanded" : ""}`.trim()}
    >
      {search}
      {filters}
      {overflow ? (
        <>
          <button
            type="button"
            className="tablet-touch-target"
            aria-expanded={isOverflowOpen}
            aria-controls={isOverflowOpen ? dialogId : undefined}
            onClick={() => setIsOverflowOpen((current) => !current)}
          >
            {overflowLabel}
          </button>
          {isOverflowOpen ? (
            <div
              id={dialogId}
              ref={overflowRef}
              role="dialog"
              aria-modal="true"
              aria-label={overflowLabel}
            >
              <button
                type="button"
                className="tablet-touch-target"
                aria-label={closeLabel}
                data-autofocus
                onClick={closeOverflow}
              >
                Close
              </button>
              {overflow}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
