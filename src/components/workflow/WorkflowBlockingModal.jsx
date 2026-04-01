import React from "react";
import WorkflowStepIndicator from "./WorkflowStepIndicator";

export default function WorkflowBlockingModal({
  open,
  onClose,
  reason,
  action,
  currentStep,
  blockedStep,
  deliveries = null,
}) {
  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
        backdropFilter: "blur(2px)",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 460,
          background: "var(--bg-surface-secondary)",
          border: "1px solid var(--danger-border)",
          borderTop: "3px solid var(--status-error)",
          borderRadius: 14,
          padding: "24px 28px",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 18,
            fontWeight: 700,
            color: "var(--status-error)",
            letterSpacing: "0.04em",
            marginBottom: 8,
          }}
        >
          ⊘ WORKFLOW VIOLATION
        </div>

        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 13,
            color: "var(--text-primary)",
            marginBottom: 6,
          }}
        >
          Cannot proceed
        </div>

        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 11,
            color: "var(--text-secondary)",
            marginBottom: 16,
            lineHeight: 1.6,
          }}
        >
          {reason}
          <br />
          <strong style={{ color: "var(--status-warning)" }}>
            Required: {action}
          </strong>
        </div>

        {deliveries && deliveries.length > 0 && (
          <div
            style={{
              background: "var(--warning-muted)",
              border: "1px solid var(--warning-border)",
              borderRadius: 8,
              padding: 10,
              marginBottom: 16,
              fontSize: 10,
              color: "var(--text-secondary)",
            }}
          >
            <div
              style={{
                fontWeight: 600,
                marginBottom: 6,
                color: "var(--text-primary)",
              }}
            >
              Linked Deliveries:
            </div>
            {deliveries.map((d, i) => (
              <div key={i} style={{ marginBottom: i < deliveries.length - 1 ? 4 : 0 }}>
                {d.name} -{" "}
                <span
                  style={{
                    color:
                      d.status === "Delivered"
                        ? "var(--status-success)"
                        : "var(--status-warning)",
                  }}
                >
                  {d.status}
                </span>
              </div>
            ))}
          </div>
        )}

        <WorkflowStepIndicator
          currentStep={currentStep}
          blockedStep={blockedStep}
        />

        <button
          onClick={onClose}
          style={{
            marginTop: 16,
            width: "100%",
            height: 36,
            background: "var(--hover-bg)",
            border: "1px solid var(--border-default)",
            borderRadius: 8,
            color: "var(--text-secondary)",
            fontFamily: "var(--font-body)",
            fontSize: 12,
            cursor: "pointer",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--accent-muted)";
            e.currentTarget.style.borderColor = "var(--accent-border)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--hover-bg)";
            e.currentTarget.style.borderColor = "var(--border-default)";
          }}
        >
          Go Back
        </button>
      </div>
    </div>
  );
}
