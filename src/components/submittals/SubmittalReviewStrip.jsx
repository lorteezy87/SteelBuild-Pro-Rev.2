import React, { useMemo, useState } from "react";
import { reviewSubmittal } from "@/lib/submittalReviewEngine";
import { toast } from "sonner";
import {
  Inbox, CheckSquare, Search, Lightbulb, Send,
  ChevronDown, ChevronUp, Copy, ArrowRight, AlertTriangle, CheckCircle,
} from "lucide-react";

const TONE_COLORS = {
  success: { bg: "var(--success-muted)", border: "var(--success-border)", text: "var(--status-success)" },
  warning: { bg: "var(--warning-muted)", border: "var(--warning-border)", text: "var(--status-warning)" },
  error:   { bg: "var(--danger-muted)",  border: "var(--danger-border)",  text: "var(--status-error)" },
  muted:   { bg: "var(--bg-surface-low)", border: "var(--border-default)", text: "var(--text-muted)" },
};

/**
 * SubmittalReviewStrip — inline 5-stage review pipeline visualization.
 *
 * Renders a horizontal stage indicator, the active recommendation with
 * tone-coded background, expandable flags grouped by category, and a
 * "Copy Email" button for the generated email draft.
 */
export default function SubmittalReviewStrip({
  submittal,
  allSubmittals = [],
  drawingSets = [],
  rfis = [],
  rounds = [],
  projectName = "Project",
}) {
  const [expanded, setExpanded] = useState(false);

  const review = useMemo(() => {
    if (!submittal) return null;
    return reviewSubmittal(submittal, {
      allSubmittals,
      drawingSets,
      rfis,
      rounds,
      projectName,
    });
  }, [submittal, allSubmittals, drawingSets, rfis, rounds, projectName]);

  if (!review) return null;

  const { recommendation, analysis, action, overallScore, riskLevel } = review;
  const rec = recommendation.recommendation;
  const tone = TONE_COLORS[rec.tone] || TONE_COLORS.muted;

  const handleCopyEmail = () => {
    const { subject, body } = action.emailDraft;
    const text = `Subject: ${subject}\n\n${body}`;
    navigator.clipboard.writeText(text).then(
      () => toast.success("Email draft copied to clipboard"),
      () => toast.error("Failed to copy"),
    );
  };

  // Stage pipeline visualization
  const stages = [
    { key: "intake",         label: "Intake",    icon: Inbox },
    { key: "alignment",      label: "Align",     icon: CheckSquare },
    { key: "analysis",       label: "Analysis",  icon: Search },
    { key: "recommendation", label: "Rec",       icon: Lightbulb },
    { key: "action",         label: "Action",    icon: Send },
  ];

  const riskColor =
    riskLevel === "critical"
      ? "var(--status-error)"
      : riskLevel === "warning"
        ? "var(--status-warning)"
        : "var(--status-success)";

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
        overflow: "hidden",
        marginBottom: 12,
      }}
    >
      {/* Header: stage pipeline + score */}
      <div
        style={{
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: expanded ? "1px solid var(--divider)" : "none",
        }}
      >
        {/* Pipeline dots */}
        <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
          {stages.map((stage, i) => {
            const Icon = stage.icon;
            return (
              <React.Fragment key={stage.key}>
                {i > 0 && (
                  <div
                    style={{
                      width: 20,
                      height: 2,
                      background: "var(--accent)",
                      opacity: 0.4,
                    }}
                  />
                )}
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: "var(--accent)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1.5px solid var(--accent)",
                  }}
                  title={stage.label}
                >
                  <Icon size={13} color="#fff" />
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Score pill */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 700,
              color: riskColor,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {riskLevel === "critical" && <AlertTriangle size={13} />}
            {riskLevel === "clear" && <CheckCircle size={13} />}
            {overallScore}/100
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              padding: 2,
            }}
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Recommendation bar */}
      <div
        style={{
          padding: "8px 16px",
          background: tone.bg,
          borderTop: `1px solid ${tone.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: expanded ? `1px solid ${tone.border}` : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <ArrowRight size={14} color={tone.text} style={{ flexShrink: 0 }} />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: tone.text,
              flexShrink: 0,
            }}
          >
            {rec.label}
          </span>
          <span
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 11,
              color: "var(--text-secondary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {recommendation.summary}
          </span>
        </div>
        {analysis.flags.length > 0 && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              color: tone.text,
              flexShrink: 0,
              marginLeft: 8,
            }}
          >
            {analysis.flags.length} flag{analysis.flags.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Expanded: flags + context + routing + email draft */}
      {expanded && (
        <div style={{ padding: 16 }}>
          {/* Flags */}
          {analysis.flags.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                  color: "var(--text-muted)",
                  marginBottom: 8,
                }}
              >
                REVIEW FLAGS
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {analysis.flags.map((flag, i) => {
                  const flagTone =
                    flag.type.severity === "error" ? TONE_COLORS.error : TONE_COLORS.warning;
                  return (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 10px",
                        background: flagTone.bg,
                        border: `1px solid ${flagTone.border}`,
                        borderRadius: 4,
                      }}
                    >
                      <AlertTriangle size={12} color={flagTone.text} style={{ flexShrink: 0 }} />
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 9,
                          fontWeight: 700,
                          color: flagTone.text,
                          textTransform: "uppercase",
                          minWidth: 80,
                          flexShrink: 0,
                        }}
                      >
                        {flag.type.label}
                      </span>
                      <span
                        style={{
                          fontFamily: "var(--font-body)",
                          fontSize: 11,
                          color: "var(--text-secondary)",
                        }}
                      >
                        {flag.detail}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Intake context */}
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                color: "var(--text-muted)",
                marginBottom: 8,
              }}
            >
              CONNECTED CONTEXT
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)" }}>
                <strong>{review.intake.linkedDrawingSets.length}</strong> linked drawing
                set{review.intake.linkedDrawingSets.length !== 1 ? "s" : ""}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)" }}>
                <strong>{review.intake.relatedRFIs.length}</strong> related
                RFI{review.intake.relatedRFIs.length !== 1 ? "s" : ""}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)" }}>
                <strong>{review.intake.relatedSubmittals.length}</strong> related
                submittal{review.intake.relatedSubmittals.length !== 1 ? "s" : ""}
              </div>
            </div>
          </div>

          {/* Routing */}
          {action.routing.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                  color: "var(--text-muted)",
                  marginBottom: 8,
                }}
              >
                ROUTING
              </div>
              {action.routing.map((route, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 10px",
                    background: "var(--bg-surface-low)",
                    border: "1px solid var(--border-default)",
                    borderRadius: 4,
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      fontWeight: 700,
                      color: "var(--accent)",
                    }}
                  >
                    {route.person}
                  </span>
                  <ArrowRight size={12} color="var(--text-muted)" />
                  <span
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: 11,
                      color: "var(--text-primary)",
                    }}
                  >
                    {route.action}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Email draft + copy button */}
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                  color: "var(--text-muted)",
                }}
              >
                EMAIL DRAFT
              </div>
              <button
                onClick={handleCopyEmail}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 10px",
                  background: "var(--accent)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "var(--radius-btn)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                <Copy size={11} /> Copy Email
              </button>
            </div>
            <div
              style={{
                background: "var(--bg-surface-low)",
                border: "1px solid var(--border-default)",
                borderRadius: 4,
                padding: 12,
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--text-secondary)",
                whiteSpace: "pre-wrap",
                lineHeight: 1.5,
                maxHeight: 200,
                overflowY: "auto",
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  marginBottom: 8,
                }}
              >
                Subject: {action.emailDraft.subject}
              </div>
              {action.emailDraft.body}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
