import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import ContactFormModal from "@/components/contacts/ContactFormModal";
import ContactList from "@/components/contacts/ContactList";
import DeleteDialog from "@/components/shared/DeleteDialog";
import { CommandBar, KpiTile } from "@/components/design-system";
import { Plus, Upload } from "lucide-react";
import { useProjectId } from "@/hooks/useProjectId";
import { CONTACT_TYPE } from "@/lib/enums";

const TYPE_COLORS = {
  [CONTACT_TYPE.OWNER]: "var(--status-error)",
  [CONTACT_TYPE.GC]: "var(--status-info)",
  [CONTACT_TYPE.ENGINEER]: "var(--accent)",
  [CONTACT_TYPE.SUBCONTRACTOR]: "var(--status-warning)",
  [CONTACT_TYPE.SUPPLIER]: "var(--status-success)",
  [CONTACT_TYPE.INSPECTOR]: "var(--text-muted)",
  [CONTACT_TYPE.INTERNAL]: "var(--secondary)",
};

export default function Contacts() {
  const projectId = useProjectId();
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
    staleTime: 5 * 60 * 1000,
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
    owner: contacts.filter((c) => c.contact_type === CONTACT_TYPE.OWNER).length,
    gc: contacts.filter((c) => c.contact_type === CONTACT_TYPE.GC).length,
    engineer: contacts.filter((c) => c.contact_type === CONTACT_TYPE.ENGINEER).length,
    subcontractor: contacts.filter((c) => c.contact_type === CONTACT_TYPE.SUBCONTRACTOR).length,
    supplier: contacts.filter((c) => c.contact_type === CONTACT_TYPE.SUPPLIER).length,
    inspector: contacts.filter((c) => c.contact_type === CONTACT_TYPE.INSPECTOR).length,
    internal: contacts.filter((c) => c.contact_type === CONTACT_TYPE.INTERNAL).length,
  }), [contacts]);

  const typeOptions = ["all", ...Object.values(CONTACT_TYPE)];

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
      <CommandBar
        eyebrow={selectedProject ? selectedProject.name : "ALL PROJECTS"}
        title="Contacts"
        count={filtered.length}
        unit=" · CONTACTS"
        subtitle={`Project directory · Owner / GC / Engineer / Subs / Suppliers / Inspectors${filterType !== "all" ? ` · filtered: ${filterType}` : ""}`}
      >
        <button
          className="sbd-btn"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 12px",
            fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
            letterSpacing: "0.08em", textTransform: "uppercase",
          }}
        >
          <Upload size={12} /> Import CSV
        </button>
        <button
          onClick={() => { setEditingContact(null); setShowForm(true); }}
          className="sbd-btn sbd-btn-primary"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 14px",
            fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
            letterSpacing: "0.08em", textTransform: "uppercase",
          }}
        >
          <Plus size={12} /> New Contact
        </button>
      </CommandBar>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
        <KpiTile compact label="Total"        value={stats.total}          color="var(--accent)"                active={filterType === "all"}           onClick={() => setFilterType("all")} />
        <KpiTile compact label="Owner"        value={stats.owner}          color={TYPE_COLORS.Owner}            active={filterType === "Owner"}         onClick={() => setFilterType(filterType === "Owner" ? "all" : "Owner")} />
        <KpiTile compact label="GC"           value={stats.gc}             color={TYPE_COLORS.GC}               active={filterType === "GC"}            onClick={() => setFilterType(filterType === "GC" ? "all" : "GC")} />
        <KpiTile compact label="Engineer"     value={stats.engineer}       color={TYPE_COLORS.Engineer}         active={filterType === "Engineer"}      onClick={() => setFilterType(filterType === "Engineer" ? "all" : "Engineer")} />
        <KpiTile compact label="Subs"         value={stats.subcontractor}  color={TYPE_COLORS.Subcontractor}    active={filterType === "Subcontractor"} onClick={() => setFilterType(filterType === "Subcontractor" ? "all" : "Subcontractor")} />
        <KpiTile compact label="Supplier"     value={stats.supplier}       color={TYPE_COLORS.Supplier}         active={filterType === "Supplier"}      onClick={() => setFilterType(filterType === "Supplier" ? "all" : "Supplier")} />
        <KpiTile compact label="Inspector"    value={stats.inspector}      color={TYPE_COLORS.Inspector}        active={filterType === "Inspector"}     onClick={() => setFilterType(filterType === "Inspector" ? "all" : "Inspector")} />
        <KpiTile compact label="Internal"     value={stats.internal}       color={TYPE_COLORS.Internal}         active={filterType === "Internal"}      onClick={() => setFilterType(filterType === "Internal" ? "all" : "Internal")} />
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
