import { useMemo, useState } from "react";
import {
  formatDrawingSetNumber,
  sortDrawingSetPackages,
} from "@/lib/drawingSetOrdering";
import type { DrawingSet } from "./types";

interface LinkedDrawingSetsProps {
  value?: string[];
  allSets?: DrawingSet[];
  onChange?: (next: string[]) => void;
}

export function LinkedDrawingSets({
  value = [],
  allSets = [],
  onChange,
}: LinkedDrawingSetsProps) {
  const [picking, setPicking] = useState(false);
  const setsById = useMemo(() => {
    const map = new Map<string, DrawingSet>();
    allSets.forEach((set) => {
      if (set.id) map.set(set.id, set);
    });
    return map;
  }, [allSets]);
  const available = useMemo(
    () =>
      sortDrawingSetPackages(
        allSets.filter(
          (set) => !value.includes(set.id as string) && !set.is_deleted,
        ),
      ),
    [allSets, value],
  );

  const remove = (id: string) => {
    if (!onChange) return;
    onChange(value.filter((entry) => entry !== id));
  };
  const add = (id: string) => {
    if (!onChange || !id || value.includes(id)) return;
    onChange([...value, id]);
    setPicking(false);
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          marginBottom: 6,
        }}
      >
        {value.length === 0 && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--text-muted)",
              fontStyle: "italic",
            }}
          >
            No drawing sets linked.
          </span>
        )}
        {value.map((id) => {
          const set = setsById.get(id);
          const label = set
            ? `Set # ${formatDrawingSetNumber(set)} · ${
                set.set_name || "(unnamed set)"
              }${set.revision ? ` · R${set.revision}` : ""}`
            : "(missing set)";
          return (
            <span
              key={id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 4px 3px 10px",
                borderRadius: 999,
                background: set
                  ? "var(--accent-muted)"
                  : "var(--bg-surface-high)",
                color: set ? "var(--accent)" : "var(--text-muted)",
                border: set
                  ? "1px solid var(--accent)"
                  : "1px dashed var(--border-default)",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.05em",
                maxWidth: 360,
              }}
              title={set?.discipline ? `${label} · ${set.discipline}` : label}
            >
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </span>
              <button
                onClick={() => remove(id)}
                title="Unlink this drawing set"
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

      {picking ? (
        <select
          autoFocus
          defaultValue=""
          onChange={(event) => add(event.target.value)}
          onBlur={() => setPicking(false)}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            padding: "4px 8px",
            background: "var(--bg-input)",
            border: "1px solid var(--accent)",
            borderRadius: 3,
            color: "var(--text-primary)",
            outline: "none",
            maxWidth: "100%",
          }}
        >
          <option value="">— pick a drawing set —</option>
          {available.length === 0 && (
            <option disabled value="__none">
              No more sets to link
            </option>
          )}
          {available.map((set) => (
            <option key={set.id} value={set.id}>
              {`Set # ${formatDrawingSetNumber(set)} · ${
                set.set_name || "(unnamed set)"
              }${set.revision ? ` · R${set.revision}` : ""}`}
              {set.discipline ? ` · ${set.discipline}` : ""}
            </option>
          ))}
        </select>
      ) : (
        <button
          onClick={() => setPicking(true)}
          disabled={available.length === 0}
          title={
            available.length === 0
              ? "All project drawing sets are already linked"
              : "Link a drawing set to this submittal"
          }
          style={{
            padding: "4px 10px",
            borderRadius: 3,
            background: "transparent",
            border: "1px dashed var(--border-default)",
            color:
              available.length === 0
                ? "var(--text-muted)"
                : "var(--accent)",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.08em",
            cursor: available.length === 0 ? "not-allowed" : "pointer",
            textTransform: "uppercase",
          }}
        >
          + Link drawing set
        </button>
      )}
    </div>
  );
}
