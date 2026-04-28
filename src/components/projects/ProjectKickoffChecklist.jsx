/**
 * ProjectKickoffChecklist
 *
 * The "Turnover Checklist" tab from the S&H estimating workbook.
 * Mirrors the paper form's two groups:
 *   - Basic Info     — drawing date, LOI, contract value (read-only),
 *                       GC contract present, LDs, job type
 *   - Involved Parties — detailer (FK), joist mfr, deck mfr, deck installer,
 *                       special coatings, engineering firm
 *
 * Persists every field directly on the `projects` row via base44. Each
 * cell is click-to-edit — no separate save button — so the page works
 * the same way as InlineEditField does on the dashboard.
 *
 * The "Kickoff Complete" toggle flips both `kickoff_complete=true` and
 * stamps `kickoff_completed_at=now()` so the small status pill in the
 * project header can read either field without doing a join.
 */

import React, { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import InlineEditField from "@/components/shared/InlineEditField";

const JOB_TYPES = [
  "Beams/Deck",
  "Beams/Joists/Deck",
  "Joist Deck",
  "Tilt",
  "Tilt Hybrid",
  "Misc.",
  "Other",
];

const mono = { fontFamily: "var(--font-mono)" };

function FieldRow({ label, children }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "180px 1fr",
      alignItems: "center",
      gap: 12,
      padding: "8px 0",
      borderBottom: "1px solid var(--divider)",
    }}>
      <div style={{
        ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.10em",
        textTransform: "uppercase", color: "var(--text-muted)",
      }}>
        {label}
      </div>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

function GroupHeader({ children }) {
  return (
    <div style={{
      ...mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
      textTransform: "uppercase", color: "var(--text-primary)",
      paddingBottom: 6, marginBottom: 8,
      borderBottom: "1px solid var(--divider)",
    }}>
      {children}
    </div>
  );
}

/**
 * Inline boolean toggle — Yes / No / unset (null). The middle "—" state
 * exists because the workbook uses blanks for "not yet known".
 */
function YesNoCell({ value, onSave }) {
  const set = (v) => { if (v !== value) onSave(v); };
  const cell = (label, v, color) => {
    const active = value === v;
    return (
      <button
        key={label}
        onClick={() => set(v)}
        style={{
          background: active ? color + "18" : "transparent",
          border: `1px solid ${active ? color : "var(--border-default)"}`,
          borderRadius: 3,
          padding: "3px 10px",
          ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
          color: active ? color : "var(--text-muted)",
          cursor: "pointer",
          textTransform: "uppercase",
        }}
      >
        {label}
      </button>
    );
  };
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {cell("Yes", true,  "var(--status-success)")}
      {cell("No",  false, "var(--status-error)")}
      {cell("—",   null,  "var(--text-muted)")}
    </div>
  );
}

/** Job-type select — small custom dropdown over a click-to-open menu. */
function JobTypeCell({ value, onSave }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          background: "transparent",
          border: "1px dashed transparent",
          borderRadius: 3,
          padding: "3px 8px",
          ...mono, fontSize: 11, fontWeight: 600,
          color: value ? "var(--text-primary)" : "var(--text-muted)",
          fontStyle: value ? "normal" : "italic",
          cursor: "pointer",
          textAlign: "left",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent-border)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "transparent"; }}
      >
        {value || "Select job type"} <span style={{ opacity: 0.5 }}>▾</span>
      </button>
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 30 }}
          />
          <div style={{
            position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 31,
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: 6,
            padding: 4,
            minWidth: 180,
            boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
          }}>
            {JOB_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => { setOpen(false); if (t !== value) onSave(t); }}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  background: t === value ? "var(--accent-muted)" : "transparent",
                  border: "none",
                  borderRadius: 3,
                  padding: "5px 10px",
                  fontFamily: "var(--font-body)", fontSize: 12,
                  color: t === value ? "var(--accent)" : "var(--text-primary)",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--hover-bg)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = t === value ? "var(--accent-muted)" : "transparent"; }}
              >
                {t}
              </button>
            ))}
            {value && (
              <button
                onClick={() => { setOpen(false); onSave(null); }}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  background: "transparent",
                  border: "none",
                  borderTop: "1px solid var(--divider)",
                  marginTop: 4, paddingTop: 6,
                  borderRadius: 3,
                  padding: "5px 10px",
                  fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  textTransform: "uppercase",
                }}
              >
                Clear
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Detailer contact selector — pulls `contacts` and offers a typeahead
 * by company name. Stores the contact id; renders the contact name.
 * Falls back to a free-text fallback if no contacts exist yet.
 */
function DetailerCell({ projectId, project, contacts }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const current = contacts.find((c) => c.id === project?.detailer_contact_id) || null;

  const updateMut = useMutation({
    mutationFn: (patch) => base44.entities.Project.update(projectId, patch),
    onSuccess: (_, patch) => {
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Detailer updated");
      void patch;
    },
    onError: (e) => toast.error(`Save failed: ${e.message || "unknown"}`),
  });

  const filtered = contacts
    .filter((c) => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (c.company || "").toLowerCase().includes(q) ||
             (c.full_name || "").toLowerCase().includes(q) ||
             (c.email || "").toLowerCase().includes(q);
    })
    .slice(0, 12);

  const display = current
    ? (current.company || current.full_name || current.email || "(unnamed contact)")
    : "Select detailer";

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => { setOpen((v) => !v); setQuery(""); }}
        style={{
          background: "transparent",
          border: "1px dashed transparent",
          borderRadius: 3,
          padding: "3px 8px",
          fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600,
          color: current ? "var(--text-primary)" : "var(--text-muted)",
          fontStyle: current ? "normal" : "italic",
          cursor: "pointer",
          textAlign: "left",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent-border)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "transparent"; }}
      >
        {display} <span style={{ opacity: 0.5 }}>▾</span>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 30 }} />
          <div style={{
            position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 31,
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: 6,
            padding: 6,
            minWidth: 280,
            boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
          }}>
            <input
              autoFocus
              placeholder="Search contacts..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                width: "100%",
                background: "var(--bg-input)",
                border: "1px solid var(--border-default)",
                borderRadius: 3,
                padding: "4px 8px",
                fontFamily: "var(--font-body)", fontSize: 12,
                color: "var(--text-primary)", outline: "none",
                marginBottom: 6,
              }}
            />
            <div style={{ maxHeight: 240, overflowY: "auto" }}>
              {filtered.length === 0 ? (
                <div style={{ padding: 8, ...mono, fontSize: 10, color: "var(--text-muted)", textAlign: "center" }}>
                  {contacts.length === 0 ? "No contacts yet — add one in Contacts." : "No matches"}
                </div>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setOpen(false);
                      if (c.id !== project?.detailer_contact_id) {
                        updateMut.mutate({ detailer_contact_id: c.id });
                      }
                    }}
                    style={{
                      display: "block", width: "100%", textAlign: "left",
                      background: "transparent", border: "none",
                      borderRadius: 3, padding: "5px 8px",
                      fontFamily: "var(--font-body)", fontSize: 12,
                      color: "var(--text-primary)", cursor: "pointer",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--hover-bg)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <div style={{ fontWeight: 600 }}>{c.company || c.full_name || "(unnamed)"}</div>
                    {c.full_name && c.company && (
                      <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>{c.full_name}</div>
                    )}
                  </button>
                ))
              )}
            </div>
            {current && (
              <button
                onClick={() => { setOpen(false); updateMut.mutate({ detailer_contact_id: null }); }}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  background: "transparent",
                  border: "none",
                  borderTop: "1px solid var(--divider)",
                  marginTop: 4, paddingTop: 6,
                  padding: "5px 8px",
                  ...mono, fontSize: 9, letterSpacing: "0.08em",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  textTransform: "uppercase",
                }}
              >
                Clear detailer
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function ProjectKickoffChecklist({ project }) {
  const projectId = project?.id;
  const qc = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);

  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts"],
    queryFn: () => base44.entities.Contact.list(),
    staleTime: 5 * 60 * 1000,
  });

  const updateMut = useMutation({
    mutationFn: (patch) => base44.entities.Project.update(projectId, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (e) => toast.error(`Save failed: ${e.message || "unknown"}`),
  });

  const toggleComplete = () => {
    const next = !project?.kickoff_complete;
    updateMut.mutate({
      kickoff_complete: next,
      kickoff_completed_at: next ? new Date().toISOString() : null,
    });
  };

  if (!project) return null;

  return (
    <div style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border-default)",
      borderRadius: 12,
      padding: 18,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <button
          onClick={() => setCollapsed((c) => !c)}
          style={{
            background: "transparent", border: "none", padding: 0,
            display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
          }}
        >
          <span style={{
            ...mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.12em",
            textTransform: "uppercase", color: "var(--text-primary)",
          }}>
            {collapsed ? "▸" : "▾"} Kickoff Checklist
          </span>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <KickoffPill complete={!!project.kickoff_complete} />
          <button
            onClick={toggleComplete}
            style={{
              background: project.kickoff_complete ? "var(--bg-surface-low)" : "var(--accent)",
              color: project.kickoff_complete ? "var(--text-secondary)" : "var(--bg-base)",
              border: project.kickoff_complete ? "1px solid var(--border-default)" : "none",
              borderRadius: 4,
              padding: "6px 12px",
              ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.10em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            {project.kickoff_complete ? "Re-open Kickoff" : "Mark Kickoff Complete"}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22 }}>
          {/* Basic Info */}
          <div>
            <GroupHeader>Basic Info</GroupHeader>
            <FieldRow label="Drawing Date">
              <InlineEditField project={project} field="drawing_date" value={project.drawing_date} type="date" emptyText="—" />
            </FieldRow>
            <FieldRow label="LOI Received">
              <InlineEditField project={project} field="loi_received_date" value={project.loi_received_date} type="date" emptyText="—" />
            </FieldRow>
            <FieldRow label="Contract Value">
              <InlineEditField project={project} field="original_contract_value" value={project.original_contract_value} type="currency" emptyText="Set value" />
            </FieldRow>
            <FieldRow label="GC Contract Present">
              <YesNoCell
                value={project.gc_contract_present ?? null}
                onSave={(v) => updateMut.mutate({ gc_contract_present: v })}
              />
            </FieldRow>
            <FieldRow label="Liquidated Damages">
              <YesNoCell
                value={project.liquidated_damages ?? null}
                onSave={(v) => updateMut.mutate({ liquidated_damages: v })}
              />
            </FieldRow>
            <FieldRow label="Job Type">
              <JobTypeCell
                value={project.job_type || null}
                onSave={(v) => updateMut.mutate({ job_type: v })}
              />
            </FieldRow>
          </div>

          {/* Involved Parties */}
          <div>
            <GroupHeader>Involved Parties</GroupHeader>
            <FieldRow label="Detailer">
              <DetailerCell projectId={projectId} project={project} contacts={contacts} />
            </FieldRow>
            <FieldRow label="Joist Manufacturer">
              <InlineEditField project={project} field="joist_manufacturer" value={project.joist_manufacturer} type="text" emptyText="—" />
            </FieldRow>
            <FieldRow label="Deck Manufacturer">
              <InlineEditField project={project} field="deck_manufacturer" value={project.deck_manufacturer} type="text" emptyText="—" />
            </FieldRow>
            <FieldRow label="Deck Installer">
              <InlineEditField project={project} field="deck_installer" value={project.deck_installer} type="text" emptyText="—" />
            </FieldRow>
            <FieldRow label="Special Coatings">
              <InlineEditField project={project} field="special_coatings" value={project.special_coatings} type="text" emptyText="—" />
            </FieldRow>
            <FieldRow label="Engineering Firm">
              <InlineEditField project={project} field="engineering_firm" value={project.engineering_firm} type="text" emptyText="—" />
            </FieldRow>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * KICKOFF · Pending / Complete pill — exported for reuse on the
 * project header / pill rail so the status is visible at a glance
 * without opening the kickoff card.
 */
export function KickoffPill({ complete }) {
  const color = complete ? "var(--status-success)" : "var(--status-warning)";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      background: complete ? "var(--success-muted)" : "var(--warning-muted)",
      border: `1px solid ${color}45`,
      borderRadius: 3,
      padding: "2px 7px",
      ...mono, fontSize: 8, fontWeight: 700, letterSpacing: "0.10em",
      color, textTransform: "uppercase",
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%", background: color, display: "inline-block",
      }} />
      Kickoff · {complete ? "Complete" : "Pending"}
    </span>
  );
}
