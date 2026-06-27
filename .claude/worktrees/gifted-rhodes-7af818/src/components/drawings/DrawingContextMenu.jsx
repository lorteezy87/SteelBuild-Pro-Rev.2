/**
 * DrawingContextMenu — the floating right-click/action menu for a single
 * drawing row. Items are filtered by the drawing's data (e.g. "Set
 * Approval" only appears when the drawing belongs to a named set).
 *
 * Extracted from pages/Drawings.jsx — no behavior change. The outer
 * positioning + click-outside dismissal still live in the page.
 */

import React from "react";
import { surface } from "./drawingsConfig";
import { ContextMenuItem } from "./DrawingsTable";

export default function DrawingContextMenu({
  contextMenu,
  contextRef,
  onView,
  onEdit,
  onAdvance,
  onSetApproval,
  onDelete,
  onDismiss,
}) {
  if (!contextMenu) return null;

  const items = [
    { label: "View PDF",       action: () => { onView(contextMenu.drawing); onDismiss(); } },
    { label: "Edit Sheet",     action: () => { onEdit(contextMenu.drawing); onDismiss(); } },
    { label: "Advance Stage →", action: () => onAdvance(contextMenu.drawing) },
    ...(contextMenu.drawing.drawing_set_name?.trim() ? [{
      label: "Set Approval ✓",
      action: () => {
        onSetApproval(contextMenu.drawing.drawing_set_name.trim());
        onDismiss();
      },
    }] : []),
    { label: "Delete Sheet",   action: () => onDelete(contextMenu.drawing.id), danger: true },
  ];

  return (
    <div
      ref={contextRef}
      style={{
        position: "fixed",
        left: contextMenu.x,
        top: contextMenu.y,
        zIndex: 999,
        ...surface,
        padding: "6px 0",
        minWidth: 180,
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      }}
      onClick={e => e.stopPropagation()}
    >
      {items.map(item => (
        <ContextMenuItem
          key={item.label}
          label={item.label}
          onClick={item.action}
          danger={item.danger}
        />
      ))}
    </div>
  );
}
