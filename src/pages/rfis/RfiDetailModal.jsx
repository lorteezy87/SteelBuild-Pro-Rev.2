import React from "react";
import { Modal, Button, StatusPill, BicPill, PhaseChevron, Icon } from "@/components/design-system";
import { daysOpen, isOverdue } from "./utils";
import RfiCopilotPanel from "@/components/rfis/RfiCopilotPanel";

const STAGE_INDEX = { Open: 0, "Under Review": 1, "Incomplete Response": 2, Answered: 3, Closed: 4 };

const STAGES = [
  { id: "open",  label: "OPEN",       color: "var(--status-warning)" },
  { id: "rev",   label: "REVIEW",     color: "var(--status-review)" },
  { id: "incmp", label: "INCOMPLETE", color: "var(--status-error)" },
  { id: "ans",   label: "ANSWERED",   color: "var(--status-success)" },
  { id: "cls",   label: "CLOSED",     color: "var(--text-muted)" },
];

function formatDate(value) {
  if (!value) return "No date";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function impactValue(rfi) {
  const parts = [];
  if (rfi.cost_impact) {
    parts.push(rfi.cost_impact_amount ? `$${Number(rfi.cost_impact_amount).toLocaleString()}` : "Cost impact");
  }
  if (rfi.schedule_impact) {
    parts.push(rfi.schedule_impact_days ? `${rfi.schedule_impact_days} days` : "Schedule impact");
  }
  return parts.join(" / ") || "No known impact";
}

export default function RfiDetailModal({ rfi, onClose, onAdvanceStatus, onEdit, onNudge, onCreateCO }) {
  if (!rfi) return null;

  const age = daysOpen(rfi);
  const overdue = isOverdue(rfi);
  const activeIdx = STAGE_INDEX[rfi.status] ?? 0;
  const priorityColor =
    rfi.priority === "Critical" ? "#FF6B35" :
    rfi.priority === "High" ? "var(--status-warning)" :
    rfi.priority === "Medium" ? "var(--status-info)" :
    "var(--text-muted)";

  return (
    <Modal
      open={!!rfi}
      onClose={onClose}
      eyebrow={`${rfi.rfi_number || rfi.id} / ${(rfi.discipline || "GENERAL").toUpperCase()}`}
      title={rfi.title || "Untitled RFI"}
      width={920}
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
      <div className="rfi-detail-status">
        <section className="rfi-detail-card">
          <div className="rfi-detail-chip-row">
            <StatusPill label={rfi.status || "Open"} />
            <BicPill bic={rfi.ball_in_court || "Contractor"} />
            <StatusPill label={rfi.priority || "Medium"} size="xs" color={priorityColor} />
          </div>
          <div className="rfi-detail-age">
            <Metric label="Age" value={`${age}d`} alert={overdue || age > 14} />
            <Metric label="Required" value={formatDate(rfi.date_required)} alert={overdue} />
            <Metric label="Impact" value={impactValue(rfi)} alert={rfi.cost_impact || rfi.schedule_impact} />
          </div>
        </section>

        <section className="rfi-detail-card">
          <div className="rfi-detail-meta-grid">
            <MetaCell label="Submitted" value={formatDate(rfi.submitted_date)} />
            <MetaCell label="Submitter" value={rfi.submitted_by || "Not recorded"} />
            <MetaCell label="Assigned To" value={rfi.assigned_to || "Not assigned"} />
            <MetaCell label="Answered" value={rfi.date_answered ? formatDate(rfi.date_answered) : "Pending"} />
          </div>
        </section>
      </div>

      <section className="rfi-detail-section">
        <SectionLabel>Lifecycle</SectionLabel>
        <PhaseChevron stages={STAGES} activeIdx={activeIdx} showIcons={false} />
      </section>

      <section className="rfi-detail-section">
        <SectionLabel>Question</SectionLabel>
        <div className="rfi-detail-body-text">
          {rfi.question || rfi.description || rfi.title || "No question text recorded."}
        </div>
      </section>

      <RfiCopilotPanel rfi={rfi} />

      {rfi.answer && (
        <section className="rfi-detail-section">
          <SectionLabel>Answer</SectionLabel>
          <div className="rfi-detail-body-text">{rfi.answer}</div>
          {rfi.answered_by && (
            <div className="rfi-row-date-sub">
              Answered by {rfi.answered_by} on {rfi.date_answered ? formatDate(rfi.date_answered) : "No date"}
            </div>
          )}
        </section>
      )}

      {(rfi.drawing_reference || rfi.spec_section) && (
        <section className="rfi-detail-section">
          <SectionLabel>Reference</SectionLabel>
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
            {rfi.metadata?.fab_hold && (
              <div
                className="rfi-reference-chip"
                style={{ color: "var(--status-error)", borderColor: "var(--status-error)", fontWeight: 700 }}
              >
                ⛔ Fab Hold
              </div>
            )}
            {rfi.metadata?.piece_marks && (
              <div className="rfi-reference-chip">Pieces / {rfi.metadata.piece_marks}</div>
            )}
          </div>
        </section>
      )}

      {(rfi.metadata?.drawing_revision_required || rfi.metadata?.change_order_likely || rfi.metadata?.fab_impact || rfi.metadata?.erection_impact) && (
        <section className="rfi-detail-section">
          <SectionLabel>Impact</SectionLabel>
          <div className="rfi-reference-row">
            {rfi.metadata?.drawing_revision_required && (
              <div className="rfi-reference-chip" style={{ color: "var(--status-warning)", borderColor: "var(--status-warning)", fontWeight: 700 }}>✎ Drawing revision required</div>
            )}
            {rfi.metadata?.change_order_likely && (
              <div className="rfi-reference-chip" style={{ color: "var(--status-review)", borderColor: "var(--status-review)", fontWeight: 700 }}>$ Change order likely</div>
            )}
            {rfi.metadata?.fab_impact && <div className="rfi-reference-chip">Fabrication impact</div>}
            {rfi.metadata?.erection_impact && <div className="rfi-reference-chip">Erection impact</div>}
          </div>
        </section>
      )}
    </Modal>
  );
}

function SectionLabel({ children }) {
  return <div className="rfi-small-label">{children}</div>;
}

function Metric({ label, value, alert }) {
  return (
    <div className="rfi-detail-metric">
      <div className="rfi-small-label">{label}</div>
      <strong style={{ color: alert ? "var(--danger)" : "var(--text-primary)" }}>{value}</strong>
    </div>
  );
}

function MetaCell({ label, value }) {
  return (
    <div className="rfi-detail-meta-cell">
      <div className="rfi-small-label">{label}</div>
      <div className="rfi-detail-value">{value}</div>
    </div>
  );
}
