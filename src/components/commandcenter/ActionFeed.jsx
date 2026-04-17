import React from "react";
import ActionRow from "./ActionRow";

/**
 * Zone B — main action feed list.
 * Renders sorted, filtered items as ActionRow components.
 * Handles keyboard navigation (J/K/Enter/Esc) at the feed level.
 */

export default function ActionFeed({
  items = [],
  selectedIndex,
  onSelectIndex,
  onOpenDetail,
}) {
  if (items.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "80px 24px",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 36, opacity: 0.6 }}>&#10003;</div>
        <div
          style={{
            fontFamily: "'Space Grotesk', var(--font-body)",
            fontSize: 15,
            fontWeight: 500,
            color: "var(--text-secondary)",
            textAlign: "center",
          }}
        >
          Queue clear. Nothing requires action today.
        </div>
      </div>
    );
  }

  return (
    <div
      role="grid"
      aria-label="Action items feed"
      style={{
        border: "1px solid var(--border-default)",
        borderRadius: 4,
        overflow: "hidden",
      }}
    >
      {items.map((item, idx) => (
        <ActionRow
          key={item.sourceId || idx}
          item={item}
          isSelected={selectedIndex === idx}
          onSelect={() => onSelectIndex(idx)}
          onOpenDetail={onOpenDetail}
        />
      ))}
    </div>
  );
}
