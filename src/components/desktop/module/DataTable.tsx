/**
 * DataTable — refined table. columns: [{ key, label, align?: "num", render?(row) }].
 * rows: array; rowKey: field name for React keys. Shows LoadingSkeleton when
 * `loading`, EmptyState message when no rows. Presentation only — sorting,
 * paging, and virtualization stay with the caller for large data sets.
 */
import React from "react";
import LoadingSkeleton from "./states/LoadingSkeleton";
import EmptyState from "./states/EmptyState";

interface Column {
  key: string;
  label: React.ReactNode;
  align?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render?: (row: any) => React.ReactNode;
}

interface Props {
  columns: Column[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[];
  rowKey?: string;
  loading?: boolean;
  emptyMessage?: string;
}

export default function DataTable({ columns, rows, rowKey = "id", loading = false, emptyMessage = "Nothing here yet." }: Props) {
  if (loading) {
    return <div style={{ padding: 12 }}><LoadingSkeleton rows={5} /></div>;
  }
  if (!rows || rows.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }
  return (
    <table className="desk-table">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key} className={c.align === "num" ? "is-num" : undefined}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row[rowKey]}>
            {columns.map((c) => (
              <td key={c.key} className={c.align === "num" ? "is-num" : undefined}>
                {c.render ? c.render(row) : row[c.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
