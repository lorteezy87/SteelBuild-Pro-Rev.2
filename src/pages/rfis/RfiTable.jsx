/**
 * Classic-branch RFI table: header row + the list of RfiRow, or an empty state.
 * Presentational — extracted verbatim from RFIs.jsx. `rows` is the filtered list;
 * `totalCount` is the unfiltered RFI count (drives the empty-state copy).
 */
import RfiRow from "./RfiRow";
import { EmptyState } from "@/components/design-system";

export default function RfiTable({ rows, totalCount, selectedIds, onToggleAll, onToggleSelect, onOpen }) {
  return (
    <div className="rfi-table-shell">
      <div className="rfi-table-header">
        <div>
          <input
            type="checkbox"
            checked={rows.length > 0 && selectedIds.size === rows.length}
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
