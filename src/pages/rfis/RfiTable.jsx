/**
 * Canonical RFI register: header row + the list of RfiRow, or an empty state.
 * `rows` is the filtered list; `totalCount` drives the empty-state copy.
 *
 * Large lists virtualize (same @tanstack/react-virtual approach as
 * DrawingsTable) — below the threshold the DOM is identical to the classic
 * unvirtualized register so small projects keep natural page flow.
 */
import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import RfiRow from "./RfiRow";
import { EmptyState } from "@/components/design-system";

/** Above this many rows the body becomes an internal scroll + virtual list. */
const VIRTUALIZE_THRESHOLD = 150;
const ESTIMATED_ROW_HEIGHT = 68;

function VirtualizedBody({ rows, selectedIds, onToggleSelect, onOpen }) {
  const scrollRef = useRef(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 12,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom = virtualItems.length > 0
    ? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
    : 0;

  return (
    <div
      className="rfi-table-body"
      data-testid="rfi-table-body"
      ref={scrollRef}
      style={{ maxHeight: "calc(100vh - 320px)", overflowY: "auto" }}
    >
      {paddingTop > 0 && <div style={{ height: paddingTop }} aria-hidden="true" />}
      {virtualItems.map((vi) => {
        const r = rows[vi.index];
        return (
          <div key={r.id} data-index={vi.index} ref={virtualizer.measureElement}>
            <RfiRow
              rfi={r}
              selected={selectedIds.has(r.id)}
              onToggleSelect={onToggleSelect}
              onOpen={onOpen}
            />
          </div>
        );
      })}
      {paddingBottom > 0 && <div style={{ height: paddingBottom }} aria-hidden="true" />}
    </div>
  );
}

/**
 * @param {{
 *   rows: any[];
 *   totalCount: number;
 *   selectedIds?: Set<string>;
 *   onToggleAll?: (checked: boolean) => void;
 *   onToggleSelect?: (id: string) => void;
 *   onOpen?: (rfi: any) => void;
 * }} props
 */
export default function RfiTable({ rows, totalCount, selectedIds = new Set(), onToggleAll = () => {}, onToggleSelect = () => {}, onOpen = () => {} }) {
  const allVisibleSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.id));

  return (
    <div className="rfi-table-shell" data-testid="rfi-table-shell">
      <div className="rfi-table-header" role="row" data-testid="rfi-table-header">
        <div>
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={(e) => onToggleAll(e.target.checked)}
            aria-label="Select all visible RFIs"
          />
        </div>
        <div>RFI</div>
        <div>Question / Reference</div>
        <div>Ball in Court</div>
        <div>Status</div>
        <div>Due / Age</div>
        <div>Impact</div>
        <div></div>
      </div>
      {rows.length > VIRTUALIZE_THRESHOLD ? (
        <VirtualizedBody
          rows={rows}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
          onOpen={onOpen}
        />
      ) : rows.length > 0 ? (
        <div className="rfi-table-body" data-testid="rfi-table-body">
          {rows.map((r) => (
            <RfiRow
              key={r.id}
              rfi={r}
              selected={selectedIds.has(r.id)}
              onToggleSelect={onToggleSelect}
              onOpen={onOpen}
            />
          ))}
        </div>
      ) : (
        <div className="rfi-empty-wrap">
          <EmptyState
            icon="rfi"
            title={totalCount === 0 ? "No RFIs yet" : "No RFIs match your filters"}
            body={
              totalCount === 0
                ? "Create the first RFI or import an existing RFI log from CSV."
                : "Try clearing filters or widening the search query."
            }
          />
        </div>
      )}
    </div>
  );
}
