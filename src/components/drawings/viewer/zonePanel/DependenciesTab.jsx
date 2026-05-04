/**
 * DependenciesTab — extracted from ZonePanel.jsx (V3.1).
 *
 * Two semantic groups:
 *   "Blocking this zone"  — incoming `blocks` edges (someone says this
 *                            zone is blocked by them) + outgoing
 *                            `depends_on` edges (this zone depends on
 *                            someone else)
 *   "Blocked by this zone" — outgoing `blocks` (this zone blocks others)
 *                             + incoming `depends_on` (others depend
 *                             on this zone)
 *   "Related"              — `relates_to` edges, both directions
 *
 * Each row shows: peer zone label, sheet badge ("S-202" or "this
 * sheet"), relationship pill, propagation-weight chip (only when not
 * 1.0), note tooltip, peer status indicator, remove button. Cross-
 * sheet rows show a "→ Sheet X" pill and click navigates the viewer
 * when onSheetNavigate is provided.
 *
 * Co-located with DependencyGroup + DependencyRow because the three
 * components are tightly bound — extracting one without the others
 * just spreads the logic across more files.
 */

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { Trash2, Link2, ArrowRight } from "lucide-react";
import { removeZoneDependency } from "@/lib/drawingHub";
import {
  mono,
  STATUS_COLOR,
  RELATIONSHIP_COLOR,
  RELATIONSHIP_LABEL,
} from "./zonePanelConstants";
import { AddDependencyModal } from "./AddDependencyModal";

export function DependenciesTab({
  zone,
  currentSheetDrawingId,
  dependencies,
  dependencyImpact,
  userId,
  onSheetNavigate,
  onAdded,
  onRemoved,
}) {
  const [addOpen, setAddOpen] = useState(false);

  // Partition the edges from THIS zone's vantage point into the three
  // semantic groups described above. We tag each row with peer + the
  // direction the user reads it from so the row component doesn't
  // need to re-derive it.
  const { blocking, blockedBy, related } = useMemo(() => {
    const blocking = [];
    const blockedBy = [];
    const related = [];
    for (const d of dependencies) {
      const isOutgoing = d.source_zone_id === zone.id;
      const peer = isOutgoing ? d.__target : d.__source;
      const row = { dep: d, peer, isOutgoing };
      if (d.relationship === "relates_to") {
        related.push(row);
      } else if (d.relationship === "blocks") {
        // Outgoing blocks: this blocks peer.   → blockedBy (peer is downstream)
        // Incoming blocks: peer blocks this.   → blocking  (peer is upstream)
        if (isOutgoing) blockedBy.push(row);
        else            blocking.push(row);
      } else if (d.relationship === "depends_on") {
        // Outgoing depends_on: this depends on peer. → blocking (peer is upstream)
        // Incoming depends_on: peer depends on this. → blockedBy (peer is downstream)
        if (isOutgoing) blocking.push(row);
        else            blockedBy.push(row);
      }
    }
    return { blocking, blockedBy, related };
  }, [dependencies, zone.id]);

  const handleRemove = async (depId) => {
    if (!window.confirm("Remove this dependency? Activity history is preserved.")) return;
    try {
      await removeZoneDependency(depId, { userId: userId || null });
      toast.success("Dependency removed");
      await onRemoved?.();
    } catch (err) {
      toast.error(`Remove failed: ${err?.message || "unknown"}`);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header + add button */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          {dependencies.length} active dependenc{dependencies.length === 1 ? "y" : "ies"}
        </div>
        <button
          onClick={() => setAddOpen(true)}
          style={{
            ...mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
            padding: "4px 10px",
            background: "var(--accent)",
            color: "#000",
            border: "none",
            borderRadius: 3,
            cursor: "pointer",
            display: "inline-flex", alignItems: "center", gap: 4,
          }}
        >
          <Link2 size={11} /> Add dependency
        </button>
      </div>

      {/* Drag summary banner — only when this zone is being dragged
          by upstream activity. Echoes what ReadinessRing tooltips
          show but as a panel-level explanation. */}
      {dependencyImpact && dependencyImpact.drag > 0 && (
        <div
          style={{
            padding: "8px 10px",
            background: "color-mix(in srgb, #EF4444 8%, var(--bg-page))",
            border: "1px solid #EF4444",
            borderRadius: 3,
          }}
        >
          <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: "#EF4444", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
            Upstream drag · -{Math.round(dependencyImpact.drag * 100)}%
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            {(dependencyImpact.contributors || []).slice(0, 5).map((c, i) => (
              <li key={i} style={{ ...mono, fontSize: 10, color: "var(--text-primary)", lineHeight: 1.4 }}>
                · {c.zoneLabel || "zone"} · {RELATIONSHIP_LABEL[c.relationship] || c.relationship} · -{Math.round(c.contribution * 100)}%
              </li>
            ))}
          </ul>
        </div>
      )}

      <DependencyGroup
        title="Blocking this zone"
        emptyHint="Nothing upstream is gating this zone."
        rows={blocking}
        zoneId={zone.id}
        currentSheetDrawingId={currentSheetDrawingId}
        onSheetNavigate={onSheetNavigate}
        onRemove={handleRemove}
      />
      <DependencyGroup
        title="Blocked by this zone"
        emptyHint="No downstream zones are gated by this one."
        rows={blockedBy}
        zoneId={zone.id}
        currentSheetDrawingId={currentSheetDrawingId}
        onSheetNavigate={onSheetNavigate}
        onRemove={handleRemove}
      />
      <DependencyGroup
        title="Related"
        emptyHint="No informational related-to edges."
        rows={related}
        zoneId={zone.id}
        currentSheetDrawingId={currentSheetDrawingId}
        onSheetNavigate={onSheetNavigate}
        onRemove={handleRemove}
      />

      {addOpen && (
        <AddDependencyModal
          zone={zone}
          existingDependencies={dependencies}
          userId={userId || null}
          onClose={() => setAddOpen(false)}
          onSaved={async () => {
            setAddOpen(false);
            await onAdded?.();
          }}
        />
      )}
    </div>
  );
}

function DependencyGroup({
  title,
  emptyHint,
  rows,
  zoneId,
  currentSheetDrawingId,
  onSheetNavigate,
  onRemove,
}) {
  return (
    <div>
      <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
        {title} · {rows.length}
      </div>
      {rows.length === 0 ? (
        <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", padding: "6px 0", fontStyle: "italic" }}>
          {emptyHint}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {rows.map((r) => (
            <DependencyRow
              key={r.dep.id}
              dep={r.dep}
              peer={r.peer}
              isOutgoing={r.isOutgoing}
              currentSheetDrawingId={currentSheetDrawingId}
              onSheetNavigate={onSheetNavigate}
              onRemove={() => onRemove(r.dep.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DependencyRow({
  dep,
  peer,
  isOutgoing,
  currentSheetDrawingId,
  onSheetNavigate,
  onRemove,
}) {
  const isCrossSheet = peer && peer.drawing_id && peer.drawing_id !== currentSheetDrawingId;
  const sheetBadge = isCrossSheet
    ? (peer.sheet_number ? `→ ${peer.sheet_number}` : "→ other sheet")
    : "this sheet";
  const relColor = RELATIONSHIP_COLOR[dep.relationship] || "#94A3B8";
  const relLabel = RELATIONSHIP_LABEL[dep.relationship] || dep.relationship;
  const peerStatus = peer?.status || "neutral";
  const peerStatusColor = STATUS_COLOR[peerStatus] || STATUS_COLOR.neutral;
  const weight = Number(dep.propagation_weight ?? 1);
  const showWeight = Math.abs(weight - 1.0) > 0.001;

  const clickable = isCrossSheet && peer?.drawing_id && typeof onSheetNavigate === "function";
  const onRowClick = () => {
    if (clickable) onSheetNavigate(peer.drawing_id);
  };

  return (
    <div
      onClick={onRowClick}
      title={dep.note || ""}
      style={{
        padding: "8px 10px",
        background: "var(--bg-page)",
        border: "1px solid var(--border-default)",
        borderRadius: 3,
        display: "flex",
        alignItems: "center",
        gap: 8,
        cursor: clickable ? "pointer" : "default",
      }}
    >
      {/* Peer status dot */}
      <div
        style={{
          width: 8, height: 8, borderRadius: 4,
          background: peerStatusColor, flex: "0 0 auto",
        }}
        title={`Peer status: ${peerStatus}`}
      />

      {/* Direction arrow + peer label */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
          <ArrowRight
            size={11}
            style={{
              color: "var(--text-muted)",
              transform: isOutgoing ? "none" : "rotate(180deg)",
              flex: "0 0 auto",
            }}
            aria-label={isOutgoing ? "outgoing" : "incoming"}
          />
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis" }}>
            {peer ? (peer.label || peer.zone_key || "(zone)") : "(missing zone)"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
          <span
            style={{
              ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase",
              padding: "1px 6px",
              background: `color-mix(in srgb, ${relColor} 14%, transparent)`,
              color: relColor,
              border: `1px solid ${relColor}`,
              borderRadius: 2,
            }}
          >
            {relLabel}
          </span>
          <span
            style={{
              ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
              padding: "1px 6px",
              background: isCrossSheet ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "transparent",
              color: isCrossSheet ? "var(--accent)" : "var(--text-muted)",
              border: `1px solid ${isCrossSheet ? "var(--accent)" : "var(--divider)"}`,
              borderRadius: 2,
            }}
          >
            {sheetBadge}
          </span>
          {showWeight && (
            <span
              title={`Propagation weight ${weight.toFixed(2)}`}
              style={{
                ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                padding: "1px 6px",
                background: "var(--bg-surface-low)",
                color: "var(--text-muted)",
                border: "1px solid var(--divider)",
                borderRadius: 2,
              }}
            >
              w{weight.toFixed(2)}
            </span>
          )}
          {dep.note && (
            <span
              title={dep.note}
              style={{
                ...mono, fontSize: 9, color: "var(--text-muted)", fontStyle: "italic",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                maxWidth: 160,
              }}
            >
              "{dep.note}"
            </span>
          )}
        </div>
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); onRemove?.(); }}
        title="Remove dependency"
        aria-label="Remove dependency"
        style={{
          background: "transparent",
          border: "none",
          color: "var(--text-muted)",
          cursor: "pointer",
          padding: 4,
          flex: "0 0 auto",
        }}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

export default DependenciesTab;
