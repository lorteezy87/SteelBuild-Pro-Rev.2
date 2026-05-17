/**
 * AddDependencyModal — extracted from ZonePanel.jsx (V3.1).
 *
 * Picker for a target zone (anywhere in the same project, with sheet
 * labels), relationship select, propagation weight slider, optional
 * note. Submits via addZoneDependency() and closes on success.
 */

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, Search, Check } from "lucide-react";
import {
  addZoneDependency,
  DEPENDENCY_RELATIONSHIPS,
} from "@/lib/drawingHub";
import { supabase } from "@/lib/supabase";
import {
  mono,
  display,
  STATUS_COLOR,
  RELATIONSHIP_COLOR,
  RELATIONSHIP_LABEL,
} from "./zonePanelConstants";

export function AddDependencyModal({ zone, existingDependencies, userId, onClose, onSaved }) {
  const [relationship, setRelationship] = useState("blocks");
  const [weight, setWeight]             = useState(1.0);
  const [note, setNote]                 = useState("");
  const [targetZoneId, setTargetZoneId] = useState("");
  const [scope, setScope]               = useState("project"); // "project" | "sheet"
  const [search, setSearch]             = useState("");
  const [saving, setSaving]             = useState(false);

  // Pull every zone in the project (with sheet metadata) so the user
  // can pick across sheets. Cap is generous because a single project
  // rarely exceeds 200 zones in practice; if it does, the search
  // input narrows quickly.
  const { data: projectZones = [], isFetching } = useQuery({
    queryKey: ["zone-dep-targets", zone?.project_id],
    queryFn: async () => {
      if (!zone?.project_id) return [];
      const { data: zones, error } = await supabase
        .from("drawing_zones")
        .select("id, project_id, drawing_id, zone_key, label, status, x_min, y_min, x_max, y_max")
        .eq("project_id", zone.project_id)
        .eq("is_active", true)
        .is("deleted_at", null)
        .neq("id", zone.id)
        .limit(500);
      if (error) throw error;
      const drawingIds = [...new Set((zones || []).map((z) => z.drawing_id).filter(Boolean))];
      let drawingsById = new Map();
      if (drawingIds.length > 0) {
        const { data: dRows, error: dErr } = await supabase
          .from("drawings")
          .select("id, sheet_number, title")
          .in("id", drawingIds);
        if (dErr) throw dErr;
        drawingsById = new Map((dRows || []).map((d) => [d.id, d]));
      }
      return (zones || []).map((z) => ({
        ...z,
        sheet_number: drawingsById.get(z.drawing_id)?.sheet_number || null,
        sheet_title:  drawingsById.get(z.drawing_id)?.title || null,
      }));
    },
    enabled: !!zone?.project_id,
    staleTime: 60 * 1000,
  });

  // Existing edges for THIS zone — used to grey out targets that would
  // violate the partial unique index (active edge with same source +
  // target + relationship). The DB will reject either way; surfacing
  // it in the UI keeps the user from a confusing toast.
  const blockedTargetIds = useMemo(() => {
    const s = new Set();
    for (const d of existingDependencies || []) {
      if (!d || d.removed_at) continue;
      if (d.source_zone_id !== zone.id) continue;
      if (d.relationship !== relationship) continue;
      s.add(d.target_zone_id);
    }
    return s;
  }, [existingDependencies, zone.id, relationship]);

  const filtered = useMemo(() => {
    let list = projectZones;
    if (scope === "sheet") {
      list = list.filter((z) => z.drawing_id === zone.drawing_id);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((z) => {
        const hay = [z.label, z.zone_key, z.sheet_number, z.sheet_title]
          .filter(Boolean).join(" ").toLowerCase();
        return hay.includes(q);
      });
    }
    return list;
  }, [projectZones, search, scope, zone.drawing_id]);

  const handleSave = async () => {
    if (!targetZoneId) {
      toast.error("Pick a target zone first.");
      return;
    }
    if (blockedTargetIds.has(targetZoneId)) {
      toast.error(`A "${RELATIONSHIP_LABEL[relationship]}" edge to this zone already exists.`);
      return;
    }
    setSaving(true);
    try {
      await addZoneDependency({
        projectId:         zone.project_id,
        sourceZoneId:      zone.id,
        targetZoneId,
        relationship,
        propagationWeight: Number(weight),
        note:              note.trim() || null,
        userId:            userId || null,
      });
      toast.success("Dependency added");
      await onSaved?.();
    } catch (err) {
      toast.error(`Add failed: ${err?.message || "unknown"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1200 }} />
      <div
        className="sbd-card-strong"
        style={{
          position: "fixed",
          top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: 540, maxWidth: "92vw", maxHeight: "84vh",
          zIndex: 1201,
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          padding: 0,
        }}
      >
        <header style={{ padding: "14px 18px", borderBottom: "1px solid var(--divider)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)" }}>
              Add dependency from {zone.zone_key}
            </div>
            <div style={{ ...display, fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginTop: 2 }}>
              Pick a target zone + relationship
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
            <X size={18} />
          </button>
        </header>

        {/* Relationship + weight controls */}
        <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--divider)", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 6 }}>
            {DEPENDENCY_RELATIONSHIPS.map((r) => {
              const active = relationship === r;
              const c = RELATIONSHIP_COLOR[r];
              return (
                <button
                  key={r}
                  onClick={() => setRelationship(r)}
                  style={{
                    ...mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                    padding: "4px 10px",
                    background: active ? `color-mix(in srgb, ${c} 16%, transparent)` : "transparent",
                    color: active ? c : "var(--text-muted)",
                    border: `1px solid ${active ? c : "var(--divider)"}`,
                    borderRadius: 3,
                    cursor: "pointer",
                  }}
                >
                  {RELATIONSHIP_LABEL[r]}
                </button>
              );
            })}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ ...mono, fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", minWidth: 96 }}>
              Propagation
            </span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={weight}
              onChange={(e) => setWeight(Number(e.target.value))}
              disabled={relationship === "relates_to"}
              title={relationship === "relates_to" ? "relates_to is informational; propagation does not apply" : "0 = informational only · 1.0 = default · up to 2.0 for hard blockers"}
              style={{ flex: 1 }}
            />
            <span style={{ ...mono, fontSize: 11, color: "var(--text-primary)", minWidth: 36, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
              {Number(weight).toFixed(2)}
            </span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder='Note (optional, e.g. "MR-12 must be rough-set before this connection can erect")'
            rows={2}
            style={{
              ...mono, fontSize: 11,
              background: "var(--bg-input)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
              borderRadius: 3,
              padding: "6px 8px",
              resize: "vertical",
            }}
          />
        </div>

        {/* Scope toggle + search */}
        <div style={{ padding: "10px 18px", borderBottom: "1px solid var(--divider)", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", gap: 4 }}>
            {[
              { id: "project", label: "All sheets" },
              { id: "sheet",   label: "This sheet" },
            ].map((opt) => {
              const active = scope === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => setScope(opt.id)}
                  style={{
                    ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                    padding: "4px 8px",
                    background: active ? "var(--accent)" : "transparent",
                    color: active ? "#000" : "var(--text-muted)",
                    border: `1px solid ${active ? "var(--accent)" : "var(--divider)"}`,
                    borderRadius: 3,
                    cursor: "pointer",
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <div style={{ position: "relative", flex: 1 }}>
            <Search size={13} style={{ position: "absolute", top: "50%", left: 8, transform: "translateY(-50%)", color: "var(--text-muted)" }} />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search zones by label, key, or sheet…"
              style={{
                ...mono, fontSize: 11,
                width: "100%",
                background: "var(--bg-input)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-default)",
                borderRadius: 3,
                padding: "5px 8px 5px 26px",
              }}
            />
          </div>
        </div>

        {/* Zone list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
          {isFetching && (
            <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", padding: "10px 6px" }}>Loading zones…</div>
          )}
          {!isFetching && filtered.length === 0 && (
            <div style={{ ...mono, fontSize: 11, color: "var(--text-muted)", padding: "10px 6px", fontStyle: "italic" }}>
              No matching zones.
            </div>
          )}
          {filtered.map((z) => {
            const isSelected = z.id === targetZoneId;
            const isBlocked  = blockedTargetIds.has(z.id);
            const isCross    = z.drawing_id !== zone.drawing_id;
            return (
              <button
                key={z.id}
                disabled={isBlocked}
                onClick={() => setTargetZoneId(z.id)}
                title={isBlocked ? `Already a ${relationship} dependency to this zone` : ""}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  width: "100%",
                  padding: "8px 10px",
                  marginBottom: 4,
                  background: isSelected ? "color-mix(in srgb, var(--accent) 18%, var(--bg-page))" : "var(--bg-page)",
                  border: `1px solid ${isSelected ? "var(--accent)" : "var(--border-default)"}`,
                  borderRadius: 3,
                  cursor: isBlocked ? "not-allowed" : "pointer",
                  opacity: isBlocked ? 0.45 : 1,
                  textAlign: "left",
                }}
              >
                <div
                  style={{
                    width: 8, height: 8, borderRadius: 4,
                    background: STATUS_COLOR[z.status] || STATUS_COLOR.neutral,
                    flex: "0 0 auto",
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {z.label || z.zone_key}
                  </div>
                  <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.04em", marginTop: 2 }}>
                    {z.zone_key} · {z.sheet_number || "—"}{isCross ? " · cross-sheet" : ""}
                  </div>
                </div>
                {isSelected && <Check size={14} color="var(--accent)" />}
              </button>
            );
          })}
        </div>

        <footer style={{ padding: "10px 18px", borderTop: "1px solid var(--divider)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              ...mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
              padding: "5px 12px",
              background: "transparent",
              color: "var(--text-muted)",
              border: "1px solid var(--divider)",
              borderRadius: 3,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !targetZoneId}
            style={{
              ...mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
              padding: "5px 12px",
              background: !targetZoneId ? "var(--bg-surface-low)" : "var(--accent)",
              color: !targetZoneId ? "var(--text-muted)" : "#000",
              border: "none",
              borderRadius: 3,
              cursor: !targetZoneId || saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Adding…" : "Add dependency"}
          </button>
        </footer>
      </div>
    </>
  );
}

export default AddDependencyModal;
