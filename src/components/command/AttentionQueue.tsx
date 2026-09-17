export type AttentionTone = "neutral" | "good" | "warn" | "danger" | "info";

export interface AttentionItem {
  id: string;
  issue: string;
  deadline?: string | null;
  risk?: string | null;
  owner?: string | null;
  nextAction?: string | null;
  tone?: AttentionTone;
  onOpen?: () => void;
}

export interface AttentionQueueProps {
  items: AttentionItem[];
  title?: string;
  emptyMessage?: string;
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const tone = item.tone ?? "neutral";
  const content = (
    <>
      <span className="sbp-attention__issue">{item.issue}</span>
      <span className="sbp-attention__field" data-label="Deadline">{item.deadline || "—"}</span>
      <span className="sbp-attention__field" data-label="Risk">{item.risk || "—"}</span>
      <span className="sbp-attention__field" data-label="Owner">{item.owner || "—"}</span>
      <span className="sbp-attention__action" data-label="Next action">{item.nextAction || "—"}</span>
    </>
  );

  if (item.onOpen) {
    return (
      <button
        type="button"
        className={`sbp-attention__row is-${tone}`}
        onClick={item.onOpen}
        aria-label={`Open ${item.issue}`}
      >
        {content}
      </button>
    );
  }

  return <div className={`sbp-attention__row is-${tone}`}>{content}</div>;
}

export function AttentionQueue({
  items,
  title = "Needs Attention",
  emptyMessage = "No items require management attention.",
}: AttentionQueueProps) {
  return (
    <section className="sbp-attention" aria-label={title}>
      <div className="sbp-attention__head">
        <h2>{title}</h2>
        <span>{items.length}</span>
      </div>
      <div className="sbp-attention__columns" aria-hidden="true">
        <span>Issue</span><span>Deadline</span><span>Risk</span><span>Owner</span><span>Next action</span>
      </div>
      {items.length ? items.map((item) => <AttentionRow key={item.id} item={item} />) : (
        <div className="sbp-attention__empty">{emptyMessage}</div>
      )}
    </section>
  );
}
