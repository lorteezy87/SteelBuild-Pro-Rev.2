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
}: {
  columns: Column<Row>[];
  rows: Row[];
  onRowClick?: (row: Row) => void;
  emptyMessage?: string;
}) {
  return (
    <div className="cmd-table-wrap">
      <table className="cmd-table">
        <thead>
          <tr>{columns.map((c) => <th key={c.key} style={{ textAlign: c.align || "left" }}>{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td className="cmd-table__empty" colSpan={columns.length}>{emptyMessage}</td></tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={row.id || i}
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
                {columns.map((c) => <td key={c.key} style={{ textAlign: c.align || "left" }}>{c.render(row)}</td>)}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
