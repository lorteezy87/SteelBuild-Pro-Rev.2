import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProjectContext } from "../components/shared/useProjectContext";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import DeleteDialog from "@/components/shared/DeleteDialog";
import StatusBadge from "@/components/shared/StatusBadge";

const PROCUREMENT_CATEGORIES = [
  "Structural Steel - Mill Order",
  "Joists & Deck",
  "Stairs & Ladders",
  "Embeds & Anchor Bolts",
  "Miscellaneous Metals",
  "Galvanizing / Paint / Coating",
  "Long-Lead Item",
  "Hardware & Fasteners",
  "Equipment Rental",
  "Other",
];

const CAT_COLORS = {
  "Structural Steel - Mill Order": "var(--accent)",
  "Joists & Deck": "var(--secondary)",
  "Stairs & Ladders": "var(--phase-fab)",
  "Embeds & Anchor Bolts": "var(--status-warning)",
  "Miscellaneous Metals": "var(--status-info)",
  "Galvanizing / Paint / Coating": "#F59E0B",
  "Long-Lead Item": "var(--status-error)",
  "Hardware & Fasteners": "var(--text-secondary)",
  "Equipment Rental": "var(--phase-erection)",
  Other: "var(--text-muted)",
};

const STATUSES = [
  "Identified",
  "Quoted",
  "PO Issued",
  "Confirmed",
  "In Production",
  "Shipped",
  "Received",
  "Cancelled",
];

const panel = {
  background: "linear-gradient(180deg, rgba(31,33,37,0.96), rgba(12,14,17,0.98))",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-card)",
  boxShadow: "var(--shadow-card)",
};

const iStyle = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  padding: "8px 12px",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  color: "var(--text-muted)",
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  display: "block",
  marginBottom: 4,
};

export default function Procurement() {
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const projectId = searchParams.get("project") || activeProject?.id || null;
  const qc = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filterCat, setFilterCat] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["procurement", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.Delivery.filter({ project_id: projectId, delivery_type: "PROCUREMENT" })
        : [],
    enabled: !!projectId,
    initialData: [],
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ["vendors"],
    queryFn: () => base44.entities.Vendor.list(),
    initialData: [],
  });

  const createMut = useMutation({
    mutationFn: (data) =>
      base44.entities.Delivery.create({
        ...data,
        delivery_type: "PROCUREMENT",
        project_id: projectId,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["procurement"] });
      setShowForm(false);
      setEditing(null);
      toast.success("Item created");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Delivery.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["procurement"] });
      setShowForm(false);
      setEditing(null);
      toast.success("Item updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Delivery.delete(id),
    onSuccess: (_, deletedId) => {
      qc.invalidateQueries({ queryKey: ["procurement"] });
      if (editing?.id === deletedId) {
        setEditing(null);
        setShowForm(false);
      }
      setDeleteTarget(null);
      toast.success("Item removed");
    },
  });

  const today = new Date();

  const enriched = useMemo(
    () =>
      items.map((item) => {
        const required = item.required_date ? new Date(item.required_date) : null;
        const promised = item.scheduled_date ? new Date(item.scheduled_date) : null;
        const isLate = required && promised && promised > required && !["Received", "Cancelled"].includes(item.status);
        const isOverdue = required && !["Received", "Cancelled"].includes(item.status) && required < today;
        const daysExposure = required && promised ? Math.ceil((promised - required) / 86400000) : null;
        return { ...item, isLate, isOverdue, daysExposure };
      }),
    [items, today]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return enriched
      .filter((item) => {
        if (filterCat !== "all" && item.procurement_category !== filterCat) return false;
        if (filterStatus !== "all" && item.status !== filterStatus) return false;
        if (
          q &&
          !(
            item.description?.toLowerCase().includes(q) ||
            item.vendor_name?.toLowerCase().includes(q)
          )
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.isOverdue && !b.isOverdue) return -1;
        if (!a.isOverdue && b.isOverdue) return 1;
        if (a.isLate && !b.isLate) return -1;
        if (!a.isLate && b.isLate) return 1;
        return 0;
      });
  }, [enriched, filterCat, filterStatus, search]);

  const kpis = useMemo(
    () => ({
      total: items.length,
      open: items.filter((i) => !["Received", "Cancelled"].includes(i.status)).length,
      overdue: enriched.filter((i) => i.isOverdue).length,
      late: enriched.filter((i) => i.isLate).length,
      longLead: items.filter((i) => i.procurement_category === "Long-Lead Item").length,
    }),
    [items, enriched]
  );

  const selectedProject = projects.find((p) => p.id === projectId);
  const riskRows = useMemo(
    () => filtered.filter((item) => item.isOverdue || item.isLate || item.procurement_category === "Long-Lead Item").slice(0, 5),
    [filtered]
  );

  if (!projectId) {
    return (
      <div style={{ textAlign: "center", padding: "80px 24px" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>Select a project</div>
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 12,
            fontWeight: 700,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
          }}
        >
          Procurement runs in project scope
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <section
        style={{
          ...panel,
          padding: 24,
          background:
            "radial-gradient(circle at top right, rgba(255,107,0,0.14), transparent 30%), radial-gradient(circle at left center, rgba(0,229,255,0.10), transparent 24%), linear-gradient(180deg, rgba(31,33,37,0.96), rgba(9,10,11,0.99))",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.7fr) minmax(280px, 0.85fr)", gap: 20 }}>
          <div>
            <div style={eyebrow}>Procurement Command</div>
            <h1 style={heroTitle}>Long-lead visibility, vendor commitment, and delivery pressure in one tracker.</h1>
            <p style={heroText}>
              This page now reads like an operational buyout surface instead of a simple list, with date risk and long-lead exposure surfaced before they turn into field problems.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 12, marginTop: 18 }}>
              <MetricCard label="Total Items" value={kpis.total} tone="var(--text-primary)" />
              <MetricCard label="Open" value={kpis.open} tone={kpis.open ? "var(--accent)" : "var(--text-muted)"} />
              <MetricCard label="Overdue" value={kpis.overdue} tone={kpis.overdue ? "var(--status-error)" : "var(--text-muted)"} />
              <MetricCard label="Slippage" value={kpis.late} tone={kpis.late ? "var(--status-warning)" : "var(--text-muted)"} />
              <MetricCard label="Long Lead" value={kpis.longLead} tone={kpis.longLead ? "var(--secondary)" : "var(--text-muted)"} />
            </div>
          </div>

          <div style={{ ...panel, padding: 18, background: "rgba(12,14,17,0.82)" }}>
            <div style={sectionLabel}>Project Scope</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginBottom: 14 }}>
              {selectedProject?.name}
            </div>
            <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
              <InfoRow label="Open Pressure" value={kpis.open} tone={kpis.open ? "var(--accent)" : "var(--text-primary)"} />
              <InfoRow label="Overdue Items" value={kpis.overdue} tone={kpis.overdue ? "var(--status-error)" : "var(--text-primary)"} />
              <InfoRow label="Long Lead Count" value={kpis.longLead} tone={kpis.longLead ? "var(--secondary)" : "var(--text-primary)"} />
            </div>
            <button
              onClick={() => {
                setEditing(null);
                setShowForm(true);
              }}
              style={primaryBtn}
            >
              Create Item
            </button>
          </div>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 18, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ ...panel, padding: 18 }}>
            <div style={sectionLabel}>Filters</div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) auto auto", gap: 12, alignItems: "center" }}>
              <input
                placeholder="Search item or vendor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ ...iStyle, height: 36 }}
              />
              <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} style={{ ...iStyle, width: "auto", height: 36 }}>
                <option value="all">All Categories</option>
                {PROCUREMENT_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ ...iStyle, width: "auto", height: 36 }}>
                <option value="all">All Statuses</option>
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ ...panel, padding: 18 }}>
            <div style={sectionLabel}>Procurement Ledger</div>
            <div
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-card)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 160px 110px 110px 110px 90px 108px",
                  padding: "10px 16px",
                  background: "var(--bg-sidebar)",
                  borderBottom: "1px solid var(--divider)",
                  gap: 12,
                }}
              >
                {["Item / Vendor", "Category", "Status", "Required", "Promised", "Lag", "Actions"].map((column) => (
                  <div
                    key={column}
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: 9,
                      fontWeight: 600,
                      color: "var(--text-muted)",
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                    }}
                  >
                    {column}
                  </div>
                ))}
              </div>

              {isLoading ? (
                <div style={{ textAlign: "center", padding: 32, fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)" }}>
                  Loading procurement items...
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ textAlign: "center", padding: 32, fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)" }}>
                  No procurement items in the current view.
                </div>
              ) : (
                filtered.map((item) => {
                  const catColor = CAT_COLORS[item.procurement_category] || "var(--text-muted)";
                  return (
                    <div
                      key={item.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 160px 110px 110px 110px 90px 108px",
                        padding: "12px 16px",
                        borderBottom: "1px solid var(--divider)",
                        borderLeft: item.isOverdue
                          ? "3px solid var(--status-error)"
                          : item.isLate
                            ? "3px solid var(--status-warning)"
                            : "3px solid transparent",
                        gap: 12,
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                          {item.description || "Unnamed Item"}
                        </div>
                        <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
                          {item.vendor_name || "No vendor assigned"}
                        </div>
                      </div>
                      <div>
                        <span
                          style={{
                            fontFamily: "var(--font-body)",
                            fontSize: 9,
                            fontWeight: 700,
                            color: catColor,
                            background: `${catColor}18`,
                            border: `1px solid ${catColor}33`,
                            padding: "3px 8px",
                            borderRadius: 999,
                            textTransform: "uppercase",
                            display: "inline-block",
                            maxWidth: "100%",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {item.procurement_category || "Other"}
                        </span>
                      </div>
                      <div>
                        <StatusBadge status={item.status} />
                      </div>
                      <div style={{ fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 700, color: item.isOverdue ? "var(--status-error)" : "var(--text-primary)" }}>
                        {item.required_date ? new Date(item.required_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "-"}
                      </div>
                      <div style={{ fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 700, color: item.isLate ? "var(--status-warning)" : "var(--text-primary)" }}>
                        {item.scheduled_date ? new Date(item.scheduled_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "-"}
                      </div>
                      <div
                        style={{
                          fontFamily: "var(--font-display)",
                          fontSize: 13,
                          fontWeight: 700,
                          color:
                            item.isLate
                              ? "var(--status-warning)"
                              : item.daysExposure !== null && item.daysExposure < 0
                                ? "var(--status-success)"
                                : "var(--text-muted)",
                        }}
                      >
                        {item.daysExposure !== null ? (item.daysExposure > 0 ? `+${item.daysExposure}d` : `${item.daysExposure}d`) : "-"}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => { setEditing(item); setShowForm(true); }} style={tinyBtn}>
                          Edit
                        </button>
                        <button
                          onClick={() => setDeleteTarget(item)}
                          style={{ ...tinyBtn, borderColor: "var(--danger-border)", color: "var(--status-error)" }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <aside style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ ...panel, padding: 18 }}>
            <div style={sectionLabel}>Priority Watch</div>
            {riskRows.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {riskRows.map((item) => (
                  <div key={item.id} style={riskCard}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
                      {item.description}
                    </div>
                    <div style={{ fontSize: 11, lineHeight: 1.55, color: "var(--text-secondary)" }}>
                      {item.vendor_name || "No vendor"} · {item.status}
                      {item.required_date ? ` · Need ${new Date(item.required_date).toLocaleDateString()}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
                No overdue, slipping, or long-lead procurement items are visible in the current filter.
              </div>
            )}
          </div>
        </aside>
      </section>

      {showForm && (
        <ProcurementFormModal
          projectId={projectId}
          item={editing}
          vendors={vendors}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSave={(data) => {
            if (editing) updateMut.mutate({ id: editing.id, data });
            else createMut.mutate(data);
          }}
          isSaving={createMut.isPending || updateMut.isPending}
        />
      )}

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteMut.isPending && deleteTarget?.id) deleteMut.mutate(deleteTarget.id);
        }}
        title="Remove Item"
        description="Remove this procurement item? Cannot be undone."
      />
    </div>
  );
}

function ProcurementFormModal({ projectId, item, vendors, onClose, onSave, isSaving = false }) {
  const [form, setForm] = useState(
    item
      ? { ...item }
      : {
          description: "",
          procurement_category: "Other",
          vendor_name: "",
          status: "Identified",
          required_date: "",
          scheduled_date: "",
          notes: "",
          amount: "",
        }
  );
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "var(--bg-surface-secondary)",
          border: "1px solid var(--border-default)",
          borderRadius: 16,
          padding: 24,
          maxWidth: 560,
          width: "95%",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            fontWeight: 700,
            color: "var(--text-primary)",
            margin: "0 0 20px 0",
            textTransform: "uppercase",
            letterSpacing: "0.10em",
          }}
        >
          {item ? "Edit Item" : "Create Item"}
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={{ gridColumn: "span 2" }}>
            <label style={labelStyle}>Item Description *</label>
            <input
              style={iStyle}
              value={form.description || ""}
              onChange={(e) => set("description", e.target.value)}
              required
              placeholder="e.g. W-Shape Mill Order, Joist Package A"
            />
          </div>

          <div>
            <label style={labelStyle}>Category</label>
            <select style={iStyle} value={form.procurement_category || "Other"} onChange={(e) => set("procurement_category", e.target.value)}>
              {PROCUREMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Status</label>
            <select style={iStyle} value={form.status || "Identified"} onChange={(e) => set("status", e.target.value)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Vendor / Supplier</label>
            <input style={iStyle} value={form.vendor_name || ""} onChange={(e) => set("vendor_name", e.target.value)} placeholder="Vendor name" list="vendor-list" />
            <datalist id="vendor-list">
              {vendors.map((v) => (
                <option key={v.id} value={v.company_name} />
              ))}
            </datalist>
          </div>

          <div>
            <label style={labelStyle}>Estimated Value ($)</label>
            <input type="number" style={iStyle} value={form.amount || ""} onChange={(e) => set("amount", e.target.value)} placeholder="0" />
          </div>

          <div>
            <label style={labelStyle}>Required On Site Date</label>
            <input type="date" style={iStyle} value={form.required_date || ""} onChange={(e) => set("required_date", e.target.value)} />
          </div>

          <div>
            <label style={labelStyle}>Promised / Scheduled Date</label>
            <input type="date" style={iStyle} value={form.scheduled_date || ""} onChange={(e) => set("scheduled_date", e.target.value)} />
          </div>

          <div style={{ gridColumn: "span 2" }}>
            <label style={labelStyle}>Notes</label>
            <textarea
              style={{ ...iStyle, minHeight: 60, resize: "vertical" }}
              value={form.notes || ""}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="PO number, lead time, special requirements..."
            />
          </div>

          <div
            style={{
              gridColumn: "span 2",
              display: "flex",
              gap: 8,
              justifyContent: "flex-end",
              paddingTop: 8,
              borderTop: "1px solid var(--divider)",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                borderRadius: 8,
                padding: "8px 16px",
                color: "var(--text-primary)",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                cursor: isSaving ? "not-allowed" : "pointer",
                textTransform: "uppercase",
                opacity: isSaving ? 0.6 : 1,
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (!isSaving) onSave(form);
              }}
              disabled={isSaving || !form.description?.trim()}
              style={{
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "8px 20px",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                cursor: isSaving || !form.description?.trim() ? "not-allowed" : "pointer",
                textTransform: "uppercase",
                opacity: isSaving || !form.description?.trim() ? 0.5 : 1,
              }}
            >
              {isSaving ? (item ? "Saving..." : "Creating...") : item ? "Save Changes" : "Create Item"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, tone }) {
  return (
    <div style={{ ...panel, padding: 16, background: "rgba(12,14,17,0.78)" }}>
      <div style={sectionLabel}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 800, lineHeight: 1, color: tone }}>{value}</div>
    </div>
  );
}

function InfoRow({ label, value, tone = "var(--text-primary)" }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, borderBottom: "1px solid var(--divider)", paddingBottom: 8 }}>
      <span style={{ fontFamily: "var(--font-body)", fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 700, color: tone }}>{value}</span>
    </div>
  );
}

const eyebrow = {
  fontFamily: "var(--font-body)",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "var(--secondary)",
  marginBottom: 10,
};

const heroTitle = {
  fontFamily: "var(--font-display)",
  fontSize: "clamp(30px,4vw,48px)",
  fontWeight: 800,
  lineHeight: 1.02,
  letterSpacing: "-0.04em",
  margin: 0,
  color: "var(--text-primary)",
};

const heroText = {
  margin: "12px 0 0",
  maxWidth: 760,
  fontSize: 15,
  lineHeight: 1.6,
  color: "var(--text-secondary)",
};

const sectionLabel = {
  fontFamily: "var(--font-body)",
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  marginBottom: 10,
};

const primaryBtn = {
  width: "100%",
  background: "var(--accent)",
  color: "var(--on-accent)",
  border: "none",
  borderRadius: "var(--radius-btn)",
  padding: "9px 16px",
  fontFamily: "var(--font-body)",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  cursor: "pointer",
};

const tinyBtn = {
  background: "transparent",
  border: "1px solid var(--border-default)",
  borderRadius: 4,
  padding: "4px 8px",
  color: "var(--text-muted)",
  fontFamily: "var(--font-body)",
  fontSize: 9,
  fontWeight: 700,
  cursor: "pointer",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const riskCard = {
  padding: "10px 12px",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid var(--divider)",
  borderRadius: "var(--radius-card)",
};
