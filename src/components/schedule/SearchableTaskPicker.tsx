import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  drawerBorder,
  drawerControlStyle,
  drawerMutedBorder,
  drawerMutedText,
  drawerPanelStrong,
  drawerText,
} from "./taskDetailTokens";

export type PickerTask = {
  id: string;
  task_name?: string | null;
  wbs_code?: string | null;
  phase?: string | null;
};

type SearchableTaskPickerProps = {
  tasks: PickerTask[];
  onSelect: (taskId: string) => void;
  placeholder?: string;
  /**
   * Turns the picker into a single-value field: the chosen task is shown as a
   * clearable chip instead of the search box.
   *
   * Passing `value` (even as null) is what distinguishes the two modes. Without
   * it the picker keeps its original "add another one" behaviour — the search
   * box stays, and it hides itself when there is nothing to pick.
   */
  value?: string | null;
  /** Called with null when the user clears the selection. Value mode only. */
  onClear?: () => void;
  /** Shown in the chip when `value` names a task that no longer exists. */
  missingLabel?: string;
};

/**
 * Searchable task picker — replaces the plain <select> for choosing a parent,
 * a predecessor, or a successor. Filters by name, WBS code or phase as the user
 * types. Keyboard-navigable (↑ ↓ Enter Escape).
 *
 * Audit §4.1. Both add paths used a flat `<select>` listing every task on the
 * project — unsearchable, and unusable on the live schedules this is for: 427
 * options in one dropdown, ordered by whatever the query returned.
 */
export default function SearchableTaskPicker({
  tasks,
  onSelect,
  placeholder = "+ Search tasks...",
  value,
  onClear,
  missingLabel = "(task no longer exists)",
}: SearchableTaskPickerProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return tasks.slice(0, 50);
    const q = query.toLowerCase();
    return tasks
      .filter((t) => {
        const name = (t.task_name || "").toLowerCase();
        const wbs = (t.wbs_code || "").toLowerCase();
        const phase = (t.phase || "").toLowerCase();
        return name.includes(q) || wbs.includes(q) || phase.includes(q);
      })
      .slice(0, 50);
  }, [tasks, query]);

  useEffect(() => {
    setHighlightIdx(0);
  }, [filtered.length, query]);

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.children[highlightIdx] as HTMLElement | undefined;
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [highlightIdx]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  const handleSelect = useCallback(
    (t: PickerTask) => {
      onSelect(t.id);
      setQuery("");
      setIsOpen(false);
      setHighlightIdx(0);
    },
    [onSelect],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && (e.key === "ArrowDown" || e.key === "Enter")) {
      setIsOpen(true);
      e.preventDefault();
      return;
    }
    if (!isOpen) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightIdx((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (filtered[highlightIdx]) handleSelect(filtered[highlightIdx]);
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        break;
      default:
        break;
    }
  };

  const isValueMode = value !== undefined;
  const selected = isValueMode && value ? tasks.find((t) => t.id === value) : undefined;

  // The original behaviour: nothing to pick, so don't offer the control. Only
  // in add mode — a value-mode field must keep rendering, or clearing the last
  // task on a project would make the parent field vanish along with its value.
  if (tasks.length === 0 && !isValueMode) return null;

  if (isValueMode && value) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 8,
          padding: "6px 8px",
          background: drawerPanelStrong,
          border: `1px solid ${drawerBorder}`,
          borderRadius: 6,
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            fontWeight: 600,
            color: "var(--accent)",
            flexShrink: 0,
          }}
        >
          {selected?.wbs_code || "—"}
        </span>
        <span
          title={selected?.task_name || missingLabel}
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 11,
            color: selected ? drawerText : drawerMutedText,
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontStyle: selected ? "normal" : "italic",
          }}
        >
          {selected?.task_name || missingLabel}
        </span>
        <button
          type="button"
          onClick={() => onClear?.()}
          title="Clear"
          style={{
            background: "none",
            border: "none",
            color: drawerMutedText,
            cursor: "pointer",
            fontSize: 12,
            lineHeight: 1,
            padding: 2,
            flexShrink: 0,
          }}
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} style={{ position: "relative", marginTop: 8 }}>
      <div style={{ position: "relative" }}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          style={{
            ...drawerControlStyle,
            paddingLeft: 30,
            fontSize: 11,
          }}
        />
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke={drawerMutedText}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            position: "absolute",
            left: 10,
            top: "50%",
            transform: "translateY(-50%)",
            pointerEvents: "none",
          }}
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </div>

      {isOpen && (
        <div
          ref={listRef}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "100%",
            marginTop: 4,
            background: "var(--bg-elevated)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: `1px solid ${drawerBorder}`,
            borderRadius: 8,
            maxHeight: 220,
            overflowY: "auto",
            zIndex: 100,
            boxShadow: "var(--shadow-lg)",
          }}
        >
          {filtered.length === 0 ? (
            <div
              style={{
                padding: "12px 14px",
                textAlign: "center",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: drawerMutedText,
                letterSpacing: "0.06em",
              }}
            >
              No matching tasks
            </div>
          ) : (
            filtered.map((t, idx) => (
              <div
                key={t.id}
                onClick={() => handleSelect(t)}
                onMouseEnter={() => setHighlightIdx(idx)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 12px",
                  cursor: "pointer",
                  background: idx === highlightIdx ? drawerPanelStrong : "transparent",
                  borderBottom:
                    idx < filtered.length - 1 ? `1px solid ${drawerMutedBorder}` : "none",
                  transition: "background 0.08s",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 8,
                    fontWeight: 600,
                    color: "var(--accent)",
                    flexShrink: 0,
                    minWidth: 48,
                    textAlign: "right",
                  }}
                >
                  {t.wbs_code || "—"}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 11,
                    color: idx === highlightIdx ? drawerText : drawerMutedText,
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {t.task_name}
                </span>
                {t.phase && (
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 7,
                      fontWeight: 600,
                      color: drawerMutedText,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      flexShrink: 0,
                    }}
                  >
                    {t.phase}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
