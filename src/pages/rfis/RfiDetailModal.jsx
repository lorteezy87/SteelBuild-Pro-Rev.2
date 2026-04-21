/**
 * RfiDetailModal — detail view for a single RFI, opened from any row.
 *
 * Rebuilt against the design-system Modal (fixed-overlay, no Radix).
 * Shows: status strip (status chip + BIC pill + priority + age),
 * meta grid (submitted / required / submitter / cost impact), the
 * lifecycle PhaseChevron, the question body, and attachments.
 *
 * `rfi` is the full row data. `onClose` dismisses. `onMutate` handler
 * receives a `{ status }` patch when the user advances the status via
 * the lifecycle chevron footer actions.
 */

import React from "react";
import { Modal, Button, StatusPill, BicPill, PhaseChevron, Icon } from "@/components/design-system";
import { daysOpen, isOverdue } from "./utils";

const STAGE_INDEX = { Open: 0, "Under Review": 1, Answered: 2, Closed: 3 };

const STAGES = [
  { id: "open", label: "OPEN",     color: "var(--status-warning)" },
  { id: "rev",  label: "REVIEW",   color: "var(--status-review)"  },
  { id: "ans",  label: "ANSWERED", color: "var(--status-success)" },
  { id: "cls",  label: "CLOSED",   color: "var(--text-muted)"     },
];

export default function RfiDetailModal({ rfi, onClose, onAdvanceStatus, onEdit, onNudge }) {
  if (!rfi) return null;

  const age = daysOpen(rfi);
  const overdue = isOverdue(rfi);
  const activeIdx = STAGE_INDEX[rfi.status] ?? 0;

  const priorityColor =
    rfi.priority === "Critical" ? "#FF6B35" :
    rfi.priority === "High"     ? "var(--status-warning)" :
    rfi.priority === "Medium"   ? "var(--status-info)" :
                                  "var(--text-muted)";

  return (
    <Modal
      open={!!rfi}
      onClose={onClose}
      eyebrow={`${rfi.rfi_number || rfi.id} · ${(rfi.discipline || "").toUpperCase()}`}
      title={rfi.title || "Untitled RFI"}
      width={760}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>CLOSE</Button>
          {onNudge && <Button variant="secondary" icon="bell" onClick={onNudge}>NUDGE BIC</Button>}
          {onEdit && <Button variant="outline" icon="ai" onClick={onEdit}>EDIT</Button>}
          {onAdvanceStatus && rfi.status !== "Answered" && rfi.status !== "Closed" && (
            <Button variant="primary" icon="check" onClick={() => onAdvanceStatus("Answered")}>
              MARK ANSWERED
            </Button>
          )}
        </>
      }
    >
      {/* Status strip */}
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
          padding: "10px 12px",
          marginBottom: 16,
          background: "var(--bg-surface-low)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-card)",
        }}
      >
        <StatusPill label={rfi.status || "Open"} />
        <BicPill bic={rfi.ball_in_court || "Contractor"} />
        <StatusPill label={rfi.priority || "Medium"} size="xs" color={priorityColor} />
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--text-muted)",
              letterSpacing: "0.10em",
            }}
          >
            AGE
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 15,
              fontWeight: 700,
              color: overdue ? "var(--danger)" : age > 7 ? "var(--status-warning)" : "var(--text-primary)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {age}d
          </span>
        </div>
      </div>

      {/* Meta grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 18 }}>
        <MetaCell label="SUBMITTED"   value={rfi.submitted_date} />
        <MetaCell label="REQUIRED"    value={rfi.date_required} highlight={overdue} />
        <MetaCell label="SUBMITTER"   value={rfi.submitted_by} />
        <MetaCell
          label="COST IMPACT"
          value={rfi.cost_impact && rfi.cost_impact_amount ? `$${Number(rfi.cost_impact_amount).toLocaleString()}` : "—"}
          color={rfi.cost_impact ? "var(--status-warning)" : "var(--text-muted)"}
        />
      </div>

      {/* Lifecycle pipeline */}
      <div style={{ marginBottom: 18 }}>
        <SectionLabel>LIFECYCLE</SectionLabel>
        <PhaseChevron stages={STAGES} activeIdx={activeIdx} showIcons={false} />
      </div>

      {/* Question body */}
      <div style={{ marginBottom: 18 }}>
        <SectionLabel>QUESTION</SectionLabel>
        <div
          style={{
            padding: "12px 14px",
            background: "var(--bg-surface-low)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-card)",
            fontFamily: "var(--font-body)",
            fontSize: 13,
            lineHeight: 1.55,
            color: "var(--text-primary)",
          }}
        >
          {rfi.question || rfi.description || rfi.title || <i style={{ color: "var(--text-muted)" }}>No question text recorded.</i>}
        </div>
      </div>

      {/* Answer (if present) */}
      {rfi.answer && (
        <div style={{ marginBottom: 18 }}>
          <SectionLabel>ANSWER</SectionLabel>
          <div
            style={{
              padding: "12px 14px",
              background: "var(--success-muted)",
              border: "1px solid var(--success-border)",
              borderLeft: "3px solid var(--status-success)",
              borderRadius: "var(--radius-card)",
              fontFamily: "var(--font-body)",
              fontSize: 13,
              lineHeight: 1.55,
              color: "var(--text-primary)",
            }}
          >
            {rfi.answer}
          </div>
          {rfi.answered_by && (
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "var(--text-muted)",
                marginTop: 6,
                letterSpacing: "0.08em",
              }}
            >
              Answered by {rfi.answered_by} on {rfi.date_answered || "—"}
            </div>
          )}
        </div>
      )}

      {/* Drawing / spec reference */}
      {(rfi.drawing_reference || rfi.spec_section) && (
        <div style={{ marginBottom: 12 }}>
          <SectionLabel>REFERENCE</SectionLabel>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {rfi.drawing_reference && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  background: "var(--bg-surface-low)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-badge)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "var(--text-secondary)",
                }}
              >
                <Icon name="drawings" size={11} color="var(--accent)" />
                {rfi.drawing_reference}
              </div>
            )}
            {rfi.spec_section && (
              <div
                style={{
                  padding: "6px 10px",
                  background: "var(--bg-surface-low)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-badge)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "var(--text-secondary)",
                }}
              >
                SPEC · {rfi.spec_section}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function SectionLabel({ children }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        color: "var(--text-muted)",
        letterSpacing: "0.14em",
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

function MetaCell({ label, value, color, highlight }) {
  return (
    <div
      style={{
        padding: "8px 10px",
        background: "var(--bg-surface-low)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          color: "var(--text-muted)",
          letterSpacing: "0.14em",
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          fontWeight: 600,
          color: color || (highlight ? "var(--danger)" : "var(--text-primary)"),
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "0.04em",
        }}
      >
        {value || "—"}
      </div>
    </div>
  );
}
