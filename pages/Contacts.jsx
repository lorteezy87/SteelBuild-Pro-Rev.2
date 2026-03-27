import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import ContactFormModal from "@/components/contacts/ContactFormModal";
import ContactList from "@/components/contacts/ContactList";

export default function Contacts() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("project");
  const [showForm, setShowForm] = useState(false);
  const [filterType, setFilterType] = useState("all");

  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.Contact.filter({ project_id: projectId })
        : base44.entities.Contact.list(),
    initialData: [],
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
  });

  const selectedProject = projectId
    ? projects.find((p) => p.id === projectId)
    : null;

  const filtered = contacts.filter((c) => {
    const typeMatch = filterType === "all" || c.contact_type === filterType;
    return typeMatch;
  });

  const stats = {
    total: contacts.length,
    owner: contacts.filter((c) => c.contact_type === "Owner").length,
    gc: contacts.filter((c) => c.contact_type === "GC").length,
    engineer: contacts.filter((c) => c.contact_type === "Engineer").length,
    subcontractor: contacts.filter((c) => c.contact_type === "Subcontractor").length,
    supplier: contacts.filter((c) => c.contact_type === "Supplier").length,
    inspector: contacts.filter((c) => c.contact_type === "Inspector").length,
    internal: contacts.filter((c) => c.contact_type === "Internal").length,
  };

  const types = ["Owner", "GC", "Engineer", "Subcontractor", "Supplier", "Inspector", "Internal"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 24,
              fontWeight: 800,
              color: "var(--text-primary)",
              margin: 0,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Contacts
          </h1>
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 10,
              fontWeight: 700,
              color: "var(--text-muted)",
              marginTop: 4,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {selectedProject ? selectedProject.name : "All Projects"} • {filtered.length} Contacts
          </p>
        </div>

        <button
          onClick={() => setShowForm(true)}
          style={{
            background: "var(--accent)",
            color: "white",
            border: "none",
            borderRadius: "var(--radius-btn)",
            padding: "8px 16px",
            fontFamily: "var(--font-body)",
            fontSize: "10px",
            fontWeight: 700,
            cursor: "pointer",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
        >
          + New Contact
        </button>
      </div>

      {/* Stats Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: "12px" }}>
        <StatCard label="Total" value={stats.total} color="var(--accent)" />
        <StatCard label="Owner" value={stats.owner} color="var(--status-error)" />
        <StatCard label="GC" value={stats.gc} color="var(--status-info)" />
        <StatCard label="Engineer" value={stats.engineer} color="var(--accent)" />
        <StatCard label="Subs" value={stats.subcontractor} color="var(--status-warning)" />
        <StatCard label="Suppliers" value={stats.supplier} color="var(--status-success)" />
        <StatCard label="Inspectors" value={stats.inspector} color="var(--text-muted)" />
        <StatCard label="Internal" value={stats.internal} color="var(--status-info)" />
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "9px",
            color: "var(--text-muted)",
            alignSelf: "center",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Type:
        </span>
        {["all", ...types].map((type) => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            style={{
              background: filterType === type ? "var(--accent)" : "var(--bg-surface-low)",
              color: filterType === type ? "white" : "var(--text-secondary)",
              border: "none",
              borderRadius: "var(--radius-btn)",
              padding: "5px 12px",
              fontFamily: "var(--font-body)",
              fontSize: "8px",
              fontWeight: 700,
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {type === "all" ? "All" : type}
          </button>
        ))}
      </div>

      {/* Form Modal */}
      {showForm && (
        <ContactFormModal projectId={projectId} onClose={() => setShowForm(false)} />
      )}

      {/* Contacts List */}
      <ContactList contacts={filtered} />
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "none",
        borderRadius: "var(--radius-card)",
        padding: "12px",
        borderTop: `2px solid ${color}`,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "18px",
          fontWeight: 600,
          color: color,
          marginBottom: "4px",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: "var(--font-body)",
          fontSize: "8px",
          fontWeight: 700,
          color: "var(--text-muted)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
    </div>
  );
}