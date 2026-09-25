import { useEffect, useState } from "react";
import type {
  PieceDigitalThreadModel,
  PieceThreadSection,
} from "@/lib/pieceControl/pieceIntelligenceTypes";

export interface PieceDigitalThreadProps {
  thread: PieceDigitalThreadModel | null;
  onClose: () => void;
  onOpenRelationships?: () => void;
  onOpenRelease?: () => void;
  canManageHold?: boolean;
  pieceOnHold?: boolean;
  holdPending?: boolean;
  onSetHold?: (request: { onHold: boolean; reason: string }) => Promise<unknown>;
}

function ThreadSection({
  title,
  section,
}: {
  title: string;
  section: PieceThreadSection;
}) {
  return (
    <section
      className="piece-digital-thread__section"
      aria-labelledby={`piece-thread-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
    >
      <h3 id={`piece-thread-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
        {title}
      </h3>
      {section.availability === "unavailable" ? (
        <div className="piece-operation-state is-error">
          <strong>This source is unavailable.</strong>
          <p>No decision should be made from missing evidence.</p>
        </div>
      ) : section.facts.length === 0 ? (
        <p className="piece-operation-state">No recorded facts.</p>
      ) : (
        <dl>
          {section.facts.map((fact, index) => (
            <div key={`${fact.label}:${index}`}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

export function PieceDigitalThread({
  thread,
  onClose,
  onOpenRelationships,
  onOpenRelease,
  canManageHold = false,
  pieceOnHold = false,
  holdPending = false,
  onSetHold,
}: PieceDigitalThreadProps) {
  const [holdEditorOpen, setHoldEditorOpen] = useState(false);
  const [holdReason, setHoldReason] = useState("");

  useEffect(() => {
    setHoldEditorOpen(false);
    setHoldReason("");
  }, [thread?.pieceId]);

  if (!thread) return null;

  const nextHoldState = !pieceOnHold;
  const closeHoldEditor = () => {
    setHoldEditorOpen(false);
    setHoldReason("");
  };
  const submitHold = async () => {
    const reason = holdReason.trim();
    if (!onSetHold || !reason || holdPending) return;
    try {
      await onSetHold({ onHold: nextHoldState, reason });
      closeHoldEditor();
    } catch {
      // The page mutation owns the operator-facing error toast. Keep the
      // editor open so the reason can be retried without retyping it.
    }
  };

  return (
    <aside
      className="piece-digital-thread"
      role="dialog"
      aria-modal="false"
      aria-label={`Piece digital thread: ${thread.identity.markAndLot}`}
    >
      <header className="piece-digital-thread__header">
        <div>
          <span>Piece digital thread</span>
          <h2>{thread.identity.markAndLot}</h2>
        </div>
        <button type="button" className="cmd-btn cmd-btn--ghost" onClick={onClose}>
          Close
        </button>
      </header>

      <ThreadSection title="Identity" section={thread.identity} />
      <ThreadSection title="Model & drawing" section={thread.modelAndDrawing} />
      <ThreadSection title="Commercial & constraints" section={thread.commercial} />
      <ThreadSection
        title="Production & logistics"
        section={thread.productionAndLogistics}
      />
      <ThreadSection title="History" section={thread.history} />

      {canManageHold && onSetHold ? (
        <section className="piece-digital-thread__section" aria-label="Piece hold action">
          <h3>Protected actions</h3>
          {!holdEditorOpen ? (
            <button
              type="button"
              className="cmd-btn cmd-btn--secondary"
              disabled={holdPending}
              onClick={() => setHoldEditorOpen(true)}
            >
              {pieceOnHold ? "Clear hold" : "Place hold"}
            </button>
          ) : (
            <div className="piece-command-actions">
              <label htmlFor={`piece-hold-reason-${thread.pieceId}`}>
                Hold reason
                <textarea
                  id={`piece-hold-reason-${thread.pieceId}`}
                  value={holdReason}
                  onChange={(event) => setHoldReason(event.target.value)}
                  disabled={holdPending}
                  rows={3}
                />
              </label>
              <button
                type="button"
                className="cmd-btn cmd-btn--primary"
                disabled={!holdReason.trim() || holdPending}
                onClick={() => void submitHold()}
              >
                {holdPending
                  ? "Updating hold…"
                  : pieceOnHold
                    ? "Confirm clear hold"
                    : "Confirm hold"}
              </button>
              <button
                type="button"
                className="cmd-btn cmd-btn--ghost"
                disabled={holdPending}
                onClick={closeHoldEditor}
              >
                Cancel hold
              </button>
            </div>
          )}
        </section>
      ) : null}

      {onOpenRelationships || onOpenRelease ? (
        <footer className="piece-command-actions">
          {onOpenRelationships ? (
            <button
              type="button"
              className="cmd-btn cmd-btn--secondary"
              onClick={onOpenRelationships}
            >
              Open Lots &amp; links
            </button>
          ) : null}
          {onOpenRelease ? (
            <button
              type="button"
              className="cmd-btn cmd-btn--secondary"
              onClick={onOpenRelease}
            >
              Open fabrication release
            </button>
          ) : null}
        </footer>
      ) : null}
    </aside>
  );
}
