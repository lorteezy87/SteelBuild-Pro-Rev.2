/**
 * ApprovalChainPanel — configure + visualize a submittal's custom approval
 * route (approvalChains.js). Applying a route only sets WHO the ball moves
 * to next; the main "Route to …" verb CTA performs each audited hop via
 * addSubmittalRound, and submittals.status stays the workflow truth (§20).
 */
import React, { useMemo, useState } from "react";
import { Check, GitBranch, Settings, X } from "lucide-react";
import {
  chainState,
  getChainTemplates,
  buildApplyChainPatch,
  buildClearChainPatch,
} from "@/lib/approvalChains";
import ApprovalChainTemplatesModal from "@/components/submittals/ApprovalChainTemplatesModal";

const mono = "var(--font-mono)";

function StepChip({ step, state }) {
  const palette = {
    done:     { color: "var(--status-success)", border: "color-mix(in srgb, var(--status-success) 45%, transparent)", bg: "color-mix(in srgb, var(--status-success) 12%, transparent)" },
    current:  { color: "var(--on-accent)", border: "var(--accent)", bg: "var(--accent)" },
    upcoming: { color: "var(--text-muted)", border: "var(--border-default)", bg: "transparent" },
  }[state];
  return (
    <span
      title={state === "current" ? `${step.party} currently holds the ball` : step.party}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "3px 9px", borderRadius: 999,
        border: `1px solid ${palette.border}`,
        background: palette.bg, color: palette.color,
        fontFamily: mono, fontSize: 9, fontWeight: 800, letterSpacing: "0.06em",
        textTransform: "uppercase", whiteSpace: "nowrap",
      }}
    >
      {state === "done" && <Check size={10} />}
      {step.party}
    </span>
  );
}

export default function ApprovalChainPanel({ submittal, project, onFieldChange, disabled = false }) {
  const templates = useMemo(() => getChainTemplates(project), [project]);
  const [templateKey, setTemplateKey] = useState(templates[0]?.key || "");
  const [manageOpen, setManageOpen] = useState(false);
  const chain = chainState(submittal);

  if (!submittal) return null;

  // ── Active route: step chips + clear ─────────────────────────────────
  if (chain.steps) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {chain.steps.map((step, i) => (
            <React.Fragment key={`${step.party}-${i}`}>
              {i > 0 && <span style={{ color: "var(--text-muted)", fontSize: 10 }}>→</span>}
              <StepChip
                step={step}
                state={
                  chain.stepIndex == null ? "upcoming"
                    : i < chain.stepIndex ? "done"
                    : i === chain.stepIndex ? "current"
                    : "upcoming"
                }
              />
            </React.Fragment>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 8 }}>
          <span style={{ fontFamily: mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.04em" }}>
            {chain.atFinalStep
              ? "Final reviewer holds the ball — log the return with a status verb."
              : chain.nextParty
                ? `Next hop: ${chain.nextParty} — use the action button above.`
                : "Route applied."}
          </span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onFieldChange(buildClearChainPatch())}
            title="Remove this routing chain (status and ball-in-court are unchanged)"
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "3px 8px", borderRadius: 6, cursor: disabled ? "default" : "pointer",
              background: "transparent", border: "1px solid var(--border-default)",
              color: "var(--text-muted)", fontFamily: mono, fontSize: 8,
              fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
            }}
          >
            <X size={10} /> Clear route
          </button>
        </div>
      </div>
    );
  }

  // ── No route yet: template picker ────────────────────────────────────
  const selectedTemplate = templates.find((t) => t.key === templateKey) || templates[0];
  return (
    <div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <select
          className="sbd-select"
          value={selectedTemplate?.key || ""}
          disabled={disabled}
          onChange={(e) => setTemplateKey(e.target.value)}
          aria-label="Approval route template"
          style={{ flex: 1, minWidth: 0, fontFamily: mono, fontSize: 10, padding: "6px 8px" }}
        >
          {templates.map((t) => (
            <option key={t.key} value={t.key}>{t.name}</option>
          ))}
        </select>
        <button
          type="button"
          disabled={disabled || !selectedTemplate}
          onClick={() => {
            const patch = buildApplyChainPatch(selectedTemplate?.steps, submittal);
            if (patch) onFieldChange(patch);
          }}
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "6px 12px", borderRadius: 6,
            cursor: disabled ? "default" : "pointer",
            background: "var(--accent)", border: "none", color: "var(--on-accent)",
            fontFamily: mono, fontSize: 9, fontWeight: 800, letterSpacing: "0.08em",
            textTransform: "uppercase", whiteSpace: "nowrap",
          }}
        >
          <GitBranch size={11} /> Apply route
        </button>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginTop: 6 }}>
        <span style={{ fontFamily: mono, fontSize: 9, color: "var(--text-muted)", lineHeight: 1.5 }}>
          Routes the ball through each party automatically — the action button
          becomes "Route to next" until the final reviewer returns a decision.
        </span>
        <button
          type="button"
          onClick={() => setManageOpen(true)}
          disabled={disabled}
          title="Create or edit per-project approval-chain templates"
          style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "var(--accent)", cursor: disabled ? "default" : "pointer", fontFamily: mono, fontSize: 9, fontWeight: 700, whiteSpace: "nowrap", padding: 0 }}
        >
          <Settings size={10} /> Manage
        </button>
      </div>
      <ApprovalChainTemplatesModal open={manageOpen} onClose={() => setManageOpen(false)} />
    </div>
  );
}
