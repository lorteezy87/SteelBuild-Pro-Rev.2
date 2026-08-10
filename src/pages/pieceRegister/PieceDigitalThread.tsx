import type {
  PieceDigitalThreadModel,
  PieceThreadSection,
} from "@/lib/pieceControl/pieceIntelligenceTypes";

export interface PieceDigitalThreadProps {
  thread: PieceDigitalThreadModel | null;
  onClose: () => void;
  onOpenRelationships?: () => void;
  onOpenRelease?: () => void;
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
}: PieceDigitalThreadProps) {
  if (!thread) return null;

  return (
    <aside className="piece-digital-thread" aria-label="Piece digital thread">
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
