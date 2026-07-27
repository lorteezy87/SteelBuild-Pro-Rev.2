import React from "react";
import type { ViewportBand } from "@/components/nav/useResponsiveBreakpoint";
import type { ColumnPriority } from "./columnPriority";
import { visibleColumnIds } from "./columnPriority";

export type TabletTableColumn<Row> = {
  id: string;
  header: string;
  priority: ColumnPriority;
  cell: (row: Row) => React.ReactNode;
};

export function TabletDataTable<Row extends { id: string }>({
  columns,
  rows,
  band,
  onRowOpen,
  emptyLabel = "No results",
}: {
  columns: TabletTableColumn<Row>[];
  rows: Row[];
  band: ViewportBand;
  onRowOpen?: (row: Row) => void;
  emptyLabel?: string;
}): JSX.Element {
  const allowedColumnIds = new Set(visibleColumnIds(columns, band));
  const visibleColumns = columns.filter((column) => allowedColumnIds.has(column.id));

  const openRow = (row: Row) => {
    onRowOpen?.(row);
  };

  const handleRowKeyDown =
    (row: Row) =>
    (event: React.KeyboardEvent<HTMLTableRowElement>) => {
      if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") {
        return;
      }

      event.preventDefault();
      openRow(row);
    };

  return (
    <div className="tablet-data-table-scroll">
      <table>
        <thead>
          <tr>
            {visibleColumns.map((column) => (
              <th key={column.id} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length > 0 ? (
            rows.map((row) => (
              <tr
                key={row.id}
                tabIndex={0}
                onClick={() => openRow(row)}
                onKeyDown={handleRowKeyDown(row)}
              >
                {visibleColumns.map((column) => (
                  <td key={column.id}>{column.cell(row)}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={Math.max(visibleColumns.length, 1)}>{emptyLabel}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
