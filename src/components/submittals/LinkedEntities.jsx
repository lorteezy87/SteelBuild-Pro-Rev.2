import React, { useState, useMemo } from "react";

/**
 * LinkedEntities — reusable chip-list + picker components for linking
 * RFIs and Schedule Tasks to a submittal.
 *
 * Mirrors the LinkedDrawingSets pattern in Submittals.jsx — chip
 * display with add/remove, using design-system tokens.
 *
 * Exports:
 *   LinkedRFIs   — links RFI records to a submittal
 *   LinkedTasks  — links schedule_task records to a submittal
 */

// ── Shared chip + picker scaffold ───────────────────────────────────
// Both LinkedRFIs and LinkedTasks use the same layout. This internal
// component factors out the common rendering so each export only needs
// to provide label-extraction and display-name configuration.

function LinkedEntityList({
  value = [],
  allItems = [],
  onChange,
  getLabel,
  entityName,
  pickerPlaceholder,
  emptyText,
}) {
  const [picking, setPicking] = useState(false);

  // Index items by id for O(1) chip lookups.
  const byId = useMemo(() => {
    const m = new Map();
    allItems.forEach((item) => m.set(item.id, item));
    return m;
  }, [allItems]);

  // Items available for linking (not already linked).
  const available = useMemo(
    () => allItems.filter((item) => !value.includes(item.id)),
    [allItems, value],
  );

  const remove = (id) => {
    if (!onChange) return;
    onChange(value.filter((v) => v !== id));
  };

  const add = (id) => {
    if (!onChange || !id) return;
    if (value.includes(id)) return;
    onChange([...value, id]);
    setPicking(false);
  };

  return (
    <div>
      {/* Chip list */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
        {value.length === 0 && (
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--text-muted)",
            fontStyle: "italic",
          }}>
            {emptyText || `No ${entityName}s linked.`}
          </span>
        )}
        {value.map((id) => {
          const item = byId.get(id);
          const label = item ? getLabel(item) : `(missing ${entityName})`;
          return (
            <span
              key={id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 4px 3px 10px",
                borderRadius: 999,
                background: item ? "var(--accent-muted)" : "var(--bg-surface-high)",
                color: item ? "var(--accent)" : "var(--text-muted)",
                border: item ? "1px solid var(--accent)" : "1px dashed var(--border-default)",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.05em",
                maxWidth: 360,
              }}
              title={label}
            >
              <span style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {label}
              </span>
              <button
                onClick={() => remove(id)}
                title={`Unlink this ${entityName}`}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "inherit",
                  padding: "0 4px",
                  fontSize: 12,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </span>
          );
        })}
      </div>

      {/* Picker */}
      {picking ? (
        <select
          autoFocus
          defaultValue=""
          onChange={(e) => add(e.target.value)}
          onBlur={() => setPicking(false)}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            padding: "4px 8px",
            background: "var(--bg-input, var(--bg-surface-low))",
            border: "1px solid var(--accent)",
            borderRadius: 3,
            color: "var(--text-primary)",
            outline: "none",
            maxWidth: "100%",
          }}
        >
          <option value="">{pickerPlaceholder || `-- pick a ${entityName} --`}</option>
          {available.length === 0 && (
            <option disabled value="__none">
              No more {entityName}s to link
            </option>
          )}
          {available.map((item) => (
            <option key={item.id} value={item.id}>
              {getLabel(item)}
            </option>
          ))}
        </select>
      ) : (
        <button
          onClick={() => setPicking(true)}
          disabled={available.length === 0}
          title={available.length === 0
            ? `All ${entityName}s are already linked`
            : `Link a ${entityName} to this submittal`}
          style={{
            padding: "4px 10px",
            borderRadius: 3,
            background: "transparent",
            border: "1px dashed var(--border-default)",
            color: available.length === 0 ? "var(--text-muted)" : "var(--accent)",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.08em",
            cursor: available.length === 0 ? "not-allowed" : "pointer",
            textTransform: "uppercase",
          }}
        >
          + Link {entityName}
        </button>
      )}
    </div>
  );
}

// ── LinkedRFIs ──────────────────────────────────────────────────────

/**
 * Props:
 *   value    — uuid[] of linked RFI IDs
 *   allRfis  — full array of RFI records for the project
 *   onChange — callback(newUuidArray)
 */
export function LinkedRFIs({ value = [], allRfis = [], onChange }) {
  return (
    <LinkedEntityList
      value={value}
      allItems={allRfis}
      onChange={onChange}
      entityName="RFI"
      emptyText="No RFIs linked."
      pickerPlaceholder="-- pick an RFI --"
      getLabel={(rfi) => {
        const num = rfi.rfi_number || rfi.number || "";
        const title = rfi.title || rfi.subject || "";
        if (num && title) return `${num} — ${title}`;
        return num || title || "(untitled RFI)";
      }}
    />
  );
}

// ── LinkedTasks ─────────────────────────────────────────────────────

/**
 * Props:
 *   value    — uuid[] of linked schedule_task IDs
 *   allTasks — full array of schedule_task records for the project
 *   onChange — callback(newUuidArray)
 */
export function LinkedTasks({ value = [], allTasks = [], onChange }) {
  return (
    <LinkedEntityList
      value={value}
      allItems={allTasks}
      onChange={onChange}
      entityName="task"
      emptyText="No tasks linked."
      pickerPlaceholder="-- pick a task --"
      getLabel={(task) => {
        const name = task.task_name || task.name || task.title || "";
        const phase = task.phase || "";
        if (name && phase) return `${phase} — ${name}`;
        return name || "(unnamed task)";
      }}
    />
  );
}
