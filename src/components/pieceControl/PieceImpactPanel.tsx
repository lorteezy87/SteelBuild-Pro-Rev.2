import { AlertTriangle, CheckCircle2, FileWarning } from "lucide-react";
import type { PieceImpactModel } from "@/lib/pieceControl/drawingReleaseReady";

export function PieceImpactPanel({
  impact,
  loading = false,
}: {
  impact: PieceImpactModel | null;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="piece-impact piece-impact--loading" aria-busy="true">
        Loading piece impact…
      </div>
    );
  }

  if (!impact) {
    return (
      <div className="piece-impact piece-impact--empty">
        Select one piece to inspect governing drawing impact.
      </div>
    );
  }

  const sheet =
    impact.governingDrawing?.sheet_number ||
    impact.governingDrawing?.title ||
    "—";

  return (
    <div
      className={`piece-impact${impact.releaseReady ? " is-ready" : " is-blocked"}`}
      data-testid="piece-impact-panel"
    >
      <div className="piece-impact__head">
        <span className="piece-impact__icon" aria-hidden="true">
          {impact.releaseReady ? <CheckCircle2 size={16} /> : <FileWarning size={16} />}
        </span>
        <div>
          <strong>{impact.pieceMark}</strong>
          <span>
            {impact.releaseReady
              ? "Release-ready (IFC / Released)"
              : impact.releaseBlockReason || "Not release-ready"}
          </span>
        </div>
      </div>

      <dl className="piece-impact__meta">
        <div>
          <dt>Governing sheet</dt>
          <dd>{sheet}</dd>
        </div>
        <div>
          <dt>Revision</dt>
          <dd>{impact.governingRevisionCode || "—"}</dd>
        </div>
        <div>
          <dt>Workflow stage</dt>
          <dd>{impact.workflowStage || "—"}</dd>
        </div>
        <div>
          <dt>Lifecycle</dt>
          <dd>{impact.lifecycleStatus.replace(/_/g, " ")}</dd>
        </div>
      </dl>

      {impact.flags.length > 0 ? (
        <ul className="piece-impact__flags">
          {impact.flags.map((flag) => (
            <li key={flag.key} className={`is-${flag.tone}`}>
              <AlertTriangle size={14} aria-hidden="true" />
              <span>{flag.label}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="piece-impact__clear">No exposure flags.</p>
      )}
    </div>
  );
}
