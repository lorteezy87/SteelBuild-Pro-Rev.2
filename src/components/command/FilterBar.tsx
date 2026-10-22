import { useId, type ReactNode } from "react";
import { Search, Download, Plus, Upload } from "lucide-react";

export function FilterBar({
  search,
  onSearch,
  searchPlaceholder = "Search…",
  filters,
  onImport,
  onExport,
  secondaryActions,
  primaryLabel,
  onPrimary,
  primaryDisabledReason = null,
}: {
  search: string;
  onSearch: (v: string) => void;
  searchPlaceholder?: string;
  filters?: ReactNode;
  onImport?: (() => void) | null;
  onExport?: () => void;
  /** Extra action buttons rendered in the actions cluster, just left of the
   *  primary button — e.g. secondary "WBS Builder" / "Bulk Add" controls. */
  secondaryActions?: ReactNode;
  primaryLabel?: string;
  onPrimary?: (() => void) | null;
  /** Why the primary action cannot be used right now. A caller that gates the
   *  action passes `onPrimary: null` AND this reason; the button then stays on
   *  screen disabled with the reason beside it, instead of disappearing. A
   *  control that vanishes tells the user nothing about why — they read it as
   *  "this product cannot do that". Omit the reason and the old behaviour is
   *  unchanged: no `onPrimary`, no button. */
  primaryDisabledReason?: string | null;
}) {
  const blockedId = useId();
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
        {secondaryActions}
        {primaryLabel && onPrimary ? (
          <button type="button" className="cmd-btn cmd-btn--primary" onClick={onPrimary}><Plus size={14} /> {primaryLabel}</button>
        ) : primaryLabel && primaryDisabledReason ? (
          <>
            <span className="cmd-row__meta" id={blockedId}>{primaryDisabledReason}</span>
            <button type="button" className="cmd-btn cmd-btn--primary" disabled aria-describedby={blockedId}><Plus size={14} /> {primaryLabel}</button>
          </>
        ) : null}
      </div>
    </div>
  );
}
