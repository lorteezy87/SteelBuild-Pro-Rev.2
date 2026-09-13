import React, { useState } from "react";
import { CheckCircle2, Circle, ArrowRight, X } from "lucide-react";
import { computeGettingStartedSteps, type GettingStartedSignals } from "@/lib/gettingStarted";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

const STEP_METADATA = {
  drawings: {
    title: "Upload Drawings",
    description: "Get your initial set of sheets into the system.",
    cta: "Upload Sheets",
    path: "/Drawings",
  },
  submittals: {
    title: "Create a Submittal",
    description: "Organize sheets into a package for review.",
    cta: "Create Submittal",
    path: "/Submittals",
  },
  rfis: {
    title: "Raise RFIs",
    description: "Clear up questions before fabrication.",
    cta: "Raise RFI",
    path: "/RFIs",
  },
  fab: {
    title: "Release for Fab",
    description: "Move the approved package to the shop.",
    cta: "Release Steel",
    path: "/FabRelease",
  },
};

export default function GettingStartedChecklist({ signals, userMetadata }) {
  const [isDismissing, setIsDismissing] = useState(false);
  const state = computeGettingStartedSteps(signals);

  if (state.allComplete || userMetadata?.dismissed_getting_started) {
    return null;
  }

  const handleDismiss = async () => {
    setIsDismissing(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { dismissed_getting_started: true },
      });
      if (error) throw error;
      toast.success("Checklist dismissed");
    } catch (err) {
      toast.error("Failed to save preference");
      console.error(err);
    } finally {
      setIsDismissing(false);
    }
  };

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
        padding: "16px 20px",
        marginBottom: 20,
        position: "relative",
        boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            background: "var(--accent)",
            color: "var(--on-accent)",
            width: 20,
            height: 20,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            fontSize: 10,
            fontWeight: 800,
          }}>
            !
          </div>
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.1em",
            color: "var(--text-primary)",
          }}>
            GETTING STARTED
          </span>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          disabled={isDismissing}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--text-muted)",
            padding: 4,
            display: "flex",
            alignItems: "center",
          }}
        >
          <X size={14} />
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
        {state.steps.map((step) => {
          const meta = STEP_METADATA[step.key];
          const isDone = step.status === "done";
          const isCurrent = step.status === "current";

          return (
            <div
              key={step.key}
              style={{
                padding: "12px",
                borderRadius: 6,
                border: isCurrent ? "1px solid var(--accent)" : "1px solid var(--border-default)",
                background: isCurrent ? "rgba(200,155,32,0.05)" : "transparent",
                transition: "all 0.2s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                {isDone ? (
                  <CheckCircle2 size={16} color="var(--status-success)" />
                ) : (
                  <Circle size={16} color="var(--text-muted)" />
                )}
                <span style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: isDone ? "var(--text-muted)" : "var(--text-primary)",
                  textDecoration: isDone ? "line-through" : "none",
                }}>
                  {meta.title}
                </span>
              </div>
              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 12px", lineHeight: 1.4 }}>
                {meta.description}
              </p>
              {!isDone && (
                <a
                  href={meta.path}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    padding: "6px 0",
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--accent)",
                    textDecoration: "none",
                    border: "1px solid var(--accent)",
                    borderRadius: 4,
                    textAlign: "center",
                    background: isCurrent ? "var(--accent)" : "transparent",
                    color: isCurrent ? "var(--on-accent)" : "var(--accent)",
                  }}
                >
                  {meta.cta} <ArrowRight size={10} />
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
