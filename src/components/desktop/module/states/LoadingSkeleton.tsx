import React from "react";

interface Props {
  rows?: number;
  height?: number;
}

export default function LoadingSkeleton({ rows = 3, height = 16 }: Props) {
  return (
    <div aria-busy="true" aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="desk-skeleton" style={{ height }} />
      ))}
    </div>
  );
}
