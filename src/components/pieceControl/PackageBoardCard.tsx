import { Draggable } from "@hello-pangea/dnd";
import { Pill } from "@/components/command";
import { pieceLifecycleLabel } from "@/lib/pieceControl/lifecycle";
import { pieceTons } from "@/lib/pieceControl/tonnage";
import type { BoardPiece } from "./packageBoard.derive";

interface PackageBoardCardProps {
  piece: BoardPiece;
  index: number;
  dragEnabled: boolean;
}

function formatTons(tons: number): string {
  return tons >= 10 ? tons.toFixed(1) : tons.toFixed(2);
}

export function PackageBoardCard({ piece, index, dragEnabled }: PackageBoardCardProps) {
  const tons = pieceTons(piece);

  return (
    <Draggable draggableId={piece.id} index={index} isDragDisabled={!dragEnabled}>
      {(provided, snapshot) => (
        <article
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={[
            "package-board-card",
            snapshot.isDragging ? "is-dragging" : "",
            dragEnabled ? "" : "is-disabled",
          ]
            .filter(Boolean)
            .join(" ")}
          data-testid={`package-board-card-${piece.id}`}
        >
          <div className="package-board-card__mark">{piece.piece_mark}</div>
          <div className="package-board-card__meta">
            <span className="package-board-card__lot">Lot {piece.lot_code || "—"}</span>
            {tons !== null ? (
              <span className="package-board-card__tons">{formatTons(tons)} t</span>
            ) : null}
          </div>
          <Pill tone="neutral">{pieceLifecycleLabel(piece.lifecycle_status)}</Pill>
        </article>
      )}
    </Draggable>
  );
}
