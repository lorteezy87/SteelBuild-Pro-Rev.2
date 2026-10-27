import React from "react";
import { Button } from "@/components/ui/button";

// ─── Step 3: Processing UI ────────────────────────────────────────────
//
// `fileResults` is passed so the error branch can show WHY each file failed.
// Without it this screen was a dead end: when every file fails the controller
// sets "No drawing sheets were extracted. Check the failed file details and
// try again." and stops here — but the per-file `error` captured in
// useFileUploadAndExtract was only ever rendered by SuccessStep, which that
// path never reaches. The message named details the UI could not display.
/**
 * @param {{
 *   processingStatus: {
 *     steps?: Array<{ id: string, label: string, done?: boolean, warning?: boolean, detail?: string }>,
 *     currentStepId?: string | null,
 *     progress?: number,
 *     message?: string,
 *   },
 *   onCancel: () => void,
 *   error?: string | null,
 *   fileResults?: Array<{ fileName: string, status?: string, error?: string, sheetCount?: number }>,
 * }} props
 */
export default function ProcessingStep({ processingStatus, onCancel, error, fileResults = [] }) {
  const { steps = [], currentStepId, progress = 0, message = "" } = processingStatus;

  if (error) {
    const failed = fileResults.filter((r) => r.status === "failed");
    return (
      <div style={{ padding: "20px 0", textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>⚠</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, color: "var(--status-error)", marginBottom: 8 }}>
          Processing Failed
        </div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", marginBottom: failed.length ? 12 : 24, maxWidth: 360, margin: failed.length ? "0 auto 12px" : "0 auto 24px" }}>
          {error}
        </div>
        {failed.length > 0 && (
          <div style={{ maxWidth: 420, margin: "0 auto 20px", textAlign: "left" }}>
            {failed.map((r) => (
              <div key={r.fileName} style={{
                display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 10px",
                background: "var(--danger-muted)",
                border: "1px solid var(--danger-border)",
                borderRadius: 6, marginBottom: 8,
              }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--status-error)", flexShrink: 0, marginTop: 1 }}>✗</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)", fontWeight: 600, overflowWrap: "anywhere" }}>
                    {r.fileName}
                  </div>
                  <div style={{
                    marginTop: 4, padding: "4px 6px", fontFamily: "var(--font-mono)", fontSize: 9,
                    color: "var(--text-muted)", background: "rgba(0,0,0,0.2)", borderRadius: 4,
                    letterSpacing: "0.04em", overflowWrap: "anywhere",
                  }}>
                    {r.error || "Upload failed for an unknown reason."}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
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
        <div style={{ background: "var(--bg-surface-high)", borderRadius: 8, height: 6, overflow: "hidden", maxWidth: 400, margin: "0 auto" }}>
          <div style={{ height: "100%", background: "var(--accent)", borderRadius: 8, width: `${progress}%`, transition: "width 0.4s ease" }} />
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
              borderRadius: 6,
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
