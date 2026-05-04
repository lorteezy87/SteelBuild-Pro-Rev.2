/**
 * ZonePanel — right-side coordination panel for a selected drawing zone.
 *
 * MVP Slice 0. Opens when the user double-clicks a zone on the canvas.
 * Shows the zone's identity (zone_key, label, status), a summary strip
 * with link counts by type, a tabbed body (Overview / RFIs / Work
 * Packages / Deliveries / Photos / Activity), and a linker that lets
 * the user attach any existing project record to the zone.
 *
 * Data flow:
 *   - Parent passes the selected zone record + the project id.
 *   - This component owns the links query + hydration (fetching the
 *     actual RFI / WP / Delivery / Document rows for those links).
 *   - Link create/remove mutations use drawingHub service methods and
 *     invalidate this panel's queries on success.
 *
 * Deferred (V1.5+): snapshot generation, "create RFI from zone"
 * pre-filler, AI-suggested links, activity timeline from an audit
 * table, status rule engine.
 */

import React, { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, Search, ExternalLink, Trash2, FilePlus, Sparkles, Check, Link2, ArrowRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import RFIFormModal from "@/components/rfis/RFIFormModal";
import { getNextFormattedNumber } from "@/components/shared/numberSequencing";
import {
  listLinksForZones,
  hydrateLinks,
  createLink as createLinkSvc,
  removeLink as removeLinkSvc,
  suggestLinksForZone,
  LINKABLE_TYPE_LABELS,
  ALL_STATUSES,
  computeZoneStatus,
  computeZoneReadiness,
  recomputeAndPersistZoneStatus,
  // V3.1 — zone-to-zone dependency graph
  listZoneDependencies,
  addZoneDependency,
  removeZoneDependency,
  computeDependencyImpact,
  _buildDependencyIndex,
  DEPENDENCY_RELATIONSHIPS,
} from "@/lib/drawingHub";
import { supabase } from "@/lib/supabase";
import {
  mono,
  display,
  STATUS_COLOR,
  TABS,
  RELATIONSHIP_COLOR,
  RELATIONSHIP_LABEL,
  PICKER_TYPES,
} from "./zonePanel/zonePanelConstants";
import { buildRfiDrawingReference } from "./zonePanel/zonePanelHelpers";
import { OverviewTab } from "./zonePanel/OverviewTab";
import { ActivityTab } from "./zonePanel/ActivityTab";

export default function ZonePanel({
  zone,
  sheet,          // { sheet_number, sheet_title, revision_code } — from DrawingViewer
  open,
  onClose,
  onZoneUpdate,   // (patch) => Promise — parent handles DB update + refetch
  onZoneDelete,   // () => Promise
  userId,         // auth.users.id — stamped into audit fields on all mutations
  // V3.1: cross-sheet dependency rows can deep-link to the target
  // sheet via this callback. Parent (DrawingViewer) passes a setter
  // that flips activeId. Optional — when missing, cross-sheet rows
  // still render but the click is a no-op.
  onSheetNavigate, // (drawingId) => void
}) {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");
  const [linkerOpen, setLinkerOpen] = useState(false);
  const [rfiFormOpen, setRfiFormOpen] = useState(false);
  const [rfiSaving, setRfiSaving] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState("");

  // Pull the zone's active links + hydrate them into real records so
  // the tabs can render titles/numbers/dates without another round
  // trip. Single query keyed on zone.id → stays cached when the user
  // flips between tabs.
  const { data: linkedItems = [], refetch: refetchLinks, isFetching } = useQuery({
    queryKey: ["drawing-zone-links", zone?.id],
    queryFn: async () => {
      if (!zone?.id) return [];
      const byZone = await listLinksForZones([zone.id]);
      const links = byZone.get(zone.id) || [];
      if (links.length === 0) return [];
      const hydrated = await hydrateLinks(links);
      // hydrated: Map<linkId, { link, record }>
      return Array.from(hydrated.values());
    },
    enabled: !!zone?.id && open,
    staleTime: 30 * 1000,
  });

  // Summary counts by type for the strip at the top of the panel.
  const counts = useMemo(() => {
    const out = {};
    for (const item of linkedItems) {
      const t = item.link.linked_record_type;
      out[t] = (out[t] || 0) + 1;
    }
    return out;
  }, [linkedItems]);

  // Run the rule engine over the currently loaded link data. Pure
  // function — reruns only when linkedItems changes. Drives the "why"
  // bullet list in the Overview tab and the little suggestion chip in
  // the header when the rule engine disagrees with the stored status.
  const computed = useMemo(
    () => computeZoneStatus(linkedItems),
    [linkedItems]
  );

  // V3.1 — pull every active dependency edge incident to this zone
  // (incoming + outgoing). Drives the Dependencies tab AND the
  // upstream-drag computation that pulls readiness rings down. The
  // service hydrates source/target zone summaries (label, sheet, bbox,
  // status) so the panel can render rich rows without N+1 queries.
  const { data: depData = { rows: [], total: 0 }, refetch: refetchDeps } = useQuery({
    queryKey: ["drawing-zone-dependencies", zone?.project_id, zone?.id],
    queryFn: () => listZoneDependencies({
      projectId: zone.project_id,
      zoneId:    zone.id,
    }),
    enabled: !!zone?.id && !!zone?.project_id && open,
    staleTime: 30 * 1000,
  });
  const dependencies = depData.rows || [];

  // Build the drag impact for THIS zone. We need a lookup of every
  // ancestor zone's status, which means fetching all dep rows in the
  // project (cheap — typically <100 edges per project) and a one-shot
  // status read on the unique ancestor ids reachable in 3 hops.
  // For MVP we hydrate just the directly-incident zones and let
  // distant ancestors fall back to status="neutral" — that's already
  // captured in the __source/__target summaries the service returned,
  // so no extra round trip is needed for the common case.
  const dependencyImpact = useMemo(() => {
    if (!zone?.id || dependencies.length === 0) {
      return { drag: 0, contributors: [] };
    }
    const zoneMap = new Map();
    zoneMap.set(zone.id, { status: zone.status, label: zone.label, zone_key: zone.zone_key });
    for (const d of dependencies) {
      if (d.__source) zoneMap.set(d.__source.id, d.__source);
      if (d.__target) zoneMap.set(d.__target.id, d.__target);
    }
    const index = _buildDependencyIndex(dependencies);
    return computeDependencyImpact(zone.id, zoneMap, index);
  }, [zone, dependencies]);

  // V2 — readiness scoring. Three companion percentages (Fabrication /
  // Delivery / Erection) that answer "can we proceed?" rather than "is
  // something on fire?". Null when there's no upstream signal — the
  // gauges render a dash in that case so we don't fake a 0% / 100%.
  // V3.1: pass dependencyImpact so upstream red/amber zones drag the
  // rings down and surface contributors in the tooltip.
  const readiness = useMemo(
    () => computeZoneReadiness(linkedItems, { dependencyImpact }),
    [linkedItems, dependencyImpact]
  );

  // Filtered list for the active tab.
  const tabItems = useMemo(() => {
    const tab = TABS.find((t) => t.id === activeTab);
    if (!tab || !tab.types) return linkedItems;
    const set = new Set(tab.types);
    return linkedItems.filter((i) => set.has(i.link.linked_record_type));
  }, [linkedItems, activeTab]);

  // Shared post-link-mutation step: re-pull links, recompute the zone's
  // status via the rule engine, and persist if it changed. Keeps the
  // stored zone.status row fresh so the overlay paints correct colors
  // on first render for other viewers who haven't loaded the links yet.
  async function afterLinksChanged() {
    const fresh = await refetchLinks();
    const freshItems = fresh?.data || [];
    try {
      await recomputeAndPersistZoneStatus(zone, freshItems);
    } catch (err) {
      // Rule-engine persistence is best-effort — don't block the UI
      // on it. The computed view in the panel still shows the "right"
      // answer even if the write failed.
      console.warn("[ZonePanel] status recompute failed:", err?.message);
    }
    qc.invalidateQueries({ queryKey: ["drawing-zones-summaries"] });
    qc.invalidateQueries({ queryKey: ["drawing-zones"] });
  }

  // Link-create mutation.
  const createMut = useMutation({
    mutationFn: async ({ recordType, recordId }) => {
      if (!zone) throw new Error("No zone selected");
      return createLinkSvc({
        projectId:  zone.project_id,
        zone,
        recordType,
        recordId,
        userId:     userId || null,
        linkRole:   "related",
        linkSource: "manual",
      });
    },
    onSuccess: async () => {
      toast.success("Linked");
      await afterLinksChanged();
    },
    onError: (err) => toast.error(`Link failed: ${err?.message || "unknown error"}`),
  });

  const removeMut = useMutation({
    mutationFn: async (linkId) => removeLinkSvc({ linkId, userId: userId || null }),
    onSuccess: async () => {
      toast.success("Unlinked");
      await afterLinksChanged();
    },
    onError: (err) => toast.error(`Unlink failed: ${err?.message || "unknown error"}`),
  });

  if (!open || !zone) return null;

  const statusColor = STATUS_COLOR[zone.status] || STATUS_COLOR.neutral;

  return (
    <>
      {/* Dimming scrim — light, click-to-close */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.24)",
          zIndex: 1100,
        }}
      />
      <aside
        style={{
          position: "fixed",
          top: 0, right: 0, bottom: 0,
          width: 440, maxWidth: "96vw",
          background: "var(--bg-surface-secondary)",
          borderLeft: `3px solid ${statusColor}`,
          boxShadow: "-10px 0 32px rgba(0,0,0,0.45)",
          zIndex: 1101,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <header style={{ padding: "14px 18px", borderBottom: "1px solid var(--divider)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 4 }}>
                {zone.zone_key} · Zone
              </div>
              {editingLabel ? (
                <input
                  autoFocus
                  value={labelDraft}
                  onChange={(e) => setLabelDraft(e.target.value)}
                  onBlur={async () => {
                    const next = labelDraft.trim();
                    setEditingLabel(false);
                    if (next && next !== zone.label) {
                      try { await onZoneUpdate?.({ label: next }); toast.success("Zone renamed"); }
                      catch (err) { toast.error(`Rename failed: ${err?.message || "unknown"}`); }
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") { setLabelDraft(zone.label); setEditingLabel(false); }
                  }}
                  style={{
                    ...display,
                    fontSize: 18, fontWeight: 700,
                    width: "100%",
                    background: "var(--bg-input)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--accent)", borderRadius: 3,
                    padding: "3px 6px",
                  }}
                />
              ) : (
                <h2
                  onDoubleClick={() => { setLabelDraft(zone.label || zone.zone_key); setEditingLabel(true); }}
                  title="Double-click to rename"
                  style={{ ...display, fontSize: 18, fontWeight: 700, color: "var(--text-primary)", margin: 0, cursor: "text", wordBreak: "break-word" }}
                >
                  {zone.label || zone.zone_key}
                </h2>
              )}
              <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
                {zone.level_ref && <span style={{ marginRight: 8 }}>Level {zone.level_ref}</span>}
                {zone.grid_ref && <span style={{ marginRight: 8 }}>Grid {zone.grid_ref}</span>}
                {zone.detail_ref && <span>Detail {zone.detail_ref}</span>}
              </div>
            </div>
            <button onClick={onClose} aria-label="Close" style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4 }}>
              <X size={18} />
            </button>
          </div>

          {/* Status chip + actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <select
              value={zone.status}
              onChange={async (e) => {
                try { await onZoneUpdate?.({ status: e.target.value, is_manual_status_override: true, manual_status_override_at: new Date().toISOString() }); toast.success(`Status → ${e.target.value}`); }
                catch (err) { toast.error(`Status change failed: ${err?.message || "unknown"}`); }
              }}
              title="Zone status (rule engine will drive this automatically in V1.5)"
              style={{
                ...mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                padding: "4px 8px",
                background: `color-mix(in srgb, ${statusColor} 14%, transparent)`,
                color: statusColor,
                border: `1px solid ${statusColor}`,
                borderRadius: 3,
                cursor: "pointer",
              }}
            >
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button
              onClick={() => setLinkerOpen(true)}
              style={{
                ...mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                padding: "4px 10px",
                background: "var(--accent)",
                color: "#000",
                border: "none",
                borderRadius: 3,
                cursor: "pointer",
              }}
            >
              + Link Record
            </button>
            {/* Create a fresh RFI pre-filled with this zone's sheet +
                zone_key as the drawing_reference, then auto-link the
                new RFI to this zone on save. Core "create from area"
                action — the whole point of the V1.5 slice. */}
            <button
              onClick={() => setRfiFormOpen(true)}
              title={`Create a new RFI referencing ${zone.zone_key}${sheet?.sheet_number ? ` on sheet ${sheet.sheet_number}` : ""}`}
              style={{
                ...mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                padding: "4px 10px",
                background: "transparent",
                color: "var(--accent)",
                border: "1px solid var(--accent)",
                borderRadius: 3,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <FilePlus size={11} /> New RFI
            </button>
            {/* AI-suggested links — opens a modal that asks gpt-4o-mini
                to scan open project records and propose ones likely to
                belong to this zone based on sheet / grid / detail /
                title overlap. User confirms each before it persists,
                so the rule engine still stays honest. */}
            <button
              onClick={() => setSuggestOpen(true)}
              title="Ask AI to propose records that likely belong to this zone."
              style={{
                ...mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                padding: "4px 10px",
                background: "transparent",
                color: "#00E5FF",
                border: "1px solid #00E5FF",
                borderRadius: 3,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Sparkles size={11} /> Suggest
            </button>
            <button
              onClick={async () => {
                if (!window.confirm(`Delete zone ${zone.zone_key}? Links will be preserved but hidden.`)) return;
                try { await onZoneDelete?.(); onClose?.(); toast.success("Zone deleted"); }
                catch (err) { toast.error(`Delete failed: ${err?.message || "unknown"}`); }
              }}
              title="Soft-delete this zone (history preserved)"
              style={{
                ...mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                padding: "4px 8px",
                background: "transparent",
                color: "var(--status-error)",
                border: "1px solid var(--status-error)",
                borderRadius: 3,
                cursor: "pointer",
                marginLeft: "auto",
              }}
            >
              Delete
            </button>
          </div>

          {/* Summary strip — count per record type */}
          <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
            {Object.keys(LINKABLE_TYPE_LABELS).map((t) => {
              const n = counts[t];
              if (!n) return null;
              return (
                <span
                  key={t}
                  style={{
                    ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                    padding: "2px 6px",
                    background: "var(--bg-page)",
                    border: "1px solid var(--border-default)",
                    borderRadius: 2,
                    color: "var(--text-secondary)",
                  }}
                >
                  {LINKABLE_TYPE_LABELS[t]} · {n}
                </span>
              );
            })}
            {linkedItems.length === 0 && (
              <span style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>
                No linked records yet.
              </span>
            )}
          </div>
        </header>

        {/* Tabs */}
        <nav style={{ display: "flex", borderBottom: "1px solid var(--divider)", background: "var(--bg-surface-low)", overflowX: "auto" }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                ...mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase",
                padding: "9px 14px",
                background: "transparent",
                color: activeTab === t.id ? "var(--accent)" : "var(--text-muted)",
                border: "none",
                borderBottom: `2px solid ${activeTab === t.id ? "var(--accent)" : "transparent"}`,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px" }}>
          {activeTab === "overview" && (
            <OverviewTab
              zone={zone}
              items={linkedItems}
              counts={counts}
              computed={computed}
              readiness={readiness}
              dependencyImpact={dependencyImpact}
              onApplyComputed={async () => {
                try {
                  await onZoneUpdate?.({
                    status: computed.status,
                    status_reason: computed.reason || null,
                    status_computed_at: new Date().toISOString(),
                    status_computed_by: "rule_engine",
                    is_manual_status_override: false,
                    manual_status_override_at: null,
                    manual_status_override_by: null,
                  });
                  toast.success(`Status → ${computed.status} (rule engine)`);
                } catch (err) {
                  toast.error(`Apply failed: ${err?.message || "unknown"}`);
                }
              }}
            />
          )}
          {activeTab === "deps" && (
            <DependenciesTab
              zone={zone}
              currentSheetDrawingId={zone?.drawing_id}
              dependencies={dependencies}
              dependencyImpact={dependencyImpact}
              userId={userId || null}
              onSheetNavigate={onSheetNavigate}
              onAdded={async () => {
                await refetchDeps();
                qc.invalidateQueries({ queryKey: ["drawing-zone-dependencies"] });
                qc.invalidateQueries({ queryKey: ["drawing-zone-activity", zone?.id] });
              }}
              onRemoved={async () => {
                await refetchDeps();
                qc.invalidateQueries({ queryKey: ["drawing-zone-dependencies"] });
                qc.invalidateQueries({ queryKey: ["drawing-zone-activity", zone?.id] });
              }}
            />
          )}
          {activeTab === "activity" && (
            <ActivityTab zone={zone} />
          )}
          {activeTab !== "overview" && activeTab !== "activity" && activeTab !== "deps" && (
            <LinkedList
              items={tabItems}
              isFetching={isFetching}
              onRemove={(linkId) => removeMut.mutate(linkId)}
              emptyLabel={`No ${TABS.find((t) => t.id === activeTab)?.label.toLowerCase()} linked to this zone.`}
            />
          )}
        </div>

        {/* Linker modal */}
        {linkerOpen && (
          <LinkerPicker
            zone={zone}
            onClose={() => setLinkerOpen(false)}
            onPick={async (choice) => {
              await createMut.mutateAsync(choice);
              setLinkerOpen(false);
            }}
          />
        )}

        {/* AI-suggested links modal. Opens on-demand; fetches
            candidate open records for the project, asks gpt-4o-mini
            to pick the ones that belong to this zone, and lets the
            user accept/reject each. Accepts persist as drawing_links
            with link_source='ai_suggested' + is_confirmed=true and
            the model's confidence_score for later surfacing. */}
        {suggestOpen && (
          <AiSuggestModal
            zone={zone}
            sheet={sheet}
            existingItems={linkedItems}
            onClose={() => setSuggestOpen(false)}
            onAccept={async (suggestion) => {
              await createLinkSvc({
                projectId:  zone.project_id,
                zone,
                recordType: suggestion.recordType,
                recordId:   suggestion.recordId,
                userId:     userId || null,
                linkRole:   "related",
                linkSource: "ai_suggested",
                confidenceScore: suggestion.confidence,
                isConfirmed: true,
                metadata:   { rationale: suggestion.rationale || null, model: "gpt-4o-mini" },
              });
              await afterLinksChanged();
            }}
          />
        )}

        {/* Create-RFI-from-zone modal. The RFIFormModal is a shared
            component used elsewhere in the app; we wrap it with a
            custom onSave that handles the "mint RFI + link it to this
            zone" sequence so the user never has to drill across pages. */}
        {rfiFormOpen && (
          <RFIFormModal
            projectId={zone.project_id}
            saving={rfiSaving}
            rfi={null}
            initialDrawingReference={buildRfiDrawingReference(zone, sheet)}
            onClose={() => setRfiFormOpen(false)}
            onSave={async (formData) => {
              setRfiSaving(true);
              try {
                // Mint a project-scoped RFI number — mirrors the
                // existing RFIFormModal internal path so numbering
                // stays consistent whether the RFI was created from
                // the zone panel or the main RFIs page.
                let rfiNumber;
                try {
                  rfiNumber = await getNextFormattedNumber({
                    projectId: zone.project_id,
                    recordType: "RFI",
                    entityName: "RFI",
                    fieldName: "rfi_number",
                    prefix: "RFI #",
                  });
                } catch (err) {
                  console.warn("[ZonePanel] rfi_number sequence failed:", err?.message);
                  rfiNumber = `RFI #${String(Date.now()).slice(-6)}`;
                }

                // Coerce optional numeric fields the same way
                // RFIFormModal's internal mutation does.
                const payload = {
                  ...formData,
                  project_id: zone.project_id,
                  rfi_number: rfiNumber,
                  cost_impact_amount:
                    formData.cost_impact_amount === "" ? null
                      : formData.cost_impact_amount !== undefined ? Number(formData.cost_impact_amount) : null,
                  schedule_impact_days:
                    formData.schedule_impact_days === "" ? null
                      : formData.schedule_impact_days !== undefined ? Number(formData.schedule_impact_days) : null,
                };
                const newRfi = await base44.entities.RFI.create(payload);

                // Link it to the zone (manual source, related role).
                // If this fails we surface a toast but don't roll back
                // the RFI itself — the user still has a valid record,
                // they can manually link it from the Linker later.
                try {
                  await createLinkSvc({
                    projectId:  zone.project_id,
                    zone,
                    recordType: "rfi",
                    recordId:   newRfi.id,
                    userId:     userId || null,
                    linkRole:   "related",
                    linkSource: "manual",
                    metadata:   { created_from_zone: true },
                  });
                } catch (err) {
                  toast.warning(`RFI ${rfiNumber} created, but auto-link failed: ${err?.message || "unknown"}`);
                }

                toast.success(`${rfiNumber} created and linked to ${zone.zone_key}`);
                qc.invalidateQueries({ queryKey: ["rfis"] });
                qc.invalidateQueries({ queryKey: ["rfis", zone.project_id] });
                await afterLinksChanged();
                setRfiFormOpen(false);
              } catch (err) {
                toast.error(`Failed to create RFI: ${err?.message || "unknown error"}`);
              } finally {
                setRfiSaving(false);
              }
            }}
          />
        )}
      </aside>
    </>
  );
}

// ── AI-suggested links modal ─────────────────────────────────────────
//
// Fetches open records across four record types in the zone's
// project, strips out anything already linked to the zone, sends
// the remainder to suggestLinksForZone() for gpt-4o-mini analysis,
// and renders each returned suggestion with a confidence chip +
// rationale + Accept / Skip buttons.
//
// Accept fires the parent's onAccept(suggestion) which handles the
// drawing_link persistence (see caller). Skipped suggestions just
// disappear from the list; they're not tracked for re-suggestion
// suppression in MVP.
function AiSuggestModal({ zone, sheet, existingItems, onClose, onAccept }) {
  const alreadyLinked = useMemo(() => {
    const s = new Set();
    for (const it of existingItems || []) {
      s.add(`${it.link.linked_record_type}:${it.link.linked_record_id}`);
    }
    return s;
  }, [existingItems]);

  // Pull candidate open records across the four types the model is
  // allowed to suggest. Capped per-type so the payload stays small;
  // suggestLinksForZone does a second narrowing pass.
  const { data: candidates = [], isFetching: loadingCandidates, error: candidateError } = useQuery({
    queryKey: ["zone-ai-candidates", zone.project_id, zone.id],
    queryFn: async () => {
      if (!zone?.project_id) return [];
      const [rfis, wps, dels, cos] = await Promise.all([
        base44.entities.RFI.filter({ project_id: zone.project_id }).catch(() => []),
        base44.entities.WorkPackage.filter({ project_id: zone.project_id }).catch(() => []),
        base44.entities.Delivery.filter({ project_id: zone.project_id }).catch(() => []),
        base44.entities.ChangeOrder.filter({ project_id: zone.project_id }).catch(() => []),
      ]);
      const isRfiOpen = (r) => !/^(answered|closed|void)$/i.test(r.status || "");
      const isDelOpen = (d) => !/^(delivered|received)$/i.test(d.status || "");
      const isCoOpen  = (c) => !/^(approved|rejected|void)$/i.test(c.status || "");
      const open = [
        ...rfis.filter(isRfiOpen).slice(0, 60).map((r) => ({ ...r, __type: "rfi" })),
        ...wps.slice(0, 40).map((r) => ({ ...r, __type: "work_package" })),
        ...dels.filter(isDelOpen).slice(0, 40).map((r) => ({ ...r, __type: "delivery" })),
        ...cos.filter(isCoOpen).slice(0, 40).map((r) => ({ ...r, __type: "change_order" })),
      ];
      // Strip anything already linked so the model doesn't propose
      // duplicates and waste tokens.
      return open.filter((r) => !alreadyLinked.has(`${r.__type}:${r.id}`));
    },
    enabled: true,
    staleTime: 60 * 1000,
  });

  const zoneWithSheet = useMemo(() => ({
    ...zone,
    __sheet_number: sheet?.sheet_number,
    __sheet_title:  sheet?.sheet_title,
  }), [zone, sheet]);

  const suggestMut = useMutation({
    mutationFn: async () => suggestLinksForZone(zoneWithSheet, candidates),
  });

  // Auto-run once candidates are loaded so the modal doesn't ask
  // the user to click "Go" for a feature they just invoked.
  const autoKickedOff = React.useRef(false);
  useEffect(() => {
    if (autoKickedOff.current) return;
    if (loadingCandidates) return;
    if (!candidates.length) return;
    autoKickedOff.current = true;
    suggestMut.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingCandidates, candidates.length]);

  // Track which suggestions the user has accepted/skipped in this
  // session so the list shrinks as they work through it.
  const [hidden, setHidden] = useState(() => new Set());
  const [acceptingId, setAcceptingId] = useState(null);
  const visible = (suggestMut.data || []).filter(
    (s) => !hidden.has(`${s.recordType}:${s.recordId}`),
  );

  const handleAccept = async (s) => {
    const key = `${s.recordType}:${s.recordId}`;
    setAcceptingId(key);
    try {
      await onAccept(s);
      setHidden((prev) => { const next = new Set(prev); next.add(key); return next; });
      toast.success(`${LINKABLE_TYPE_LABELS[s.recordType] || s.recordType} linked`);
    } catch (err) {
      toast.error(`Link failed: ${err?.message || "unknown"}`);
    } finally {
      setAcceptingId(null);
    }
  };
  const handleSkip = (s) => {
    const key = `${s.recordType}:${s.recordId}`;
    setHidden((prev) => { const next = new Set(prev); next.add(key); return next; });
  };

  const lookupById = useMemo(() => {
    const m = new Map();
    for (const c of candidates || []) m.set(`${c.__type}:${c.id}`, c);
    return m;
  }, [candidates]);

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1200 }} />
      <div
        style={{
          position: "fixed",
          top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: 580, maxWidth: "92vw", maxHeight: "82vh",
          background: "var(--bg-surface-secondary)",
          border: "1px solid #00E5FF",
          borderRadius: 6,
          zIndex: 1201,
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <header style={{ padding: "14px 18px", borderBottom: "1px solid var(--divider)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#00E5FF" }}>
              AI Suggestions · {zone.zone_key}
            </div>
            <div style={{ ...display, fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginTop: 2 }}>
              Records that likely belong here
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
            <X size={18} />
          </button>
        </header>

        <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px" }}>
          {/* Status banner */}
          {loadingCandidates && (
            <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>
              Loading project records…
            </div>
          )}
          {!loadingCandidates && !candidates.length && (
            <div style={{ ...mono, fontSize: 11, color: "var(--text-muted)" }}>
              No open records available to suggest from — every open RFI / WP / delivery / CO
              is already linked to this zone or the project has none yet.
            </div>
          )}
          {candidateError && (
            <div style={{ ...mono, fontSize: 11, color: "var(--status-error)" }}>
              Couldn't load candidates: {candidateError?.message || "unknown error"}
            </div>
          )}
          {suggestMut.isPending && (
            <div style={{ ...mono, fontSize: 10, color: "#00E5FF", letterSpacing: "0.12em", textTransform: "uppercase" }}>
              ● Analysing {candidates.length} open records…
            </div>
          )}
          {suggestMut.isError && (
            <div style={{ ...mono, fontSize: 11, color: "var(--status-error)" }}>
              AI call failed: {suggestMut.error?.message || "unknown"}
              <button
                onClick={() => suggestMut.mutate()}
                style={{ ...mono, fontSize: 10, marginLeft: 8, padding: "2px 8px", background: "transparent", color: "#00E5FF", border: "1px solid #00E5FF", borderRadius: 2, cursor: "pointer" }}
              >
                Retry
              </button>
            </div>
          )}
          {suggestMut.isSuccess && visible.length === 0 && (
            <div style={{ ...mono, fontSize: 11, color: "var(--text-muted)", padding: "12px 0" }}>
              No confident matches. Either the signals were too weak (drawing references, grid /
              level / detail callouts don't line up), or you've already worked through every
              suggestion.
              <div style={{ marginTop: 10 }}>
                <button
                  onClick={() => { setHidden(new Set()); suggestMut.mutate(); }}
                  style={{ ...mono, fontSize: 10, padding: "3px 10px", background: "transparent", color: "#00E5FF", border: "1px solid #00E5FF", borderRadius: 2, cursor: "pointer" }}
                >
                  Re-run
                </button>
              </div>
            </div>
          )}

          {/* Suggestion cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
            {visible.map((s) => {
              const rec = lookupById.get(`${s.recordType}:${s.recordId}`);
              const number = rec?.rfi_number || rec?.wp_number || rec?.delivery_number || rec?.co_number || null;
              const title  = rec?.subject || rec?.name || rec?.description || rec?.title || "(untitled)";
              const pct = Math.round(s.confidence * 100);
              const chipColor = pct >= 80 ? "var(--status-success)" : pct >= 65 ? "#00E5FF" : "var(--status-warning)";
              return (
                <div
                  key={`${s.recordType}:${s.recordId}`}
                  style={{
                    padding: "10px 12px",
                    background: "var(--bg-page)",
                    border: "1px solid var(--border-default)",
                    borderRadius: 3,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                      {LINKABLE_TYPE_LABELS[s.recordType] || s.recordType}
                    </div>
                    <div
                      title={`${pct}% model confidence`}
                      style={{
                        ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                        padding: "2px 8px",
                        background: `color-mix(in srgb, ${chipColor} 14%, transparent)`,
                        color: chipColor,
                        border: `1px solid ${chipColor}`,
                        borderRadius: 2,
                      }}
                    >
                      {pct}% match
                    </div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginTop: 4, lineHeight: 1.35 }}>
                    {number && <span style={{ ...mono, color: "var(--accent)", marginRight: 8 }}>{number}</span>}
                    {title}
                  </div>
                  {s.rationale && (
                    <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.4 }}>
                      “{s.rationale}”
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                    <button
                      disabled={acceptingId === `${s.recordType}:${s.recordId}`}
                      onClick={() => handleAccept(s)}
                      style={{
                        ...mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                        padding: "4px 10px",
                        background: chipColor,
                        color: "#000",
                        border: "none",
                        borderRadius: 2,
                        cursor: "pointer",
                        display: "inline-flex", alignItems: "center", gap: 4,
                      }}
                    >
                      <Check size={11} /> {acceptingId === `${s.recordType}:${s.recordId}` ? "Linking…" : "Accept"}
                    </button>
                    <button
                      onClick={() => handleSkip(s)}
                      style={{
                        ...mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                        padding: "4px 10px",
                        background: "transparent",
                        color: "var(--text-muted)",
                        border: "1px solid var(--divider)",
                        borderRadius: 2,
                        cursor: "pointer",
                      }}
                    >
                      Skip
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <footer style={{ padding: "10px 18px", borderTop: "1px solid var(--divider)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em" }}>
            Model: gpt-4o-mini · Signals: sheet · grid · level · detail · title · drawing_reference
          </span>
          <button
            onClick={onClose}
            style={{
              ...mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
              padding: "5px 12px",
              background: "transparent",
              color: "var(--text-muted)",
              border: "1px solid var(--divider)",
              borderRadius: 2,
              cursor: "pointer",
            }}
          >
            Done
          </button>
        </footer>
      </div>
    </>
  );
}

// ── Linked list (shared by RFI / WP / Delivery / Photo tabs) ────────
function LinkedList({ items, isFetching, onRemove, emptyLabel }) {
  if (isFetching && items.length === 0) {
    return (
      <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>Loading…</div>
    );
  }
  if (items.length === 0) {
    return (
      <div style={{ padding: "24px 4px", textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>
        {emptyLabel}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map(({ link, record }) => (
        <LinkedCard key={link.id} link={link} record={record} onRemove={onRemove} />
      ))}
    </div>
  );
}

function LinkedCard({ link, record, onRemove }) {
  const orphan = !record;
  // Best-effort title/subtitle for each type.
  const number =
    record?.rfi_number ||
    record?.wp_number ||
    record?.delivery_number ||
    record?.co_number ||
    record?.document_number ||
    record?.sheet_number ||
    null;
  const title =
    record?.subject ||
    record?.name ||
    record?.description ||
    record?.title ||
    "(untitled)";
  const status = record?.status || null;

  return (
    <div
      style={{
        padding: "10px 12px",
        background: "var(--bg-page)",
        border: "1px solid var(--border-default)",
        borderRadius: 3,
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)" }}>
          {LINKABLE_TYPE_LABELS[link.linked_record_type] || link.linked_record_type}
          {orphan && <span style={{ color: "var(--status-error)", marginLeft: 6 }}>· MISSING</span>}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: orphan ? "var(--text-muted)" : "var(--text-primary)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis" }}>
          {number && <span style={{ ...mono, color: "var(--accent)", marginRight: 8 }}>{number}</span>}
          {orphan ? "Referenced record not found" : title}
        </div>
        {status && (
          <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 4, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {status}
          </div>
        )}
      </div>
      <button
        onClick={() => { if (window.confirm("Remove this link?")) onRemove?.(link.id); }}
        title="Unlink from zone"
        aria-label="Unlink"
        style={{
          background: "transparent",
          border: "none",
          color: "var(--text-muted)",
          cursor: "pointer",
          padding: 4,
        }}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

// ── Linker picker ───────────────────────────────────────────────────
function LinkerPicker({ zone, onClose, onPick }) {
  const [typeKey, setTypeKey] = useState("rfi");
  const [query, setQuery] = useState("");

  const typeSpec = PICKER_TYPES.find((t) => t.key === typeKey) || PICKER_TYPES[0];

  // Fetch candidates scoped to the same project so cross-project
  // mistakes are impossible. No pagination in the MVP — the list is
  // capped to 100 for sanity.
  const { data: candidates = [], isFetching } = useQuery({
    queryKey: ["zone-linker-candidates", zone?.project_id, typeKey],
    queryFn: async () => {
      if (!zone?.project_id) return [];
      const entity = base44.entities[typeSpec.entity];
      if (!entity?.filter) return [];
      const rows = await entity.filter({ project_id: zone.project_id });
      return Array.isArray(rows) ? rows.slice(0, 300) : [];
    },
    enabled: !!zone?.project_id,
    staleTime: 30 * 1000,
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((r) => {
      const num  = String(r[typeSpec.numberField] || "").toLowerCase();
      const ttl  = String(r[typeSpec.titleField]  || "").toLowerCase();
      return num.includes(q) || ttl.includes(q);
    });
  }, [candidates, query, typeSpec]);

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1200 }} />
      <div
        style={{
          position: "fixed",
          top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: 540, maxWidth: "92vw", maxHeight: "82vh",
          background: "var(--bg-surface-secondary)",
          border: "1px solid var(--border-default)",
          borderRadius: 6,
          zIndex: 1201,
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <header style={{ padding: "14px 18px", borderBottom: "1px solid var(--divider)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)" }}>
              Link to {zone.zone_key}
            </div>
            <div style={{ ...display, fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginTop: 2 }}>
              Pick a record to attach
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
            <X size={18} />
          </button>
        </header>

        {/* Type tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--divider)", background: "var(--bg-surface-low)" }}>
          {PICKER_TYPES.map((t) => (
            <button
              key={t.key}
              onClick={() => setTypeKey(t.key)}
              style={{
                ...mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase",
                padding: "9px 14px",
                background: "transparent",
                color: typeKey === t.key ? "var(--accent)" : "var(--text-muted)",
                border: "none",
                borderBottom: `2px solid ${typeKey === t.key ? "var(--accent)" : "transparent"}`,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ padding: "10px 18px", borderBottom: "1px solid var(--divider)" }}>
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", top: "50%", left: 8, transform: "translateY(-50%)", color: "var(--text-muted)" }} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${typeSpec.label.toLowerCase()}s by number or title…`}
              style={{
                ...mono,
                fontSize: 12,
                width: "100%",
                padding: "7px 10px 7px 30px",
                background: "var(--bg-input)",
                border: "1px solid var(--border-default)",
                borderRadius: 3,
                color: "var(--text-primary)",
              }}
            />
          </div>
        </div>

        {/* Candidate list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 10px" }}>
          {isFetching && filtered.length === 0 && (
            <div style={{ padding: "24px 8px", textAlign: "center", color: "var(--text-muted)", ...mono, fontSize: 10 }}>
              Loading…
            </div>
          )}
          {!isFetching && filtered.length === 0 && (
            <div style={{ padding: "24px 8px", textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
              No {typeSpec.label.toLowerCase()}s match{query ? ` "${query}"` : ""}.
            </div>
          )}
          {filtered.map((row) => (
            <button
              key={row.id}
              onClick={() => onPick({ recordType: typeKey, recordId: row.id })}
              style={{
                width: "100%",
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                background: "transparent",
                border: "1px solid transparent",
                borderBottom: "1px solid var(--divider)",
                color: "var(--text-primary)",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ ...mono, fontSize: 10, color: "var(--accent)", minWidth: 80 }}>
                {row[typeSpec.numberField] || "—"}
              </span>
              <span style={{ flex: 1, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {row[typeSpec.titleField] || "(untitled)"}
              </span>
              <ExternalLink size={12} style={{ color: "var(--text-muted)" }} />
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// ── Dependencies tab (V3.1) ──────────────────────────────────────────
//
// Two semantic groups:
//   "Blocking this zone"  — incoming `blocks` edges (someone says this
//                            zone is blocked by them) + outgoing
//                            `depends_on` edges (this zone depends on
//                            someone else)
//   "Blocked by this zone" — outgoing `blocks` (this zone blocks others)
//                             + incoming `depends_on` (others depend
//                             on this zone)
//   "Related"              — `relates_to` edges, both directions
//
// Each row shows: peer zone label, sheet badge ("S-202" or "this
// sheet"), relationship pill, propagation-weight chip (only when not
// 1.0), note tooltip, peer status indicator, remove button. Cross-
// sheet rows show a "→ Sheet X" pill and click navigates the viewer
// when onSheetNavigate is provided.
function DependenciesTab({
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

// ── Add Dependency modal (V3.1) ──────────────────────────────────────
//
// Picker for a target zone (anywhere in the same project, with sheet
// labels), relationship select, propagation weight slider, optional
// note. Submits via addZoneDependency() and closes on success.
function AddDependencyModal({ zone, existingDependencies, userId, onClose, onSaved }) {
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
        style={{
          position: "fixed",
          top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: 540, maxWidth: "92vw", maxHeight: "84vh",
          background: "var(--bg-surface-secondary)",
          border: "1px solid var(--border-default)",
          borderRadius: 6,
          zIndex: 1201,
          display: "flex", flexDirection: "column",
          overflow: "hidden",
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
