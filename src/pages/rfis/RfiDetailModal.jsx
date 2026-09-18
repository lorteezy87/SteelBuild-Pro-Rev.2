import React from "react";
import { Modal, Button, Icon } from "@/components/design-system";
import {
  DateRiskCell,
  DetailRail,
  ImpactBadge,
  StatusBadge,
  WorkflowStage,
} from "@/components/command";
import { daysOpen, isOverdue } from "./utils";
import RfiCopilotPanel from "@/components/rfis/RfiCopilotPanel";
import { recommendedDownstreamActions } from "@/lib/rfiDownstream";

const STATUS_ORDER = ["Open", "Under Review", "Incomplete Response", "Answered", "Closed"];

function formatDate(value) {
  if (!value) return "Unknown";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function statusTone(status) {
  if (status === "Answered") return "success";
  if (status === "Closed") return "neutral";
  if (status === "Incomplete Response") return "danger";
  if (status === "Under Review") return "info";
  return "warning";
}

function priorityTone(priority) {
  if (priority === "Critical") return "danger";
  if (priority === "High") return "warning";
  if (priority === "Medium") return "info";
  return "neutral";
}

function impactInfo(rfi) {
  const m = rfi.metadata || {};
  if (m.fab_hold || m.fab_impact) return { label: "Fabrication", level: "critical" };
  if (m.drawing_revision_required) return { label: "Drawing revision", level: "high" };
  if (m.erection_impact) return { label: "Field / erection", level: "high" };
  if (rfi.schedule_impact) return { label: "Schedule", level: "high" };
  if (rfi.cost_impact || m.change_order_likely) return { label: "Commercial", level: "medium" };
  return { label: "No known impact", level: "none" };
}

export default function RfiDetailModal({
  rfi,
  onClose,
  onAdvanceStatus,
  onEdit,
  onNudge,
  onCreateCO,
  onDownstreamAction,
}) {
  if (!rfi) return null;

  const age = daysOpen(rfi);
  const overdue = isOverdue(rfi);
  const activeIdx = Math.max(0, STATUS_ORDER.indexOf(rfi.status));
  const downstream = onDownstreamAction ? recommendedDownstreamActions(rfi) : [];
  const impact = impactInfo(rfi);

  const stages = STATUS_ORDER.map((status, index) => ({
    id: status,
    label:
      status === "Under Review" ? "REVIEW" :
      status === "Incomplete Response" ? "INCOMPLETE" :
      status.toUpperCase(),
    state:
      index < activeIdx ? "complete" :
      index === activeIdx
        ? (status === "Incomplete Response" ? "blocked" : "current")
        : "upcoming",
  }));

  const railSections = [
    {
      key: "status",
      label: "Status",
      value: <StatusBadge label={rfi.status || "Open"} tone={statusTone(rfi.status)} />,
    },
    {
      key: "bic",
      label: "Ball in Court",
      value: rfi.ball_in_court || "Contractor",
      detail: rfi.assigned_to || "No individual assignee",
    },
    {
      key: "priority",
      label: "Priority",
      value: <StatusBadge label={rfi.priority || "Medium"} tone={priorityTone(rfi.priority)} />,
    },
    {
      key: "required",
      label: "Required By",
      value: (
        <DateRiskCell
          value={rfi.date_required ? formatDate(rfi.date_required) : null}
          risk={rfi.date_required ? (overdue ? "overdue" : "upcoming") : "unknown"}
          detail={rfi.date_required ? `${age} days open` : "Required date unavailable"}
        />
      ),
    },
    {
      key: "wp",
      label: "Linked Work Package",
      value: rfi.work_package_id || "Not linked",
    },
    {
      key: "drawing",
      label: "Drawing / Set",
      value: rfi.drawing_reference || rfi.drawing_set_id || "Not linked",
    },
    {
      key: "impact",
      label: "Impact",
      value: <ImpactBadge label={impact.label} level={impact.level} />,
      detail:
        rfi.cost_impact_amount ? `$${Number(rfi.cost_impact_amount).toLocaleString()} cost exposure` :
        rfi.schedule_impact_days ? `${rfi.schedule_impact_days}d schedule exposure` :
        "Recorded evidence only",
    },
  ];

  return (
    <Modal
      open={!!rfi}
      onClose={onClose}
      eyebrow={`${rfi.rfi_number || rfi.id} / ${(rfi.discipline || "GENERAL").toUpperCase()}`}
      title={rfi.title || "Untitled RFI"}
      width={1040}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          {onCreateCO && (rfi.cost_impact || rfi.metadata?.change_order_likely) && (
            <Button variant="secondary" onClick={onCreateCO}>Create CO</Button>
          )}
          {onNudge && <Button variant="secondary" icon="bell" onClick={onNudge}>Nudge BIC</Button>}
          {onEdit && <Button variant="outline" icon="ai" onClick={onEdit}>Edit</Button>}
          {onAdvanceStatus && rfi.status !== "Answered" && rfi.status !== "Closed" && (
            <Button variant="primary" icon="check" onClick={() => onAdvanceStatus("Answered")}>
              Mark Answered
            </Button>
          )}
        </>
      }
    >
      <div className="rfi-detail-workspace">
        <main className="rfi-detail-workspace__main">
          <section className="rfi-detail-section">
            <SectionLabel>Lifecycle</SectionLabel>
            <WorkflowStage
              stages={stages}
              currentStage={rfi.status}
              ariaLabel="RFI lifecycle"
            />
          </section>

          <section className="rfi-detail-section">
            <SectionLabel>Question / Issue</SectionLabel>
            <div className="rfi-detail-body-text">
              {rfi.question || rfi.description || rfi.title || "No question text recorded."}
            </div>
          </section>

          <RfiCopilotPanel rfi={rfi} />

          <section className="rfi-detail-section">
            <SectionLabel>Response</SectionLabel>
            {rfi.answer ? (
              <>
                <div className="rfi-detail-body-text">{rfi.answer}</div>
                <div className="rfi-row-date-sub">
                  Answered by {rfi.answered_by || "Not recorded"} on {rfi.date_answered ? formatDate(rfi.date_answered) : "Unknown"}
                </div>
              </>
            ) : (
              <div className="rfi-detail-body-text" style={{ color: "var(--status-warning)" }}>
                Awaiting response
              </div>
            )}
          </section>

          {downstream.length > 0 && (
            <section className="rfi-detail-section">
              <SectionLabel>Apply the answer downstream</SectionLabel>
              <div className="rfi-downstream-actions">
                {downstream.map((action) => (
                  <button
                    key={action.key}
                    type="button"
                    className={`cmd-btn ${action.primary ? "cmd-btn--primary" : "cmd-btn--ghost"}`}
                    onClick={() => onDownstreamAction(action.key)}
                    title={action.hint}
                  >
                    {action.icon && <Icon name={action.icon} size={13} />}
                    <span>{action.label}</span>
                    <small>{action.hint}</small>
                  </button>
                ))}
              </div>
            </section>
          )}

          {(rfi.drawing_reference || rfi.spec_section) && (
            <section className="rfi-detail-section">
              <SectionLabel>References</SectionLabel>
              <div className="rfi-reference-row">
                {rfi.drawing_reference && (
                  <div className="rfi-reference-chip">
                    <Icon name="drawings" size={12} color="var(--accent)" />
                    {rfi.drawing_reference}
                  </div>
                )}
                {rfi.spec_section && <div className="rfi-reference-chip">Spec / {rfi.spec_section}</div>}
              </div>
            </section>
          )}

          {(rfi.metadata?.fab_hold || rfi.metadata?.piece_marks) && (
            <section className="rfi-detail-section">
              <SectionLabel>Fabrication</SectionLabel>
              <div className="rfi-reference-row">
                {rfi.metadata?.fab_hold && <ImpactBadge label="Fab Hold" level="critical" />}
                {rfi.metadata?.piece_marks && (
                  <div className="rfi-reference-chip">Pieces / {rfi.metadata.piece_marks}</div>
                )}
              </div>
            </section>
          )}
        </main>

        <DetailRail
          title="Operational details"
          sections={railSections}
          actions={(
            <>
              {onNudge ? <button type="button" className="cmd-btn cmd-btn--ghost" onClick={onNudge}>Nudge BIC</button> : null}
              {onEdit ? <button type="button" className="cmd-btn cmd-btn--ghost" onClick={onEdit}>Edit RFI</button> : null}
            </>
          )}
        />
      </div>
    </Modal>
  );
}

function SectionLabel({ children }) {
  return <div className="rfi-small-label">{children}</div>;
}
