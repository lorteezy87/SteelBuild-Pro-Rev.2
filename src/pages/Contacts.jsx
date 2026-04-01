import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useProjectContext } from "@/components/shared/useProjectContext";
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

const StatCard = ({ label, value, color }) => (
  <div
    style={{
      padding: "10px 18px",
      borderRight: "1px solid var(--divider)",
      display: "flex",
      flexDirection: "column",
      gap: 4,
      minWidth: 120,
    }}
  >
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        letterSpacing: "0.14em",
        color: "var(--text-muted)",
        textTransform: "uppercase",
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
  const { activeProject } = useProjectContext();
  const projectId = searchParams.get("project") || activeProject?.id || null;
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
        : [],
    initialData: [],
    enabled: !!projectId,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Contact.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      setEditingContact(null);
      setShowForm(false);
      toast.success("Contact updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Contact.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      setDeleteTarget(null);
      toast.success("Contact deleted");
    },
    onError: () => toast.error("Delete failed"),
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
            <span style={{ color: "var(--border-strong)" }}>|</span>
            <span>{filtered.length} {filtered.length === 1 ? "Contact" : "Contacts"}</span>
            {stats.owner + stats.gc + stats.engineer + stats.subcontractor + stats.supplier + stats.inspector + stats.internal - filtered.length > 0 && (
              <span style={{
                fontFamily: "var(--font-mono)",
                fontSize: 7,
                fontWeight: 700,
                color: "var(--status-error)",
                background: "var(--danger-muted)",
                border: "1px solid var(--danger-border)",
                padding: "1px 6px",
                borderRadius: "var(--radius-badge)",
                letterSpacing: "0.08em",
              }}>
                {contacts.length - filtered.length} FILTERED OUT
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => { setEditingContact(null); setShowForm(true); }}
          style={{
            height: 36,
            borderRadius: "var(--radius-btn)",
            border: "1px solid var(--accent)",
            padding: "0 14px",
            background: "var(--accent)",
            color: "#0A0A0B",
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Create Contact
        </button>
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
        <StatCard label="Total" value={stats.total} color="var(--text-primary)" />
        <StatCard label="Owner" value={stats.owner} color={TYPE_COLORS.Owner} />
        <StatCard label="GC" value={stats.gc} color={TYPE_COLORS.GC} />
        <StatCard label="Engineer" value={stats.engineer} color={TYPE_COLORS.Engineer} />
        <StatCard label="Subcontractor" value={stats.subcontractor} color={TYPE_COLORS.Subcontractor} />
        <StatCard label="Supplier" value={stats.supplier} color={TYPE_COLORS.Supplier} />
        <StatCard label="Inspector" value={stats.inspector} color={TYPE_COLORS.Inspector} />
        <StatCard label="Internal" value={stats.internal} color={TYPE_COLORS.Internal} />
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", maxWidth: 280, flex: "1 1 220px" }}>
          <span style={{
            position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
            fontSize: 11, color: "var(--text-muted)", pointerEvents: "none",
          }}>🔍</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contacts..."
            style={{
              background: "var(--bg-input)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-input)",
              padding: "7px 12px 7px 32px",
              color: "var(--text-primary)",
              fontFamily: "var(--font-body)",
              fontSize: 12,
              outline: "none",
              width: "100%",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {typeOptions.map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              style={{
                padding: "6px 10px",
                borderRadius: "var(--radius-btn)",
                border: "1px solid var(--divider)",
                background: filterType === t ? "var(--accent)" : "var(--bg-surface)",
                color: filterType === t ? "#0A0A0B" : "var(--text-primary)",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                fontWeight: 700,
                cursor: "pointer",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {["grid", "list"].map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: "6px 10px",
                borderRadius: "var(--radius-btn)",
                border: "1px solid var(--divider)",
                background: view === v ? "var(--accent)" : "var(--bg-surface)",
                color: view === v ? "#0A0A0B" : "var(--text-primary)",
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
      />

      {(showForm || editingContact) && (
        <ContactFormModal
          projectId={projectId}
          contact={editingContact}
          onClose={() => { setShowForm(false); setEditingContact(null); }}
          onSave={(data) => {
            if (editingContact) {
              updateMut.mutate({ id: editingContact.id, data });
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

