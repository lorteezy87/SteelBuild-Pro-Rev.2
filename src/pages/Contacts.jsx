import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import ContactFormModal from "@/components/contacts/ContactFormModal";
import ContactList from "@/components/contacts/ContactList";
import DeleteDialog from "@/components/shared/DeleteDialog";

const TYPE_COLORS = {
  Owner: "var(--status-error)",
  GC: "var(--status-info)",
  Engineer: "var(--accent)",
  Subcontractor: "var(--status-warning)",
  Supplier: "var(--status-success)",
  Inspector: "var(--text-muted)",
  Internal: "var(--secondary)",
};

const StatCard = ({ label, value, color, active, onClick }) => (
  <div
    onClick={onClick}
    style={{
      padding: "10px 18px",
      borderRight: "1px solid var(--divider)",
      display: "flex",
      flexDirection: "column",
      gap: 4,
      minWidth: 120,
      cursor: onClick ? "pointer" : "default",
      background: active ? `${color}12` : "transparent",
      borderBottom: active ? `2px solid ${color}` : "2px solid transparent",
      transition: "all 0.15s ease",
    }}
  >
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        letterSpacing: "0.14em",
        color: active ? color : "var(--text-muted)",
        textTransform: "uppercase",
        fontWeight: active ? 800 : 700,
      }}
    >
      {label}
    </span>
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 22,
        fontWeight: 800,
        color: color || "var(--text-primary)",
        lineHeight: 1.1,
      }}
    >
      {value}
    </span>
  </div>
);

export default function Contacts() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("project");
  const qc = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filterType, setFilterType] = useState("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState("grid");

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["contacts", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.Contact.filter({ project_id: projectId })
        : base44.entities.Contact.list(),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
  });

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.Contact.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Contact created");
      setShowForm(false);
    },
    onError: (e) => toast.error("Failed: " + (e?.message || "Unknown error")),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Contact.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      setEditingContact(null);
      setShowForm(false);
      toast.success("Contact updated");
    },
    onError: (e) => toast.error("Failed: " + (e?.message || "Unknown error")),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Contact.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      setDeleteTarget(null);
      toast.success("Contact deleted");
    },
    onError: (e) => toast.error("Failed: " + (e?.message || "Delete failed")),
  });

  const selectedProject = projectId ? projects.find((p) => p.id === projectId) : null;

  const filtered = useMemo(() => {
    return contacts.filter((c) => {
      const typeMatch = filterType === "all" || c.contact_type === filterType;
      const q = search.toLowerCase();
      const searchMatch =
        !q ||
        `${c.first_name || ""} ${c.last_name || ""}`.toLowerCase().includes(q) ||
        (c.company || "").toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q) ||
        (c.role || "").toLowerCase().includes(q);
      return typeMatch && searchMatch;
    });
  }, [contacts, filterType, search]);

  const stats = useMemo(() => ({
    total: contacts.length,
    owner: contacts.filter((c) => c.contact_type === "Owner").length,
    gc: contacts.filter((c) => c.contact_type === "GC").length,
    engineer: contacts.filter((c) => c.contact_type === "Engineer").length,
    subcontractor: contacts.filter((c) => c.contact_type === "Subcontractor").length,
    supplier: contacts.filter((c) => c.contact_type === "Supplier").length,
    inspector: contacts.filter((c) => c.contact_type === "Inspector").length,
    internal: contacts.filter((c) => c.contact_type === "Internal").length,
  }), [contacts]);

  const typeOptions = ["all", "Owner", "GC", "Engineer", "Subcontractor", "Supplier", "Inspector", "Internal"];

  if (isLoading) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "48px 24px",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--text-muted)",
          letterSpacing: "0.12em",
        }}
      >
        LOADING CONTACTS...
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <h1
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 24,
              fontWeight: 800,
              letterSpacing: "0.02em",
              margin: 0,
              textTransform: "uppercase",
              color: "var(--text-primary)",
            }}
          >
            Contacts
          </h1>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              color: "var(--text-muted)",
              marginTop: 6,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>{selectedProject ? selectedProject.name : "All Projects"}</span>
            <span style={{ color: "var(--border-strong)" }}>·</span>
            <span>{filtered.length} {filtered.length === 1 ? "Contact" : "Contacts"}</span>
            {filterType !== "all" && (
              <span style={{
                fontFamily: "var(--font-mono)",
                fontSize: 7,
                fontWeight: 700,
                color: "var(--accent)",
                background: "rgba(200,155,32,0.12)",
                border: "1px solid rgba(200,155,32,0.3)",
                padding: "1px 6px",
                borderRadius: "var(--radius-badge)",
                letterSpacing: "0.08em",
              }}>
                FILTERED: {filterType.toUpperCase()}
              </span>
            )}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            style={{
              height: 36,
              borderRadius: "var(--radius-btn)",
              border: "1px solid var(--border-default)",
              padding: "0 14px",
              background: "var(--bg-surface)",
              color: "var(--text-secondary)",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            IMPORT CSV
          </button>
          <button
            onClick={() => { setEditingContact(null); setShowForm(true); }}
            style={{
              height: 36,
              borderRadius: "var(--radius-btn)",
              border: "1px solid var(--accent)",
              padding: "0 14px",
              background: "var(--accent)",
              color: "#fff",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            + New Contact
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <div
        style={{
          display: "flex",
          background: "var(--bg-surface)",
          borderBottom: "1px solid var(--divider)",
          overflowX: "auto",
        }}
      >
        <StatCard label="Total" value={stats.total} color="var(--text-primary)" active={filterType === "all"} onClick={() => setFilterType("all")} />
        <StatCard label="Owner" value={stats.owner} color={TYPE_COLORS.Owner} active={filterType === "Owner"} onClick={() => setFilterType(filterType === "Owner" ? "all" : "Owner")} />
        <StatCard label="GC" value={stats.gc} color={TYPE_COLORS.GC} active={filterType === "GC"} onClick={() => setFilterType(filterType === "GC" ? "all" : "GC")} />
        <StatCard label="Engineer" value={stats.engineer} color={TYPE_COLORS.Engineer} active={filterType === "Engineer"} onClick={() => setFilterType(filterType === "Engineer" ? "all" : "Engineer")} />
        <StatCard label="Subcontractor" value={stats.subcontractor} color={TYPE_COLORS.Subcontractor} active={filterType === "Subcontractor"} onClick={() => setFilterType(filterType === "Subcontractor" ? "all" : "Subcontractor")} />
        <StatCard label="Supplier" value={stats.supplier} color={TYPE_COLORS.Supplier} active={filterType === "Supplier"} onClick={() => setFilterType(filterType === "Supplier" ? "all" : "Supplier")} />
        <StatCard label="Inspector" value={stats.inspector} color={TYPE_COLORS.Inspector} active={filterType === "Inspector"} onClick={() => setFilterType(filterType === "Inspector" ? "all" : "Inspector")} />
        <StatCard label="Internal" value={stats.internal} color={TYPE_COLORS.Internal} active={filterType === "Internal"} onClick={() => setFilterType(filterType === "Internal" ? "all" : "Internal")} />
      </div>

      {/* Search Bar — prominent, full width */}
      <div style={{ position: "relative" }}>
        <span style={{
          position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
          fontSize: 14, color: "var(--text-muted)", pointerEvents: "none",
        }}>🔍</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, company, email, or role..."
          style={{
            background: "var(--bg-input)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-input)",
            padding: "10px 14px 10px 38px",
            color: "var(--text-primary)",
            fontFamily: "var(--font-body)",
            fontSize: 13,
            outline: "none",
            width: "100%",
            boxSizing: "border-box",
          }}
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            style={{
              position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", color: "var(--text-muted)",
              cursor: "pointer", fontSize: 14, padding: 4,
            }}
          >✕</button>
        )}
      </div>

      {/* Filter bar + View toggle */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", flex: 1 }}>
          {typeOptions.map((t) => {
            const isActive = filterType === t;
            const typeColor = t !== "all" ? TYPE_COLORS[t] : null;
            return (
              <button
                key={t}
                onClick={() => setFilterType(filterType === t && t !== "all" ? "all" : t)}
                style={{
                  padding: "6px 10px",
                  borderRadius: "var(--radius-btn)",
                  border: isActive
                    ? `1px solid ${typeColor || "var(--accent)"}`
                    : "1px solid var(--divider)",
                  background: isActive
                    ? `${typeColor || "var(--accent)"}18`
                    : "var(--bg-surface)",
                  color: isActive
                    ? (typeColor || "var(--accent)")
                    : "var(--text-secondary)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  fontWeight: 700,
                  cursor: "pointer",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  boxShadow: isActive ? `0 0 0 1px ${typeColor || "var(--accent)"}44` : "none",
                  transition: "all 0.15s ease",
                }}
              >
                {t}
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          {["grid", "list"].map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: "6px 10px",
                borderRadius: "var(--radius-btn)",
                border: view === v ? "1px solid var(--accent)" : "1px solid var(--divider)",
                background: view === v ? "rgba(200,155,32,0.12)" : "var(--bg-surface)",
                color: view === v ? "var(--accent)" : "var(--text-secondary)",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {v === "grid" ? "⊞ Grid" : "≡ List"}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <ContactList
        contacts={filtered}
        view={view}
        onEdit={(c) => { setEditingContact(c); setShowForm(true); }}
        onDelete={setDeleteTarget}
        onAdd={() => { setEditingContact(null); setShowForm(true); }}
      />

      {(showForm || editingContact) && (
        <ContactFormModal
          projectId={projectId}
          contact={editingContact}
          onClose={() => { setShowForm(false); setEditingContact(null); }}
          onSave={(data) => {
            if (editingContact) {
              updateMut.mutate({ id: editingContact.id, data });
            } else {
              createMut.mutate(data);
            }
          }}
        />
      )}

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
        title="Delete Contact"
        description={`Delete ${deleteTarget?.first_name} ${deleteTarget?.last_name}? This cannot be undone.`}
      />
    </div>
  );
}
