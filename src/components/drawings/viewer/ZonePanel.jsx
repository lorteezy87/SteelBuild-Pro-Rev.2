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
import { X, Search, ExternalLink, Trash2, FilePlus } from "lucide-react";
import { base44 } from "@/api/base44Client";
import RFIFormModal from "@/components/rfis/RFIFormModal";
import { getNextFormattedNumber } from "@/components/shared/numberSequencing";
import {
  listLinksForZones,
  hydrateLinks,
  createLink as createLinkSvc,
  removeLink as removeLinkSvc,
  listZoneActivity,
  LINKABLE_TYPE_LABELS,
  ALL_STATUSES,
  computeZoneStatus,
  recomputeAndPersistZoneStatus,
} from "@/lib/drawingHub";

const mono    = { fontFamily: "var(--font-mono)" };
const display = { fontFamily: "'Space Grotesk', var(--font-display)" };

const STATUS_COLOR = {
  green:   "#22C55E",
  blue:    "#3B82F6",
  amber:   "#F59E0B",
  red:     "#EF4444",
  purple:  "#8B5CF6",
  neutral: "#94A3B8",
};

// Which tabs to show + which linked record types fill each one.
const TABS = [
  { id: "overview", label: "Overview",      types: null /* computed */ },
  { id: "rfi",      label: "RFIs",          types: ["rfi"] },
  { id: "wp",       label: "Work Packages", types: ["work_package"] },
  { id: "del",      label: "Deliveries",    types: ["delivery"] },
  { id: "photo",    label: "Photos / Docs", types: ["photo", "document", "submittal"] },
  { id: "activity", label: "Activity",      types: null /* computed */ },
];

// Linkable types the MVP picker can seed from. Each maps to an entity
// client + a label + the field used in the picker's search box.
const PICKER_TYPES = [
  { key: "rfi",          label: "RFI",          entity: "RFI",          numberField: "rfi_number",  titleField: "subject" },
  { key: "work_package", label: "Work Package", entity: "WorkPackage",  numberField: "wp_number",   titleField: "name" },
  { key: "delivery",     label: "Delivery",     entity: "Delivery",     numberField: "delivery_number", titleField: "description" },
  { key: "change_order", label: "Change Order", entity: "ChangeOrder",  numberField: "co_number",   titleField: "title" },
  { key: "document",     label: "Document",     entity: "Document",     numberField: "document_number", titleField: "title" },
];

export default function ZonePanel({
  zone,
  sheet,          // { sheet_number, sheet_title, revision_code } — from DrawingViewer
  open,
  onClose,
  onZoneUpdate,   // (patch) => Promise — parent handles DB update + refetch
  onZoneDelete,   // () => Promise
}) {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");
  const [linkerOpen, setLinkerOpen] = useState(false);
  const [rfiFormOpen, setRfiFormOpen] = useState(false);
  const [rfiSaving, setRfiSaving] = useState(false);
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
    mutationFn: async (linkId) => removeLinkSvc({ linkId }),
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
          {activeTab === "activity" && (
            <ActivityTab zone={zone} />
          )}
          {activeTab !== "overview" && activeTab !== "activity" && (
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

/**
 * Compose the drawing_reference string that pre-fills the RFI form.
 * Format: "S-402 Rev A · Z-003 Level 2 / Grid C-5"
 * Caller passes whichever of sheet_number / sheet_title / revision_code
 * are known; missing pieces are skipped cleanly.
 */
function buildRfiDrawingReference(zone, sheet) {
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

// ── Overview tab ─────────────────────────────────────────────────────
function OverviewTab({ zone, items, counts, computed, onApplyComputed }) {
  const rfiOpen = items.filter((i) => i.link.linked_record_type === "rfi" && i.record && !/^(answered|closed|void)$/i.test(i.record.status || "")).length;
  const wpActive = items.filter((i) => i.link.linked_record_type === "work_package" && i.record && /In Progress|Active|Fabrication|Erection|Installation/i.test(i.record.status || "")).length;
  const delPending = items.filter((i) => i.link.linked_record_type === "delivery" && i.record && !/Delivered|Received/i.test(i.record.status || "")).length;
  const photoCount = (counts.photo || 0) + (counts.document || 0);

  const rows = [
    { label: "Open RFIs",          value: rfiOpen },
    { label: "Active Work Packages", value: wpActive },
    { label: "Pending Deliveries", value: delPending },
    { label: "Photos / Docs",      value: photoCount },
  ];

  // Rule-engine "why" card. Shows the drivers that produced the
  // computed status. If the computed value differs from what's
  // stored on the zone (manual override, stale cache, etc.), the
  // user can one-click adopt the rule-engine value.
  const suggestion = computed?.status && computed.status !== zone.status;
  const suggestionColor = {
    red: "#EF4444", amber: "#F59E0B", purple: "#8B5CF6",
    blue: "#3B82F6", green: "#22C55E", neutral: "#94A3B8",
  }[computed?.status] || "#94A3B8";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
        Linked activity
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {rows.map((r) => (
          <div
            key={r.label}
            style={{
              padding: "10px 12px",
              background: "var(--bg-page)",
              border: "1px solid var(--border-default)",
              borderRadius: 3,
            }}
          >
            <div style={{ ...mono, fontSize: 22, fontWeight: 800, color: r.value > 0 ? "var(--text-primary)" : "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
              {r.value}
            </div>
            <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {r.label}
            </div>
          </div>
        ))}
      </div>

      {/* Rule-engine "why" — the single biggest trust upgrade. */}
      {computed && computed.drivers && computed.drivers.length > 0 && (
        <div
          style={{
            padding: "10px 12px",
            background: `color-mix(in srgb, ${suggestionColor} 8%, var(--bg-page))`,
            border: `1px solid ${suggestionColor}`,
            borderRadius: 3,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, gap: 8 }}>
            <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: suggestionColor, letterSpacing: "0.14em", textTransform: "uppercase" }}>
              Rule engine · {computed.status}
            </div>
            {suggestion && (
              <button
                onClick={onApplyComputed}
                title={`Apply the rule-engine status (${computed.status}) and clear manual override`}
                style={{
                  ...mono,
                  fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                  padding: "3px 8px",
                  background: suggestionColor,
                  color: "#000",
                  border: "none",
                  borderRadius: 2,
                  cursor: "pointer",
                }}
              >
                Apply →
              </button>
            )}
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 3 }}>
            {computed.drivers.map((d, i) => (
              <li key={i} style={{ ...mono, fontSize: 10, color: "var(--text-primary)", lineHeight: 1.5 }}>
                · {d}
              </li>
            ))}
          </ul>
          {zone.is_manual_status_override && (
            <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 6, fontStyle: "italic", letterSpacing: "0.04em" }}>
              Zone is currently pinned to "{zone.status}" by a manual override; rule engine is advisory.
            </div>
          )}
        </div>
      )}

      {zone.description && (
        <div style={{ padding: "10px 12px", background: "var(--bg-page)", border: "1px solid var(--border-default)", borderRadius: 3 }}>
          <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
            Description
          </div>
          <div style={{ fontSize: 12, color: "var(--text-primary)", lineHeight: 1.4 }}>
            {zone.description}
          </div>
        </div>
      )}
      {zone.status_reason && (
        <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
          Current status rationale: {zone.status_reason}
        </div>
      )}
    </div>
  );
}

// ── Activity tab ─────────────────────────────────────────────────────
// Reverse-chrono stream of zone + link events backed by the
// drawing_zone_activity table. Triggers on drawing_zones and
// drawing_links feed it automatically — no client-side writes needed.
//
// Each entry shows:
//   - vertical timeline rail with color-coded dot keyed to event type
//   - short human-readable phrase ("Linked RFI-012", "Status: green →
//     amber", "Renamed from Z-001 to Stair 2")
//   - optional secondary line ("by Rule Engine", "created from zone")
//   - relative + absolute timestamp
function ActivityTab({ zone }) {
  const { data: rows = [], isFetching } = useQuery({
    queryKey: ["drawing-zone-activity", zone?.id],
    queryFn: () => listZoneActivity(zone.id),
    enabled: !!zone?.id,
    staleTime: 10 * 1000,
  });

  if (isFetching && rows.length === 0) {
    return <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>Loading activity…</div>;
  }
  if (!rows.length) {
    return (
      <div style={{ padding: "24px 4px", textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>
        No activity yet — actions you take on this zone will show up here.
      </div>
    );
  }

  return (
    <div style={{ position: "relative", paddingLeft: 18 }}>
      {/* Vertical rail */}
      <div style={{
        position: "absolute",
        left: 5, top: 6, bottom: 6,
        width: 1,
        background: "var(--divider)",
      }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((r) => {
          const { color, title, subtitle } = describeActivity(r);
          return (
            <div key={r.id} style={{ position: "relative" }}>
              {/* Dot */}
              <div style={{
                position: "absolute",
                left: -18,
                top: 3,
                width: 10,
                height: 10,
                borderRadius: 5,
                background: color,
                border: "2px solid var(--bg-surface-secondary)",
                boxShadow: `0 0 0 1px ${color}`,
              }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ fontSize: 12, color: "var(--text-primary)", lineHeight: 1.4 }}>
                  {title}
                </div>
                {subtitle && (
                  <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.02em" }}>
                    {subtitle}
                  </div>
                )}
                <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>
                  {formatRelative(r.created_at)} · {new Date(r.created_at).toLocaleString()}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const ACTIVITY_COLOR = {
  zone_created:    "#3B82F6",
  zone_renamed:    "#8B5CF6",
  status_changed:  "#F59E0B",
  zone_deleted:    "#EF4444",
  link_added:      "#22C55E",
  link_removed:    "#94A3B8",
};
const STATUS_DOT = {
  red: "#EF4444", amber: "#F59E0B", purple: "#8B5CF6",
  blue: "#3B82F6", green: "#22C55E", neutral: "#94A3B8",
};
function describeActivity(r) {
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
    default:
      return { color, title: r.event_type, subtitle: null };
  }
}
// Small relative-time helper, bounded to 30 days before falling back
// to the absolute timestamp. Intentionally inline — this lives with
// its one consumer.
function formatRelative(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const ms = Date.now() - t;
  if (ms < 30_000) return "just now";
  const m = Math.floor(ms / 60_000); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);      if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);      if (d <= 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
