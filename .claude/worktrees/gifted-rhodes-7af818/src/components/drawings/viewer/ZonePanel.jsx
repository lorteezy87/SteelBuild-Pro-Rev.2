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

import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, FilePlus, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import RFIFormModal from "@/components/rfis/RFIFormModal";
import { getNextFormattedNumber } from "@/components/shared/numberSequencing";
import {
  listLinksForZones,
  hydrateLinks,
  createLink as createLinkSvc,
  removeLink as removeLinkSvc,
  LINKABLE_TYPE_LABELS,
  ALL_STATUSES,
  computeZoneStatus,
  computeZoneReadiness,
  recomputeAndPersistZoneStatus,
  // V3.1 — zone-to-zone dependency graph
  listZoneDependencies,
  computeDependencyImpact,
  _buildDependencyIndex,
} from "@/lib/drawingHub";
import {
  mono,
  display,
  STATUS_COLOR,
  TABS,
} from "./zonePanel/zonePanelConstants";
import { buildRfiDrawingReference } from "./zonePanel/zonePanelHelpers";
import { OverviewTab } from "./zonePanel/OverviewTab";
import { ActivityTab } from "./zonePanel/ActivityTab";
import { LinkedList } from "./zonePanel/LinkedList";
import { LinkerPicker } from "./zonePanel/LinkerPicker";
import { AiSuggestModal } from "./zonePanel/AiSuggestModal";
import { DependenciesTab } from "./zonePanel/DependenciesTab";

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
  const dependencies = useMemo(() => depData.rows || [], [depData.rows]);

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

