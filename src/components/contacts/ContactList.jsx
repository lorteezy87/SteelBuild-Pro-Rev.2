import React from "react";

const TYPE_COLORS = {
  Owner: "var(--status-error)",
  GC: "var(--status-info)",
  Engineer: "var(--accent)",
  Subcontractor: "var(--status-warning)",
  Supplier: "var(--status-success)",
  Inspector: "var(--text-muted)",
  Internal: "var(--status-info)",
};

export default function ContactList({ contacts }) {
  if (contacts.length === 0) {
    return (
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "12px", padding: "40px", textAlign: "center" }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>No contacts</p>
      </div>
    );
  }

  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "12px", overflow: "hidden" }}>
      {contacts.map((contact, idx) => (
        <div key={contact.id} style={{ padding: "14px 16px", borderBottom: idx < contacts.length - 1 ? "1px solid var(--divider)" : "none", display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "16px", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>{contact.first_name} {contact.last_name}</div>
            {contact.company && <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>{contact.company}</div>}
            {contact.role && <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>{contact.role}</div>}
          </div>

          <div>
            {contact.email && <div style={{ fontSize: "10px", color: "var(--text-secondary)", marginBottom: "2px" }}>📧 {contact.email}</div>}
            {contact.phone && <div style={{ fontSize: "10px", color: "var(--text-secondary)" }}>📞 {contact.phone}</div>}
          </div>

          <div style={{ display: "inline-flex", alignItems: "center", padding: "4px 8px", background: `${TYPE_COLORS[contact.contact_type]}20`, border: `1px solid ${TYPE_COLORS[contact.contact_type]}40`, borderRadius: "6px" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 600, color: TYPE_COLORS[contact.contact_type], textTransform: "uppercase", letterSpacing: "0.06em" }}>{contact.contact_type}</span>
          </div>
        </div>
      ))}
    </div>
  );
}