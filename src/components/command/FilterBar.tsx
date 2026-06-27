import type { ReactNode } from "react";
import { Search, Download, Plus, Upload } from "lucide-react";

export function FilterBar({
  search,
  onSearch,
  searchPlaceholder = "Search…",
  filters,
  onImport,
  onExport,
  primaryLabel,
  onPrimary,
}: {
  search: string;
  onSearch: (v: string) => void;
  searchPlaceholder?: string;
  filters?: ReactNode;
  onImport?: (() => void) | null;
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
        {onImport ? (
          <button type="button" className="cmd-btn cmd-btn--ghost" onClick={onImport}><Upload size={14} /> Import</button>
        ) : null}
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
