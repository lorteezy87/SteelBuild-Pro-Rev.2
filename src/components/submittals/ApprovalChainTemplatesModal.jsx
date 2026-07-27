/**
 * ApprovalChainTemplatesModal — manage per-project approval-chain templates
 * (saved to `projects.metadata.approval_chain_templates`, which
 * approvalChains.getChainTemplates() already reads + merges with the built-ins).
 *
 * Steps are free-form party names — pick a common one from the datalist or type
 * any (e.g. "PM", "Fabricator"). Also hosts the project's fab-release sign-off
 * policy (`metadata.require_fab_signoffs`) since both are submittal/fab settings.
 *
 * Self-contained: reads the active project + patches it through ProjectContext,
 * so the submittal panel's template dropdown refreshes immediately on save.
 */
import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, X, ArrowUp, ArrowDown, Trash2, Pencil } from "lucide-react";
import { entities } from "@/api/supabaseClient";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { getChainTemplates, normalizeChain } from "@/lib/approvalChains";
import { BIC_CHOICES } from "@/pages/submittals/format";

const mono = { fontFamily: "var(--font-mono)" };

// Common parties for the step picker — the canonical ball-in-court list plus the
// internal/handoff roles users route through. Free text is still allowed.
const PARTY_SUGGESTIONS = Array.from(new Set([...BIC_CHOICES, "PM", "Fabricator"]));

const newKey = () => `tpl-${Math.random().toString(36).slice(2, 9)}`;

function StepEditor({ steps, setSteps }) {
  const [input, setInput] = useState("");
  const add = () => {
    const party = input.trim();
    if (!party) return;
    setSteps([...steps, party]);
    setInput("");
  };
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    setSteps(next);
  };
  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <input
          list="act-party-suggestions"
          className="sbd-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="Add a party (e.g. Detailer, PM, GC, EOR, Fabricator)…"
          style={{ ...mono, flex: 1, minWidth: 0, fontSize: 12, padding: "7px 9px" }}
        />
        <datalist id="act-party-suggestions">
          {PARTY_SUGGESTIONS.map((p) => <option key={p} value={p} />)}
        </datalist>
        <button type="button" className="sbd-btn sbd-btn-ghost" onClick={add} style={{ padding: "0 12px" }}>
          <Plus size={13} /> Add
        </button>
      </div>
      {steps.length === 0 ? (
        <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>No steps yet — add the parties in review order.</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 5 }}>
          {steps.map((party, i) => (
            <React.Fragment key={`${party}-${i}`}>
              {i > 0 && <span style={{ color: "var(--text-muted)", fontSize: 11 }}>→</span>}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 4px 3px 9px", borderRadius: 999, border: "1px solid var(--border-default)", background: "var(--bg-surface-low)", color: "var(--text-primary)", ...mono, fontSize: 10, fontWeight: 700 }}>
                {party}
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title="Move earlier" style={iconBtn(i === 0)}><ArrowUp size={11} /></button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === steps.length - 1} title="Move later" style={iconBtn(i === steps.length - 1)}><ArrowDown size={11} /></button>
                <button type="button" onClick={() => setSteps(steps.filter((_, k) => k !== i))} title="Remove" style={iconBtn(false)}><X size={11} /></button>
              </span>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

const iconBtn = (disabled) => ({
  display: "inline-flex", background: "none", border: "none", padding: 1,
  color: disabled ? "var(--text-disabled, var(--text-muted))" : "var(--text-muted)",
  cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1,
});

export default function ApprovalChainTemplatesModal({ open, onClose }) {
  const { activeProject, updateActiveProject } = useProjectContext();
  const project = activeProject;

  // Custom (project-defined) templates only — the built-ins are shown read-only.
  const initialCustom = useMemo(() => {
    const raw = project?.metadata?.approval_chain_templates;
    return Array.isArray(raw)
      ? raw
          .map((t) => ({ key: t.key || newKey(), name: t.name || "", steps: (normalizeChain(t.steps) || []).map((s) => s.party) }))
          .filter((t) => t.steps.length > 0)
      : [];
  }, [project]);

  const builtins = useMemo(
    () => getChainTemplates(project).filter((t) => !t.custom),
    [project],
  );

  const [custom, setCustom] = useState(initialCustom);
  const [requireSignoffs, setRequireSignoffs] = useState(!!project?.metadata?.require_fab_signoffs);
  const [editing, setEditing] = useState(null); // { key, name, steps } | null
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const startNew = () => setEditing({ key: newKey(), name: "", steps: [] });
  const startEdit = (t) => setEditing({ ...t, steps: [...t.steps] });

  const commitEditing = () => {
    const name = (editing.name || "").trim();
    if (!name) { toast.error("Give the template a name."); return; }
    if (editing.steps.length < 2) { toast.error("A chain needs at least two steps."); return; }
    setCustom((prev) => {
      const exists = prev.some((t) => t.key === editing.key);
      const row = { key: editing.key, name, steps: editing.steps };
      return exists ? prev.map((t) => (t.key === editing.key ? row : t)) : [...prev, row];
    });
    setEditing(null);
  };

  const save = async () => {
    if (!project?.id) { toast.error("No active project."); return; }
    setSaving(true);
    try {
      const metadata = {
        ...(project.metadata || {}),
        approval_chain_templates: custom.map((t) => ({ key: t.key, name: t.name, steps: t.steps })),
        require_fab_signoffs: requireSignoffs,
      };
      await entities.Project.update(project.id, { metadata });
      updateActiveProject({ metadata }); // refresh context so the panel picks up the new list
      toast.success("Submittal settings saved");
      onClose?.();
    } catch (err) {
      toast.error("Couldn't save: " + (err?.message || String(err)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "color-mix(in srgb, var(--bg-base) 70%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
      <div className="sbd-card-strong" onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--bg-surface-secondary)", border: "1px solid var(--border-default)", borderRadius: 8, width: 560, maxWidth: "94vw", maxHeight: "90vh", overflowY: "auto", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.2em", color: "var(--accent)" }}>SUBMITTAL SETTINGS</div>
            <h3 style={{ margin: "4px 0 0", fontSize: 17, color: "var(--text-primary)" }}>Approval chain templates</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="sbd-btn sbd-btn-ghost" style={{ padding: "4px 8px" }}><X size={14} /></button>
        </div>

        {/* Custom templates */}
        <div style={{ ...mono, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8 }}>Your templates</div>
        {custom.length === 0 && !editing && (
          <div style={{ ...mono, fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>None yet. Save the routes your shop uses so they're one click on every submittal.</div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          {custom.map((t) => (
            <div key={t.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border-default)", background: "var(--bg-surface-low)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{t.name}</div>
                <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.steps.join(" → ")}</div>
              </div>
              <button type="button" onClick={() => startEdit(t)} title="Edit" style={iconBtn(false)}><Pencil size={13} /></button>
              <button type="button" onClick={() => setCustom((p) => p.filter((x) => x.key !== t.key))} title="Delete" style={{ ...iconBtn(false), color: "var(--status-error)" }}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>

        {editing ? (
          <div style={{ border: "1px solid var(--accent)", borderRadius: 6, padding: 12, marginBottom: 12, background: "color-mix(in srgb, var(--accent) 6%, transparent)" }}>
            <input className="sbd-input" autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder="Template name (e.g. Full review)" style={{ width: "100%", boxSizing: "border-box", fontSize: 13, padding: "8px 10px", marginBottom: 10 }} />
            <StepEditor steps={editing.steps} setSteps={(steps) => setEditing({ ...editing, steps })} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              <button type="button" className="sbd-btn sbd-btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
              <button type="button" className="sbd-btn sbd-btn-primary" onClick={commitEditing}>Done</button>
            </div>
          </div>
        ) : (
          <button type="button" className="sbd-btn sbd-btn-ghost" onClick={startNew} style={{ marginBottom: 14 }}><Plus size={13} /> New template</button>
        )}

        {/* Built-ins (read-only) */}
        <div style={{ ...mono, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", margin: "6px 0 8px" }}>Built-in (always available)</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
          {builtins.map((t) => (
            <div key={t.key} style={{ ...mono, fontSize: 10.5, color: "var(--text-secondary)", padding: "5px 10px", borderRadius: 6, background: "var(--bg-surface-low)" }}>
              {(t.steps || []).join(" → ")}
            </div>
          ))}
        </div>

        {/* Fab-release sign-off policy */}
        <div style={{ borderTop: "1px solid var(--divider)", paddingTop: 14, marginBottom: 18 }}>
          <div style={{ ...mono, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8 }}>Fab release</div>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 9, cursor: "pointer", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            <input type="checkbox" checked={requireSignoffs} onChange={(e) => setRequireSignoffs(e.target.checked)} style={{ marginTop: 2 }} />
            <span><strong style={{ color: "var(--text-primary)" }}>Require a fab sign-off before release.</strong> The Ready-for-Fab gate blocks releasing an approved sheet until it has a non-voided fabrication sign-off.</span>
          </label>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="sbd-btn sbd-btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="sbd-btn sbd-btn-primary" onClick={save} disabled={saving || !!editing}>
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
      </div>
    </div>
  );
}
