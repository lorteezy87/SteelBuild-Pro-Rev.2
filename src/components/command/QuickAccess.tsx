import type { ComponentType } from "react";

export interface QuickAccessItem {
  page: string;
  label: string;
  metric?: string;
  Icon?: ComponentType<{ size?: number | string }>;
}

export interface QuickAccessProps {
  items: QuickAccessItem[];
  onSelect?: (page: string) => void;
  ariaLabel?: string;
}

export function QuickAccess({ items, onSelect, ariaLabel = "Quick access" }: QuickAccessProps) {
  return (
    <nav className="sbp-quick-access" aria-label={ariaLabel}>
      {items.map(({ page, label, metric, Icon }) => (
        <button
          type="button"
          className="sbp-quick-access__item"
          key={page}
          onClick={() => onSelect?.(page)}
        >
          {Icon ? <Icon size={16} /> : null}
          <span className="sbp-quick-access__label">{label}</span>
          {metric ? <span className="sbp-quick-access__metric">{metric}</span> : null}
        </button>
      ))}
    </nav>
  );
}
