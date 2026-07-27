import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { PieceAttentionItem } from "@/lib/pieceControl/presentation";

export function PieceAttentionPanel({
  items,
  emptyMessage,
  onSelect,
}: {
  items: PieceAttentionItem[];
  emptyMessage: string;
  onSelect?: (key: PieceAttentionItem["key"]) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="piece-attention__empty">
        <CheckCircle2 size={16} />
        <span>{emptyMessage}</span>
      </div>
    );
  }

  return (
    <div className="piece-attention">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`piece-attention__row is-${item.tone}`}
          onClick={() => onSelect?.(item.key)}
          disabled={!onSelect}
        >
          <AlertTriangle size={15} />
          <span>{item.label}</span>
          <strong>{item.count.toLocaleString()}</strong>
        </button>
      ))}
    </div>
  );
}
