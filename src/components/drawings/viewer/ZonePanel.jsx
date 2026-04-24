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
import { X, Search, ExternalLink, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import {
  listLinksForZones,
  hydrateLinks,
  createLink as createLinkSvc,
  removeLink as removeLinkSvc,
  LINKABLE_TYPE_LABELS,
  ALL_STATUSES,
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
  open,
  onClose,
  onZoneUpdate,   // (patch) => Promise — parent handles DB update + refetch
  onZoneDelete,   // () => Promise
}) {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");
  const [linkerOpen, setLinkerOpen] = useState(false);
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

  // Filtered list for the active tab.
  const tabItems = useMemo(() => {
    const tab = TABS.find((t) => t.id === activeTab);
    if (!tab || !tab.types) return linkedItems;
    const set = new Set(tab.types);
    return linkedItems.filter((i) => set.has(i.link.linked_record_type));
  }, [linkedItems, activeTab]);

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
      await refetchLinks();
      // Also refresh the count badges on the overlay.
      qc.invalidateQueries({ queryKey: ["drawing-zones-summaries"] });
    },
    onError: (err) => toast.error(`Link failed: ${err?.message || "unknown error"}`),
  });

  const removeMut = useMutation({
    mutationFn: async (linkId) => removeLinkSvc({ linkId }),
    onSuccess: async () => {
      toast.success("Unlinked");
      await refetchLinks();
      qc.invalidateQueries({ queryKey: ["drawing-zones-summaries"] });
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
            <OverviewTab zone={zone} items={linkedItems} counts={counts} />
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
      </aside>
    </>
  );
}

// ── Overview tab ─────────────────────────────────────────────────────
function OverviewTab({ zone, items, counts }) {
  const rfiOpen = items.filter((i) => i.link.linked_record_type === "rfi" && i.record && i.record.status !== "Answered" && i.record.status !== "Closed" && i.record.status !== "Void").length;
  const wpActive = items.filter((i) => i.link.linked_record_type === "work_package" && i.record && /In Progress|Active|Fabrication|Erection|Installation/i.test(i.record.status || "")).length;
  const delPending = items.filter((i) => i.link.linked_record_type === "delivery" && i.record && !/Delivered|Received/i.test(i.record.status || "")).length;
  const photoCount = (counts.photo || 0) + (counts.document || 0);

  const rows = [
    { label: "Open RFIs",          value: rfiOpen },
    { label: "Active Work Packages", value: wpActive },
    { label: "Pending Deliveries", value: delPending },
    { label: "Photos / Docs",      value: photoCount },
  ];

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
      <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em", marginTop: 8 }}>
        Status-rule engine lands in V1.5 — today the status is whatever you set it to.
      </div>
    </div>
  );
}

function ActivityTab({ zone }) {
  return (
    <div style={{ padding: "24px 4px", textAlign: "center" }}>
      <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
        Activity timeline
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.5 }}>
        Lands in V1.5. We'll record who linked/removed each record + status changes here
        so trust can be audited before the rule engine + AI suggestions come online.
      </div>
      <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 12 }}>
        Zone created {new Date(zone.created_at).toLocaleString()}.
      </div>
    </div>
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
