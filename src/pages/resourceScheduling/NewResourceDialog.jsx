import React from "react";
import { toast } from "sonner";

/**
 * Inline "New Resource" dialog used by the Crew Scheduling page.
 * Plain fixed overlay (no Radix), no <form> tag. Parent owns state
 * (newRes + setNewRes) and the mutation — this just renders.
 */
export default function NewResourceDialog({
  open,
  newRes,
  setNewRes,
  topLevelResources = [],
  createResMut,
  onClose,
}) {
  if (!open) return null;

  const fields = [
    { key: "name",               label: "Name",             type: "text",          placeholder: "e.g. Crew Alpha, Bay 3 Crane" },
    { key: "resource_type",      label: "Type",             type: "select",        options: ["Crew", "Equipment", "Bay", "Subcontractor", "Other"] },
    { key: "role",               label: "Role / Specialty", type: "text",          placeholder: "e.g. Ironworkers, Welders" },
    { key: "parent_resource_id", label: "Parent Crew",      type: "parent-select", help: "Assign to a crew. Crews roll up member capacities." },
    { key: "capacity",           label: "Capacity",         type: "number",        placeholder: "e.g. 40" },
    { key: "unit",               label: "Unit",             type: "select",        options: ["hours", "tons", "pieces", "days"] },
    { key: "cost_rate",          label: "Cost Rate ($/hr)", type: "number",        placeholder: "0.00" },
    { key: "availability",       label: "Availability",     type: "select",        options: ["Available", "Partially Available", "Committed", "Unavailable"] },
    { key: "notes",              label: "Notes",            type: "textarea",      placeholder: "Optional notes..." },
  ];

  const handleCreate = () => {
    if (!newRes.name.trim()) {
      toast.error("Name is required");
      return;
    }
    createResMut.mutate({
      name:               newRes.name.trim(),
      resource_type:      newRes.resource_type,
      role:               newRes.role,
      capacity:           newRes.capacity ? Number(newRes.capacity) : null,
      unit:               newRes.unit,
      cost_rate:          newRes.cost_rate ? Number(newRes.cost_rate) : null,
      availability:       newRes.availability,
      notes:              newRes.notes,
      parent_resource_id: newRes.parent_resource_id || null,
    });
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 100 }}
      />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        background: "var(--bg-surface)", border: "1px solid var(--border-default)",
        borderRadius: 12, padding: 28, width: 420, zIndex: 101,
        boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
      }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 20 }}>
          New Resource
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {fields.map(({ key, label, type, placeholder, options, help }) => (
            <div key={key}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 4 }}>
                {label}
              </div>
              {type === "select" ? (
                <select value={newRes[key]} onChange={(e) => setNewRes(p => ({ ...p, [key]: e.target.value }))} style={inputStyle}>
                  {options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : type === "parent-select" ? (
                <>
                  <select value={newRes[key] || ""} onChange={(e) => setNewRes(p => ({ ...p, [key]: e.target.value }))} style={inputStyle}>
                    <option value="">— None (top-level) —</option>
                    {topLevelResources.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.name}{r.resource_type ? ` · ${r.resource_type}` : ""}
                      </option>
                    ))}
                  </select>
                  {help && (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 3, letterSpacing: "0.06em" }}>
                      {help}
                    </div>
                  )}
                </>
              ) : type === "textarea" ? (
                <textarea
                  value={newRes[key]}
                  onChange={(e) => setNewRes(p => ({ ...p, [key]: e.target.value }))}
                  placeholder={placeholder}
                  style={{ ...inputStyle, minHeight: 50, resize: "vertical", boxSizing: "border-box" }}
                />
              ) : (
                <input
                  type={type}
                  value={newRes[key]}
                  onChange={(e) => setNewRes(p => ({ ...p, [key]: e.target.value }))}
                  placeholder={placeholder}
                  style={{ ...inputStyle, boxSizing: "border-box" }}
                />
              )}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={btnGhost}>CANCEL</button>
          <button
            onClick={handleCreate}
            disabled={createResMut.isPending}
            style={{ ...btnPrimary, opacity: createResMut.isPending ? 0.6 : 1 }}
          >
            {createResMut.isPending ? "SAVING…" : "CREATE RESOURCE"}
          </button>
        </div>
      </div>
    </>
  );
}

const inputStyle = {
  width: "100%",
  padding: "7px 10px",
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: 6,
  fontSize: 12,
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  outline: "none",
};

const btnGhost = {
  padding: "8px 16px", borderRadius: 6, border: "1px solid var(--border-default)",
  background: "transparent", color: "var(--text-muted)",
  fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
  letterSpacing: "0.08em", cursor: "pointer", textTransform: "uppercase",
};

const btnPrimary = {
  padding: "8px 20px", borderRadius: 6, border: "none",
  background: "var(--accent)", color: "#07090E",
  fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 800,
  letterSpacing: "0.08em", cursor: "pointer", textTransform: "uppercase",
};
