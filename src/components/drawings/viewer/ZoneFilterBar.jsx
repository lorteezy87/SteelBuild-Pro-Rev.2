/**
 * ZoneFilterBar — compact filter strip for the Drawing Viewer zone overlay.
 *
 * Floats underneath the OFF/VIEW/DRAW toggle when zones are visible.
 * Lets the user narrow what's rendered on the canvas without leaving
 * the drawing:
 *
 *   - Status chips:  red / amber / purple / blue / green / neutral
 *                    (toggle individual chips; "Heads-up only"
 *                    preset flips to red+amber+purple in one click)
 *   - Type dropdown: area / detail / bay / erection_zone / delivery_zone /
 *                    inspection_zone / member_group
 *
 * All state is lifted — ZoneFilterBar is a pure render over the
 * filter object passed in, emits changes via onChange(). The
 * DrawingViewer owns the state and applies the filter to
 * zonesWithComputed before handing the subset to ZoneLayer.
 */

import React from "react";

const STATUS_COLOR = {
  red:     "#EF4444",
  amber:   "#F59E0B",
  purple:  "#8B5CF6",
  blue:    "#3B82F6",
  green:   "#22C55E",
  neutral: "#94A3B8",
};

const STATUS_ORDER = ["red", "amber", "purple", "blue", "green", "neutral"];

// ZONE_TYPES mirrors the drawing_zones.zone_type CHECK constraint. Kept
// short so the dropdown stays compact; "area" is the MVP default so
// users who don't care about sub-types see everything by default.
const ZONE_TYPES = [
  { key: "all",             label: "All types" },
  { key: "area",            label: "Area" },
  { key: "detail",          label: "Detail" },
  { key: "bay",             label: "Bay" },
  { key: "erection_zone",   label: "Erection zone" },
  { key: "delivery_zone",   label: "Delivery zone" },
  { key: "inspection_zone", label: "Inspection zone" },
  { key: "member_group",    label: "Member group" },
];

const HEADSUP_SET = new Set(["red", "amber", "purple"]);

export default function ZoneFilterBar({
  // filter = { statusSet: Set<string>, typeKey: string }
  filter,
  onChange,
  statusCounts = {}, // { red: 3, amber: 1, ... } — displayed on chips
  totalVisible,      // how many zones remain after filtering
  totalAll,          // total zones on this revision (pre-filter)
}) {
  if (!filter) return null;
  const statusSet = filter.statusSet || new Set();
  const typeKey   = filter.typeKey || "all";

  const toggleStatus = (s) => {
    const next = new Set(statusSet);
    if (next.has(s)) next.delete(s); else next.add(s);
    onChange({ ...filter, statusSet: next });
  };

  const applyHeadsUp = () => onChange({ ...filter, statusSet: new Set(HEADSUP_SET) });
  const clearAll     = () => onChange({ ...filter, statusSet: new Set(), typeKey: "all" });

  // "No filter" = empty statusSet means "show all"; the chips render
  // greyed out to reflect "no constraint". Clicking any chip flips
  // into "only this status" mode.
  const anyStatusActive = statusSet.size > 0;
  const typeActive = typeKey !== "all";
  const anyFilter  = anyStatusActive || typeActive;

  return (
    <div
      style={{
        position: "absolute",
        top: 54,  // sits immediately below the OFF/VIEW/DRAW toggle
        right: 12,
        zIndex: 39,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: 6,
        borderRadius: 6,
        background: "rgba(15,17,24,0.72)",
        border: "1px solid var(--border-default)",
        backdropFilter: "blur(6px)",
        fontFamily: "var(--font-mono)",
        minWidth: 320,
      }}
    >
      {/* Row 1: status chips */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", marginRight: 4 }}>
          Show
        </span>
        {STATUS_ORDER.map((s) => {
          const on = statusSet.has(s);
          const n  = statusCounts[s] || 0;
          const dim = anyStatusActive && !on;
          return (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              title={`${s} (${n})`}
              style={{
                padding: "3px 7px",
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                background: on
                  ? `color-mix(in srgb, ${STATUS_COLOR[s]} 22%, transparent)`
                  : "transparent",
                border: `1px solid ${on ? STATUS_COLOR[s] : "var(--divider)"}`,
                color: dim ? "var(--text-muted)" : STATUS_COLOR[s],
                borderRadius: 3,
                cursor: "pointer",
                opacity: dim ? 0.55 : 1,
              }}
            >
              {s} {n > 0 && <span style={{ opacity: 0.6 }}>· {n}</span>}
            </button>
          );
        })}
        <button
          onClick={applyHeadsUp}
          title="Red + amber + purple only — the stuff that needs attention"
          style={{
            padding: "3px 7px",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            background: "transparent",
            border: "1px dashed var(--accent)",
            color: "var(--accent)",
            borderRadius: 3,
            cursor: "pointer",
            marginLeft: 4,
          }}
        >
          Heads-up
        </button>
      </div>

      {/* Row 2: type selector + clear */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <select
          value={typeKey}
          onChange={(e) => onChange({ ...filter, typeKey: e.target.value })}
          title="Filter by zone type"
          style={{
            padding: "3px 6px",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            background: typeActive ? "color-mix(in srgb, var(--accent) 14%, transparent)" : "transparent",
            color: typeActive ? "var(--accent)" : "var(--text-muted)",
            border: `1px solid ${typeActive ? "var(--accent)" : "var(--divider)"}`,
            borderRadius: 3,
            cursor: "pointer",
            flex: 1,
          }}
        >
          {ZONE_TYPES.map((t) => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </select>
        <span style={{ fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em" }}>
          {typeof totalVisible === "number" && typeof totalAll === "number"
            ? `${totalVisible}/${totalAll}`
            : null}
        </span>
        {anyFilter && (
          <button
            onClick={clearAll}
            title="Clear all filters"
            style={{
              padding: "3px 6px",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              background: "transparent",
              color: "var(--text-muted)",
              border: "1px solid var(--divider)",
              borderRadius: 3,
              cursor: "pointer",
            }}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
