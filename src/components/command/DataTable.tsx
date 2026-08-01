import type { ReactNode } from "react";

export interface Column<Row> {
  key: string;
  header: ReactNode;
  align?: "left" | "right" | "center";
  render: (row: Row) => ReactNode;
}

export function DataTable<Row extends { id?: string }>({
  columns,
  rows,
  onRowClick,
  emptyMessage = "No rows.",
  selectedIds,
  onToggleRow,
  onToggleAll,
  getRowId = (row, index) => (row.id != null ? String(row.id) : String(index)),
}: {
  columns: Column<Row>[];
  rows: Row[];
  onRowClick?: (row: Row) => void;
  emptyMessage?: string;
  /** When provided with onToggleRow, prepends a checkbox column. */
  selectedIds?: ReadonlySet<string>;
  onToggleRow?: (id: string, next: boolean) => void;
  onToggleAll?: (selectAll: boolean) => void;
  getRowId?: (row: Row, index: number) => string;
}) {
  const selectable = Boolean(selectedIds && onToggleRow);
  const rowIds = rows.map((row, i) => getRowId(row, i));
  const selectedCount = selectable
    ? rowIds.filter((id) => selectedIds!.has(id)).length
    : 0;
  const allSelected = selectable && rows.length > 0 && selectedCount === rows.length;
  const someSelected = selectedCount > 0 && !allSelected;
  const colSpan = columns.length + (selectable ? 1 : 0);

  return (
    <div className="cmd-table-wrap">
      <table className="cmd-table">
        <thead>
          <tr>
            {selectable ? (
              <th style={{ width: 36 }}>
                <input
                  type="checkbox"
                  aria-label="Select all rows"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={() => onToggleAll?.(!allSelected)}
                />
              </th>
            ) : null}
            {columns.map((c) => (
              <th key={c.key} style={{ textAlign: c.align || "left" }}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="cmd-table__empty" colSpan={colSpan}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => {
              const id = rowIds[i];
              const checked = selectable ? selectedIds!.has(id) : false;
              return (
                <tr
                  key={id}
                  className={onRowClick ? "is-clickable" : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  role={onRowClick ? "button" : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          // Keyboard parity with onClick: Enter/Space activate the row
                          // (preventDefault on Space so it doesn't scroll the page).
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                >
                  {selectable ? (
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select row ${id}`}
                        checked={checked}
                        onChange={(e) => onToggleRow?.(id, e.target.checked)}
                      />
                    </td>
                  ) : null}
                  {columns.map((c) => (
                    <td key={c.key} style={{ textAlign: c.align || "left" }}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
