/**
 * Canonical RFI register: header row + the list of RfiRow, or an empty state.
 * `rows` is the filtered list; `totalCount` drives the empty-state copy.
 */
import RfiRow from "./RfiRow";
import { EmptyState } from "@/components/design-system";

export default function RfiTable({ rows, totalCount, selectedIds = new Set(), onToggleAll = () => {}, onToggleSelect = () => {}, onOpen = () => {} }) {
  const allVisibleSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.id));

  return (
    <div className="rfi-table-shell">
      <div className="rfi-table-header">
        <div>
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={(e) => onToggleAll(e.target.checked)}
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
      {rows.length > 0 ? (
        <div className="rfi-table-body">
          {rows.map((r) => (
            <RfiRow
              key={r.id}
              rfi={r}
              selected={selectedIds.has(r.id)}
              onToggle={() => onToggleSelect(r.id)}
              onOpen={() => onOpen(r)}
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
