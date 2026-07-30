import React from "react";

export function TabletPage({
  title,
  actions,
  children,
  className = "",
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div className={`tablet-page ${className}`.trim()}>
      <header>
        <h1>{title}</h1>
        {actions}
      </header>
      {children}
    </div>
  );
}
