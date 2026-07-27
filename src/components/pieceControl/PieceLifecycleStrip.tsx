import type { PieceLifecycleMetric } from "@/lib/pieceControl/presentation";

export function PieceLifecycleStrip({
  items,
  totalPieces,
  onSelect,
}: {
  items: PieceLifecycleMetric[];
  totalPieces: number;
  onSelect?: (key: string) => void;
}) {
  return (
    <div className="piece-lifecycle" aria-label="Piece lifecycle">
      {items.map((item) => {
        const width =
          totalPieces > 0 && item.pieces > 0
            ? Math.max(2, (item.pieces / totalPieces) * 100)
            : 0;
        const content = (
          <>
            <span className="piece-lifecycle__track">
              <span style={{ width: `${width}%` }} />
            </span>
            <span className="piece-lifecycle__label">{item.label}</span>
            <strong>{item.pieces.toLocaleString()}</strong>
          </>
        );

        return onSelect ? (
          <button
            key={item.key}
            type="button"
            className="piece-lifecycle__item"
            aria-label={`${item.label} ${item.pieces} pieces`}
            onClick={() => onSelect(item.key)}
          >
            {content}
          </button>
        ) : (
          <div key={item.key} className="piece-lifecycle__item">
            {content}
          </div>
        );
      })}
    </div>
  );
}
