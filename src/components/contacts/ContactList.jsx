import React from "react";

const TYPE_COLORS = {
  Owner: "var(--status-error)",
  GC: "var(--status-info)",
  Engineer: "var(--accent)",
  Subcontractor: "var(--status-warning)",
  Supplier: "var(--status-success)",
  Inspector: "var(--text-muted)",
  Internal: "var(--secondary)",
};

export default function ContactList({ contacts, view, onEdit, onDelete, onAdd }) {
  if (contacts.length === 0) {
    return (
      <div style={{
        background: "var(--bg-surface)", border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)", padding: "56px 40px", textAlign: "center",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
      }}>
        {/* Icon */}
        <div style={{
          width: 64, height: 64, borderRadius: "50%",
          background: "rgba(200,155,32,0.10)", border: "2px solid rgba(200,155,32,0.22)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28,
        }}>👤</div>

        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
            No Contacts Yet
          </div>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", maxWidth: 360, margin: "0 auto", lineHeight: 1.5 }}>
            Add your project team, vendors, and stakeholders to keep everyone connected. Import from a spreadsheet or add them one at a time.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button
            onClick={() => onAdd?.()}
            style={{
              padding: "8px 16px", borderRadius: "var(--radius-btn)",
              background: "var(--accent)", border: "none",
              color: "#fff", fontFamily: "var(--font-mono)",
              fontSize: 10, fontWeight: 700, cursor: "pointer",
              letterSpacing: "0.08em",
            }}
          >
            + ADD CONTACT
          </button>
          <button
            style={{
              padding: "8px 16px", borderRadius: "var(--radius-btn)",
              background: "transparent", border: "1px solid var(--border-default)",
              color: "var(--text-secondary)", fontFamily: "var(--font-mono)",
              fontSize: 10, fontWeight: 700, cursor: "pointer",
              letterSpacing: "0.08em",
            }}
          >
            IMPORT CSV
          </button>
        </div>

        {/* Ghost skeleton preview */}
        <div style={{ width: "100%", maxWidth: 600, marginTop: 16, opacity: 0.25 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{
              display: "flex", gap: 12, alignItems: "center", padding: "12px 0",
              borderBottom: "1px solid var(--divider)",
            }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--bg-surface-high)" }} />
              <div style={{ flex: 1 }}>
                <div style={{ width: `${60 + i * 10}%`, height: 10, background: "var(--bg-surface-high)", borderRadius: 4, marginBottom: 6 }} />
                <div style={{ width: `${40 + i * 5}%`, height: 8, background: "var(--bg-surface-high)", borderRadius: 4 }} />
              </div>
              <div style={{ width: 60, height: 8, background: "var(--bg-surface-high)", borderRadius: 4 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (view === "list") return <ListView contacts={contacts} onEdit={onEdit} onDelete={onDelete} />;
  return <GridView contacts={contacts} onEdit={onEdit} onDelete={onDelete} />;
}

const GridView = ({ contacts, onEdit, onDelete }) => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
    {contacts.map((c) => {
      const color = TYPE_COLORS[c.contact_type] || "var(--border-default)";
      const initials = `${(c.first_name || "?")[0]}${(c.last_name || "?")[0]}`.toUpperCase();
      return (
        <div
          key={c.id}
          style={{
            position: "relative",
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderLeft: `4px solid ${color}`,
            borderRadius: "var(--radius-card)",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            cursor: "pointer",
            transition: "background 0.1s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-surface-mid)";
            const qa = e.currentTarget.querySelector('.contact-quick-actions');
            if (qa) qa.style.opacity = '1';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--bg-surface)";
            const qa = e.currentTarget.querySelector('.contact-quick-actions');
            if (qa) qa.style.opacity = '0';
          }}
        >
          {/* Quick action hover buttons */}
          <div className="contact-quick-actions" style={{
            position: "absolute", top: 8, right: 8,
            display: "flex", gap: 4, opacity: 0, transition: "opacity 0.15s",
          }}>
            {c.email && (
              <a href={`mailto:${c.email}`} title={`Email ${c.first_name}`}
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: 26, height: 26, borderRadius: 6,
                  background: "var(--bg-surface-high)", border: "1px solid var(--border-default)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, textDecoration: "none", color: "var(--text-secondary)",
                }}>✉</a>
            )}
            {c.phone && (
              <a href={`tel:${c.phone}`} title={`Call ${c.first_name}`}
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: 26, height: 26, borderRadius: 6,
                  background: "var(--bg-surface-high)", border: "1px solid var(--border-default)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, textDecoration: "none", color: "var(--text-secondary)",
                }}>☎</a>
            )}
          </div>
          {c.notes && !c.email && !c.phone && (
            <span
              title={c.notes}
              style={{ position: "absolute", top: 10, right: 10, fontSize: 10, color: "var(--text-muted)" }}
            >
              📝
            </span>
          )}
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: `${color}22`,
                border: `1px solid ${color}44`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 700,
                color,
                fontFamily: "var(--font-mono)",
                flexShrink: 0,
              }}
            >
              {initials}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.2, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                {c.first_name} {c.last_name}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                {c.company || "—"}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontStyle: "italic", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                {c.role || "—"}
              </div>
            </div>
          </div>

          <div style={{ height: 1, background: "var(--divider)", margin: "4px 0" }} />

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
              <span style={{ color, marginRight: 6, fontSize: 10 }}>✉</span>
              {c.email || "—"}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
              <span style={{ color, marginRight: 6, fontSize: 10 }}>☎</span>
              {c.phone || "—"}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span
              style={{
                background: `${color}18`,
                color,
                fontFamily: "var(--font-mono)",
                fontSize: 7,
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: "var(--radius-badge)",
                textTransform: "uppercase",
                letterSpacing: "0.10em",
              }}
            >
              {c.contact_type}
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={(e) => { e.stopPropagation(); onEdit?.(c); }}
                style={{
                  background: "var(--bg-surface-high)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-btn)",
                  padding: "4px 10px",
                  color: "var(--text-secondary)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 8,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                EDIT
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete?.(c); }}
                style={{
                  background: "var(--bg-surface-high)",
                  border: "1px solid var(--danger-border)",
                  borderRadius: "var(--radius-btn)",
                  padding: "4px 10px",
                  color: "var(--status-error)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 8,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      );
    })}
  </div>
);

const ListView = ({ contacts, onEdit, onDelete }) => (
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
        background: "var(--bg-surface-secondary)",
        borderBottom: "1px solid var(--divider)",
        padding: "10px 16px",
        display: "grid",
        gridTemplateColumns: "36px 2fr 1.5fr 1fr 1.5fr 1fr 90px",
        gap: 12,
        alignItems: "center",
      }}
    >
      {["", "Name", "Company", "Type", "Email", "Phone", "Actions"].map((h) => (
        <span
          key={h}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 700,
            color: "var(--text-muted)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          {h}
        </span>
      ))}
    </div>

    {contacts.map((c) => {
      const color = TYPE_COLORS[c.contact_type] || "var(--border-default)";
      const initials = `${(c.first_name || "?")[0]}${(c.last_name || "?")[0]}`.toUpperCase();
      return (
        <div
          key={c.id}
          style={{
            display: "grid",
            gridTemplateColumns: "36px 2fr 1.5fr 1fr 1.5fr 1fr 90px",
            gap: 12,
            padding: "11px 16px",
            borderBottom: "1px solid var(--divider)",
            alignItems: "center",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--bg-surface)")}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: color,
              display: "inline-block",
            }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
              {c.first_name} {c.last_name}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
              {c.role || "—"}
            </div>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
            {c.company || "—"}
          </div>
          <span
            style={{
              background: `${color}18`,
              color,
              fontFamily: "var(--font-mono)",
              fontSize: 7,
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: "var(--radius-badge)",
              textTransform: "uppercase",
              letterSpacing: "0.10em",
              justifySelf: "flex-start",
            }}
          >
            {c.contact_type}
          </span>
          <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-secondary)", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
            {c.email ? (
              <a href={`mailto:${c.email}`} style={{ color: "var(--accent)", textDecoration: "none" }}>{c.email}</a>
            ) : (
              "—"
            )}
          </div>
          <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-secondary)", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
            {c.phone || "—"}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={(e) => { e.stopPropagation(); onEdit?.(c); }}
              style={{
                background: "var(--bg-surface-high)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-btn)",
                padding: "4px 10px",
                color: "var(--text-secondary)",
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              EDIT
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete?.(c); }}
              style={{
                background: "var(--bg-surface-high)",
                border: "1px solid var(--danger-border)",
                borderRadius: "var(--radius-btn)",
                padding: "4px 10px",
                color: "var(--status-error)",
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>
        </div>
      );
    })}
  </div>
);
