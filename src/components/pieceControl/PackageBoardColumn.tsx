import { Droppable } from "@hello-pangea/dnd";
import type { BoardColumn } from "./packageBoard.derive";
import { PackageBoardCard } from "./PackageBoardCard";

interface PackageBoardColumnProps {
  column: BoardColumn;
  dragEnabled: boolean;
}

function formatTons(tons: number): string {
  if (tons <= 0) return "0 t";
  return tons >= 10 ? `${tons.toFixed(1)} t` : `${tons.toFixed(2)} t`;
}

export function PackageBoardColumn({ column, dragEnabled }: PackageBoardColumnProps) {
  return (
    <section
      className="package-board-column"
      data-testid={`package-board-column-${column.id}`}
      aria-label={column.title}
    >
      <header className="package-board-column__header">
        <h3 className="package-board-column__title">{column.title}</h3>
        <div className="package-board-column__stats">
          <span>{column.leafCount} lots</span>
          <span>{formatTons(column.knownTons)}</span>
        </div>
      </header>
      <Droppable droppableId={column.id} isDropDisabled={!dragEnabled}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={[
              "package-board-column__list",
              snapshot.isDraggingOver ? "is-over" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {column.pieces.map((piece, index) => (
              <PackageBoardCard
                key={piece.id}
                piece={piece}
                index={index}
                dragEnabled={dragEnabled}
              />
            ))}
            {provided.placeholder}
            {column.pieces.length === 0 ? (
              <p className="package-board-column__empty">No lots</p>
            ) : null}
          </div>
        )}
      </Droppable>
    </section>
  );
}
