import React from "react";
import { Button } from "@/components/ui/button";

// ─── Step 3: Processing UI ────────────────────────────────────────────
export default function StepProcessing({ processingStatus, onCancel, error }) {
  const { steps = [], currentStepId, progress = 0, message = "" } = processingStatus;

  if (error) {
    return (
      <div style={{ padding: "20px 0", textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>⚠</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, color: "var(--status-error)", marginBottom: 8 }}>
          Processing Failed
        </div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", marginBottom: 24, maxWidth: 360, margin: "0 auto 24px" }}>
          {error}
        </div>
        <Button variant="outline" onClick={onCancel}>← Start Over</Button>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px 0" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>✦</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
          Processing Drawing Set
        </div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)" }}>{message}</div>
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ background: "var(--bg-surface-high)", borderRadius: 20, height: 6, overflow: "hidden", maxWidth: 400, margin: "0 auto" }}>
          <div style={{ height: "100%", background: "var(--accent)", borderRadius: 20, width: `${progress}%`, transition: "width 0.4s ease" }} />
        </div>
        <div style={{ textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-warning)", marginTop: 5 }}>{progress}%</div>
      </div>

      {/* Step list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 400, margin: "0 auto" }}>
        {steps.map((step) => {
          const isDone    = step.done;
          const isActive  = step.id === currentStepId && !isDone;
          const isWarning = step.warning;
          return (
            <div key={step.id} style={{
              display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 12px",
              borderRadius: 8,
              background: isActive ? "var(--warning-muted)" : isDone ? "rgba(0,214,143,0.04)" : "transparent",
              border: `1px solid ${isActive ? "rgba(245,158,11,0.2)" : isDone ? "rgba(0,214,143,0.12)" : "var(--hover-bg)"}`,
              transition: "all 0.2s",
            }}>
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 12, marginTop: 1, flexShrink: 0,
                color: isDone && !isWarning ? "var(--status-success)" : isWarning ? "var(--status-warning)" : isActive ? "var(--status-warning)" : "var(--text-muted)",
              }}>
                {isDone && !isWarning ? "✓" : isWarning ? "⚠" : isActive ? (
                  <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>⟳</span>
                ) : "○"}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: isActive ? "var(--text-primary)" : isDone ? "var(--text-secondary)" : "var(--text-muted)" }}>
                  {step.label}
                </div>
                {step.detail && isActive && (
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 2, letterSpacing: "0.06em" }}>
                    {step.detail}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Cancel escape hatch */}
      <div style={{ textAlign: "center", marginTop: 20 }}>
        <button
          onClick={onCancel}
          style={{
            background: "none", border: "none", color: "var(--text-muted)",
            fontFamily: "var(--font-mono)", fontSize: 9, cursor: "pointer",
            letterSpacing: "0.08em", textDecoration: "underline",
          }}
        >
          cancel &amp; start over
        </button>
      </div>
    </div>
  );
}
