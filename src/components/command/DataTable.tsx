import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

/**
 * Above this many rows, DataTable switches from a full <table> to the
 * useVirtualizer house pattern (sticky CSS-grid header + absolute rows).
 * Matches DrawingRegister / RevisionImpact / Production Status thresholds.
 */
export const DATA_TABLE_VIRTUALIZE_THRESHOLD = 100;

export function shouldVirtualizeDataTable(
  rowCount: number,
  threshold: number = DATA_TABLE_VIRTUALIZE_THRESHOLD,
): boolean {
  return rowCount > threshold;
}

export interface Column<Row> {
  key: string;
  header: ReactNode;
  align?: "left" | "right" | "center";
  /**
   * Optional CSS-grid track for the virtualized branch. When omitted, a
   * sensible minmax track is chosen from `align` so command centers don't
   * have to declare tracks unless they care about column proportions.
   */
  grid?: string;
  render: (row: Row) => ReactNode;
}

export type DataTableProps<Row extends { id?: string }> = {
  columns: Column<Row>[];
  rows: Row[];
  onRowClick?: (row: Row) => void;
  emptyMessage?: string;
  /**
   * Row count above which the virtualized grid is used.
   * Pass `false` to force the full table (e.g. print / export layouts).
   * Defaults to DATA_TABLE_VIRTUALIZE_THRESHOLD (100).
   */
  virtualizeThreshold?: number | false;
  /** Max height of the virtualized scroll body (px). Default 600. */
  virtualMaxHeight?: number;
  /** When provided with onToggleRow, prepends a checkbox column. */
  selectedIds?: ReadonlySet<string>;
  onToggleRow?: (id: string, next: boolean) => void;
  onToggleAll?: (selectAll: boolean) => void;
  getRowId?: (row: Row, index: number) => string;
};

function defaultGridTrack<Row>(c: Column<Row>): string {
  if (c.grid) return c.grid;
  if (c.align === "right") return "minmax(64px, 0.75fr)";
  if (c.align === "center") return "minmax(72px, 0.8fr)";
  return "minmax(96px, 1fr)";
}

function rowKey<Row extends { id?: string }>(
  row: Row,
  index: number,
  getRowId?: (row: Row, index: number) => string,
): string {
  if (getRowId) return getRowId(row, index);
  return row.id != null && String(row.id) !== "" ? String(row.id) : String(index);
}

function flexJustify(align: Column<unknown>["align"]): "flex-start" | "flex-end" | "center" {
  if (align === "right") return "flex-end";
  if (align === "center") return "center";
  return "flex-start";
}

function handleRowKeyDown<Row>(
  e: KeyboardEvent<HTMLElement>,
  row: Row,
  onRowClick?: (row: Row) => void,
) {
  if (!onRowClick) return;
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    onRowClick(row);
  }
}

function VirtualDataTable<Row extends { id?: string }>({
  columns,
  rows,
  onRowClick,
  virtualMaxHeight = 600,
  selectedIds,
  onToggleRow,
  onToggleAll,
  getRowId,
}: {
  columns: Column<Row>[];
  rows: Row[];
  onRowClick?: (row: Row) => void;
  virtualMaxHeight?: number;
  selectedIds?: ReadonlySet<string>;
  onToggleRow?: (id: string, next: boolean) => void;
  onToggleAll?: (selectAll: boolean) => void;
  getRowId?: (row: Row, index: number) => string;
}) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const selectable = Boolean(selectedIds && onToggleRow);
  const rowIds = rows.map((row, i) => rowKey(row, i, getRowId));
  const selectedCount = selectable
    ? rowIds.filter((id) => selectedIds!.has(id)).length
    : 0;
  const allSelected = selectable && rows.length > 0 && selectedCount === rows.length;
  const someSelected = selectedCount > 0 && !allSelected;

  const gridCols = [
    ...(selectable ? ["36px"] : []),
    ...columns.map((c) => defaultGridTrack(c)),
  ].join(" ");

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 45,
    overscan: 12,
  });

  return (
    <div className="cmd-table-wrap" style={{ overflow: "hidden" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: gridCols,
          borderBottom: "1px solid var(--cmd-border)",
        }}
      >
        {selectable ? (
          <div
            style={{
              padding: "10px 8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <input
              type="checkbox"
              aria-label="Select all rows"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected;
              }}
              onChange={() => onToggleAll?.(!allSelected)}
            />
          </div>
        ) : null}
        {columns.map((c) => (
          <div
            key={c.key}
            style={{
              padding: "10px 14px",
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--cmd-text-muted)",
              display: "flex",
              alignItems: "center",
              justifyContent: flexJustify(c.align),
              minWidth: 0,
              whiteSpace: "nowrap",
            }}
          >
            {c.header}
          </div>
        ))}
      </div>
      <div ref={parentRef} style={{ maxHeight: virtualMaxHeight, overflowY: "auto" }}>
        <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            const id = rowIds[virtualRow.index];
            const checked = selectable ? selectedIds!.has(id) : false;
            const clickable = Boolean(onRowClick);
            return (
              <div
                key={id}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                className={clickable ? "is-clickable" : undefined}
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={clickable ? () => onRowClick?.(row) : undefined}
                onKeyDown={clickable ? (e) => handleRowKeyDown(e, row, onRowClick) : undefined}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                  display: "grid",
                  gridTemplateColumns: gridCols,
                  borderTop: virtualRow.index === 0 ? "none" : "1px solid var(--cmd-border)",
                  cursor: clickable ? "pointer" : undefined,
                }}
              >
                {selectable ? (
                  <div
                    style={{
                      padding: "11px 8px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      aria-label={`Select row ${id}`}
                      checked={checked}
                      onChange={(e) => onToggleRow?.(id, e.target.checked)}
                    />
                  </div>
                ) : null}
                {columns.map((c) => (
                  <div
                    key={c.key}
                    style={{
                      padding: "11px 14px",
                      fontSize: 13,
                      color: "var(--cmd-text)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: flexJustify(c.align),
                      minWidth: 0,
                      textAlign: c.align || "left",
                    }}
                  >
                    {c.render(row)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function DataTable<Row extends { id?: string }>({
  columns,
  rows,
  onRowClick,
  emptyMessage = "No rows.",
  virtualizeThreshold,
  virtualMaxHeight,
  selectedIds,
  onToggleRow,
  onToggleAll,
  getRowId,
}: DataTableProps<Row>) {
  const threshold =
    virtualizeThreshold === false
      ? Number.POSITIVE_INFINITY
      : (virtualizeThreshold ?? DATA_TABLE_VIRTUALIZE_THRESHOLD);

  if (rows.length > 0 && shouldVirtualizeDataTable(rows.length, threshold)) {
    return (
      <VirtualDataTable
        columns={columns}
        rows={rows}
        onRowClick={onRowClick}
        virtualMaxHeight={virtualMaxHeight}
        selectedIds={selectedIds}
        onToggleRow={onToggleRow}
        onToggleAll={onToggleAll}
        getRowId={getRowId}
      />
    );
  }

  const selectable = Boolean(selectedIds && onToggleRow);
  const rowIds = rows.map((row, i) => rowKey(row, i, getRowId));
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
                    onRowClick ? (e) => handleRowKeyDown(e, row, onRowClick) : undefined
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
