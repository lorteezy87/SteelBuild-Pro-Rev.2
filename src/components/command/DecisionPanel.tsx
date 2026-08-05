import type { ReactNode } from "react";

export function DecisionPanel({
  title,
  onViewAll,
  viewAllLabel = "View all",
  children,
}: {
  title: string;
  onViewAll?: () => void;
  viewAllLabel?: string;
  children: ReactNode;
}) {
  return (
    <section className="cmd-panel">
      <header className="cmd-panel__head">
        <h2 className="cmd-panel__title">{title}</h2>
        {onViewAll ? (
          <button type="button" className="cmd-panel__viewall" onClick={onViewAll}>
            {viewAllLabel}
          </button>
        ) : null}
      </header>
      <div className="cmd-panel__body">{children}</div>
    </section>
  );
}
