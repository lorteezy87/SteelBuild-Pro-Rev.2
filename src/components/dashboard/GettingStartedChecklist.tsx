// ── GettingStartedChecklist — onboarding card for the core workflow ──────
//
// A dismissible card atop the project Dashboard that walks the user through the
// killer workflow (drawings → submittals → RFIs → fab release), tracking the
// project's REAL progress. Presentational over useGettingStarted; the step
// status logic lives in lib/gettingStarted. Auto-hidden when the project has
// finished all four steps (a short "complete" banner) or when dismissed.
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronRight, FileStack, ClipboardCheck, MessageCircleQuestion, PackageCheck, X } from "lucide-react";
import { createPageUrl } from "@/utils";
import { useGettingStarted } from "@/hooks/useGettingStarted";
import type { GettingStartedStepKey } from "@/lib/gettingStarted";

type StepMeta = { title: string; why: string; cta: string; page: string; icon: typeof FileStack };

const STEP_META: Record<GettingStartedStepKey, StepMeta> = {
  drawings: {
    title: "Upload drawings",
    why: "The documents the job is built from.",
    cta: "Upload drawings", page: "Drawings", icon: FileStack,
  },
  submittals: {
    title: "Create a submittal",
    why: "Submittals own the approval workflow — drawings are just the documents.",
    cta: "Open submittals", page: "Submittals", icon: ClipboardCheck,
  },
  rfis: {
    title: "Raise RFIs",
    why: "Questions to the EOR that can gate fabrication.",
    cta: "Open RFIs", page: "RFIs", icon: MessageCircleQuestion,
  },
  fab: {
    title: "Release for fabrication",
    why: "The gate that checks approval, RFIs, rejected sheets & revision conflicts.",
    cta: "Go to fab release", page: "FabRelease", icon: PackageCheck,
  },
};

const ORDER: GettingStartedStepKey[] = ["drawings", "submittals", "rfis", "fab"];

const mono = { fontFamily: "var(--font-mono)" } as const;

export default function GettingStartedChecklist({ projectId }: { projectId?: string }) {
  const navigate = useNavigate();
  const { state, dismissed, isLoading, skipRfi, dismiss } = useGettingStarted(projectId);

  if (!projectId || dismissed) return null;

  if (isLoading || !state) {
    return (
      <div className="sbd-card" style={{ padding: 14, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 16, height: 16, borderRadius: 4, background: "var(--bg-surface-high)" }} />
        <div style={{ ...mono, fontSize: 11, color: "var(--text-muted)" }}>Loading getting-started…</div>
      </div>
    );
  }

  const doneCount = state.steps.filter((s) => s.status === "done").length;

  if (state.allComplete) {
    return (
      <div className="sbd-card" style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderLeft: "3px solid var(--status-success)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Check size={16} color="var(--status-success)" />
          <span style={{ fontSize: 13, color: "var(--text-primary)" }}>
            Core workflow complete — drawings → submittals → RFIs → fab release. Nice work.
          </span>
        </div>
        <button type="button" onClick={dismiss} style={dismissBtn}>Dismiss</button>
      </div>
    );
  }

  return (
    <div className="sbd-card" style={{ padding: 16, position: "relative" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div style={{ ...mono, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--accent)" }}>
            Getting started
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginTop: 2 }}>
            Walk the core workflow ({doneCount}/4)
          </div>
        </div>
        <button type="button" onClick={dismiss} title="Dismiss" aria-label="Dismiss getting started" style={closeBtn}>
          <X size={14} />
        </button>
      </div>

      {/* Steps */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {ORDER.map((key, i) => {
          const step = state.steps.find((s) => s.key === key)!;
          const meta = STEP_META[key];
          const Icon = meta.icon;
          const isCurrent = step.status === "current";
          const isDone = step.status === "done";
          return (
            <div
              key={key}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: isCurrent ? "10px 12px" : "8px 12px",
                borderRadius: 10,
                border: `1px solid ${isCurrent ? "var(--accent-border)" : "var(--divider)"}`,
                background: isCurrent ? "var(--accent-muted)" : "var(--bg-surface-low)",
                opacity: isDone ? 0.72 : 1,
              }}
            >
              {/* Status marker */}
              <div style={{
                width: 22, height: 22, borderRadius: 999, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: isDone ? "var(--status-success)" : isCurrent ? "var(--accent)" : "var(--bg-surface-high)",
                color: isDone || isCurrent ? "#0b0e12" : "var(--text-muted)",
                ...mono, fontSize: 11, fontWeight: 800,
              }}>
                {isDone ? <Check size={13} /> : i + 1}
              </div>

              <Icon size={16} color={isCurrent ? "var(--accent)" : "var(--text-muted)"} style={{ flexShrink: 0 }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: isCurrent ? 700 : 600, color: "var(--text-primary)", textDecoration: isDone ? "line-through" : "none" }}>
                  {meta.title}
                </div>
                {!isDone && (
                  <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 1 }}>{meta.why}</div>
                )}
              </div>

              {/* Actions */}
              {!isDone && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  {isCurrent && key === "rfis" && (
                    <button type="button" onClick={skipRfi} style={skipBtn}>No RFIs needed</button>
                  )}
                  <button
                    type="button"
                    onClick={() => navigate(createPageUrl(meta.page))}
                    className={isCurrent ? "sbd-btn sbd-btn-primary" : "sbd-btn sbd-btn-ghost"}
                    style={{ padding: "5px 11px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}
                  >
                    {meta.cta}<ChevronRight size={13} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const closeBtn: CSSProperties = {
  background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer",
  padding: 4, display: "inline-flex", borderRadius: 6,
};
const dismissBtn: CSSProperties = {
  background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer",
  fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
  textTransform: "uppercase",
};
const skipBtn: CSSProperties = {
  background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer",
  fontSize: 11, textDecoration: "underline", whiteSpace: "nowrap",
};
