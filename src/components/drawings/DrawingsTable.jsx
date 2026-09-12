import React, { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { mono } from "./drawingsConfig";
import {
  TABLE_HEADER_STYLE,
  TABLE_COLUMNS,
  buildDrawingGroups,
  buildDrawingTableViewModel,
  deriveGroupSelectionState,
  deriveSelectionState,
  estimateFlatRowHeight,
  sortArrow,
  compactHideStyle,
  getGroupSelectionToggleIds,
} from "./drawingsTableDerive";
import { GroupRow, SetOnlyInfoRow, SheetRow } from "./DrawingsTableRows";
import { useDrawingsTableInteractions } from "./useDrawingsTableInteractions";

// ─── Main table component ───────────────────────────────────────────────────

/**
 * Drawings list view organized by Drawing Set.
 * Each drawing_set_name appears as a collapsible summary row; the individual
 * sheets live underneath as child rows. Sheets without a set go to UNGROUPED.
 */
export default function DrawingsTable({
  drawings, selected, onToggleSelect, onToggleAll,
  onEdit, onDelete, onAdvance, onView,
  setContextMenu, onSetApproval, onDeleteSet, onRenameSet, onMarkTitleblock, onPackageReport, rfiMap,
  drawingSetMap = {},
  // submittalsBySetId: { [drawingSetId]: { total, open } } — used to
  // surface a "N SUBMITTALS" chip on each set's group header row.
  // Optional; when omitted, no chip is rendered.
  submittalsBySetId = {},
}) {
  const groups = useMemo(
    () => buildDrawingGroups(drawings, drawingSetMap),
    [drawings, drawingSetMap],
  );
  const {
    containerRef,
    compact,
    sort,
    expanded,
    handleSort,
    toggleExpand,
  } = useDrawingsTableInteractions(groups);

  const toggleGroupSelect = (group) => {
    getGroupSelectionToggleIds(group, selected).forEach(onToggleSelect);
  };

  const selection = deriveSelectionState(drawings, selected);

  const thStyle = { ...mono, ...TABLE_HEADER_STYLE };

  const SortableTh = ({ field, label, extraStyle }) => {
    if (!field) return <th style={{ ...thStyle, ...extraStyle }}>{label}</th>;
    const isActive = sort?.field === field;
    return (
      <th
        style={{
          ...thStyle,
          ...extraStyle,
          cursor: "pointer",
          userSelect: "none",
          color: isActive ? "var(--accent)" : thStyle.color,
        }}
        onClick={() => handleSort(field)}
        title={`Sort by ${label.toLowerCase()}`}
      >
        {label}{sortArrow(sort, field)}
      </th>
    );
  };

  const hideOnCompact = compactHideStyle(compact);

  const tableModel = useMemo(
    () => buildDrawingTableViewModel(groups, sort, expanded),
    [groups, sort, expanded],
  );

  const scrollRef = useRef(null);
  const virtualizer = useVirtualizer({
    count: tableModel.rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => estimateFlatRowHeight(tableModel.rows[i]),
    overscan: 12,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom = virtualItems.length > 0
    ? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
    : 0;

  return (
    <div
      ref={containerRef}
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-badge)", overflowX: "auto" }}
    >
      <div
        ref={scrollRef}
        style={{ maxHeight: "calc(100vh - 260px)", overflow: "auto" }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--bg-surface)" }}>
            <tr>
              {TABLE_COLUMNS.map((col) => {
                if (col.key === "checkbox") {
                  return (
                    <th key={col.key} style={{ ...thStyle, width: col.width }}>
                      <input
                        type="checkbox"
                        checked={selection.allSelected}
                        ref={(el) => { if (el) el.indeterminate = selection.indeterminate; }}
                        onChange={onToggleAll}
                        style={{ cursor: "pointer" }}
                      />
                    </th>
                  );
                }
                const extraStyle = {
                  ...(col.hidden ? { display: "none" } : {}),
                  ...(col.compactHide ? hideOnCompact : {}),
                };
                return (
                  <SortableTh
                    key={col.key}
                    field={col.field}
                    label={col.label}
                    extraStyle={Object.keys(extraStyle).length ? extraStyle : undefined}
                  />
                );
              })}
            </tr>
          </thead>
          <tbody>
            {paddingTop > 0 && (
              <tr><td style={{ height: paddingTop, padding: 0, border: "none" }} /></tr>
            )}
            {virtualItems.map((vItem) => {
              const row = tableModel.rows[vItem.index];
              if (row.type === "group") {
                const group = row.group;
                const groupSelection = deriveGroupSelectionState(group, selected);
                return (
                  <GroupRow
                    key={group.key}
                    group={group}
                    expanded={row.isExpanded}
                    onToggleExpand={() => toggleExpand(group.key)}
                    groupSelected={groupSelection.allSelected}
                    groupIndeterminate={groupSelection.indeterminate}
                    onToggleGroupSelect={() => toggleGroupSelect(group)}
                    onSetApproval={onSetApproval}
                    onDeleteSet={onDeleteSet}
                    onRenameSet={onRenameSet}
                    onMarkTitleblock={onMarkTitleblock}
                    onPackageReport={onPackageReport}
                    hideOnCompact={hideOnCompact}
                    submittalCounts={group.setId ? submittalsBySetId[group.setId] : undefined}
                  />
                );
              }
              if (row.type === "setOnlyInfo") {
                return (
                  <SetOnlyInfoRow key={`${row.group.key}-info`} group={row.group} />
                );
              }
              const d = row.drawing;
              return (
                <SheetRow
                  key={d.id}
                  d={d}
                  isSel={selected.has(d.id)}
                  onToggleSelect={onToggleSelect}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onAdvance={onAdvance}
                  onView={onView}
                  setContextMenu={setContextMenu}
                  onSetApproval={onSetApproval}
                  rfiMap={rfiMap}
                  isChild={!row.group.isUngrouped}
                  hideOnCompact={hideOnCompact}
                />
              );
            })}
            {paddingBottom > 0 && (
              <tr><td style={{ height: paddingBottom, padding: 0, border: "none" }} /></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
