import React from "react";

export function TabletActionBar({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}): JSX.Element {
  return <div className={`tablet-action-bar ${className}`.trim()}>{children}</div>;
}
