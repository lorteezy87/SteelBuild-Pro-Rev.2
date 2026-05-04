/**
 * ZonePanel — extracted pure helpers.
 *
 *   buildRfiDrawingReference(zone, sheet)  → string
 *   formatRelative(iso)                    → string
 *   describeActivity(activityRow)          → { color, title, subtitle }
 *
 * Pulled out of ZonePanel.jsx unchanged. Pure functions — no React
 * state, no hooks, no service calls. `describeActivity` returns JSX
 * for the status_changed case (colored from/to spans), so this file
 * is .jsx rather than .js.
 */

import React from "react";
import { ACTIVITY_COLOR, STATUS_DOT, RELATIONSHIP_LABEL } from "./zonePanelConstants";
import { LINKABLE_TYPE_LABELS } from "@/lib/drawingHub";

/**
 * Compose the drawing_reference string that pre-fills the RFI form.
 * Format: "S-402 Rev A · Z-003 Level 2 / Grid C-5"
 * Caller passes whichever of sheet_number / sheet_title / revision_code
 * are known; missing pieces are skipped cleanly.
 */
export function buildRfiDrawingReference(zone, sheet) {
  if (!zone) return "";
  const parts = [];
  if (sheet?.sheet_number) {
    parts.push(
      sheet.revision_code
        ? `${sheet.sheet_number} Rev ${sheet.revision_code}`
        : sheet.sheet_number,
    );
  }
  const zoneParts = [zone.zone_key, zone.label && zone.label !== zone.zone_key ? zone.label : null].filter(Boolean).join(" ");
  if (zoneParts) parts.push(zoneParts);
  const refs = [
    zone.level_ref ? `Level ${zone.level_ref}` : null,
    zone.grid_ref  ? `Grid ${zone.grid_ref}`   : null,
    zone.detail_ref ? `Detail ${zone.detail_ref}` : null,
  ].filter(Boolean).join(" / ");
  if (refs) parts.push(refs);
  return parts.join(" · ");
}

// Small relative-time helper, bounded to 30 days before falling back
// to the absolute timestamp. Intentionally inline — this lives with
// its one consumer.
export function formatRelative(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const ms = Date.now() - t;
  if (ms < 30_000) return "just now";
  const m = Math.floor(ms / 60_000); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);      if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);      if (d <= 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function describeActivity(r) {
  const color = ACTIVITY_COLOR[r.event_type] || "#94A3B8";
  const meta  = r.metadata || {};
  switch (r.event_type) {
    case "zone_created":
      return { color, title: `Zone created as ${meta.zone_key || r.to_value || ""}`, subtitle: meta.zone_type && meta.zone_type !== "area" ? `Type: ${meta.zone_type}` : null };
    case "zone_renamed":
      return {
        color,
        title: `Renamed ${r.from_value ? `from "${r.from_value}"` : ""} to "${r.to_value || "(blank)"}"`.trim(),
        subtitle: null,
      };
    case "status_changed": {
      const fromC = STATUS_DOT[r.from_value] || "#94A3B8";
      const toC   = STATUS_DOT[r.to_value]   || "#94A3B8";
      const by    = meta.computed_by === "rule_engine" ? "by rule engine" : "by user";
      return {
        color,
        title: (
          <span>
            Status{" "}
            <span style={{ color: fromC, fontWeight: 700 }}>{r.from_value || "—"}</span>
            {" → "}
            <span style={{ color: toC, fontWeight: 700 }}>{r.to_value || "—"}</span>
          </span>
        ),
        subtitle: meta.reason ? `${by} · ${meta.reason}` : by,
      };
    }
    case "zone_deleted":
      return { color, title: "Zone soft-deleted", subtitle: "Links are preserved but hidden from overlay" };
    case "link_added": {
      const type = LINKABLE_TYPE_LABELS[meta.linked_record_type] || meta.linked_record_type || "record";
      const src  = meta.link_source && meta.link_source !== "manual" ? ` (${meta.link_source})` : "";
      const fromZone = meta.created_from_zone === "true" || meta.created_from_zone === true;
      return {
        color,
        title: `Linked ${type}${src}`,
        subtitle: fromZone ? "Created from this zone" : (meta.link_role && meta.link_role !== "related" ? `Role: ${meta.link_role}` : null),
      };
    }
    case "link_removed": {
      const type = LINKABLE_TYPE_LABELS[meta.linked_record_type] || meta.linked_record_type || "record";
      return { color, title: `Unlinked ${type}`, subtitle: null };
    }
    case "dependency_added": {
      const rel = RELATIONSHIP_LABEL[meta.relationship] || meta.relationship || "linked";
      const side = meta.side === "source" ? "→" : "←";
      const peer = meta.peer_zone_id ? `zone ${String(meta.peer_zone_id).slice(0, 8)}…` : "another zone";
      const subtitle = meta.note ? `Note: ${meta.note}` :
        meta.propagation_weight && Number(meta.propagation_weight) !== 1
          ? `Propagation weight ${Number(meta.propagation_weight).toFixed(2)}`
          : null;
      return { color, title: `Dependency ${side} ${rel} ${peer}`, subtitle };
    }
    case "dependency_removed": {
      const rel = RELATIONSHIP_LABEL[meta.relationship] || meta.relationship || "link";
      return { color, title: `Removed ${rel} dependency`, subtitle: meta.note ? `Was: ${meta.note}` : null };
    }
    default:
      return { color, title: r.event_type, subtitle: null };
  }
}
