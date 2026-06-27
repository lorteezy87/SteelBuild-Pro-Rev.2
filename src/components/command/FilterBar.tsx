import type { ReactNode } from "react";
import { Search, Download, Plus } from "lucide-react";

export function FilterBar({
  search,
  onSearch,
  searchPlaceholder = "Search…",
  filters,
  onExport,
  primaryLabel,
  onPrimary,
}: {
  search: string;
  onSearch: (v: string) => void;
  searchPlaceholder?: string;
  filters?: ReactNode;
  onExport?: () => void;
  primaryLabel?: string;
  onPrimary?: (() => void) | null;
}) {
  return (
    <div className="cmd-filterbar">
      <div className="cmd-search">
        <Search size={15} />
        <input className="cmd-search__input" value={search} onChange={(e) => onSearch(e.target.value)} placeholder={searchPlaceholder} />
      </div>
      <div className="cmd-filterbar__filters">{filters}</div>
      <div className="cmd-filterbar__actions">
        {onExport ? (
          <button type="button" className="cmd-btn cmd-btn--ghost" onClick={onExport}><Download size={14} /> Export</button>
        ) : null}
        {primaryLabel && onPrimary ? (
          <button type="button" className="cmd-btn cmd-btn--primary" onClick={onPrimary}><Plus size={14} /> {primaryLabel}</button>
        ) : null}
      </div>
    </div>
  );
}
