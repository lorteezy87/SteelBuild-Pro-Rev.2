import { memo } from "react";
import { pieceLifecycleLabel } from "@/lib/pieceControl/lifecycle";
import { pieceTons } from "@/lib/pieceControl/tonnage";
import type { PieceRegisterDisplayRow } from "./filter";

export function PieceRegisterRowView({
  piece,
  selected,
  canBulkUpdate,
  onToggle,
}: {
  piece: PieceRegisterDisplayRow;
  selected: boolean;
  canBulkUpdate: boolean;
  onToggle: (id: string) => void;
}) {
  const tons = pieceTons(piece);
  return (
    <tr>
      <td>
        <input
          type="checkbox"
          aria-label={`Select ${piece.piece_mark} lot ${piece.lot_code}`}
          checked={selected}
          disabled={!canBulkUpdate}
          onChange={() => onToggle(piece.id)}
          className="cmd-check"
        />
      </td>
      <td>
        <div className="piece-register-mark">{piece.piece_mark}</div>
        <div className="piece-register-cell-meta">
          {piece.parent_piece_id
            ? `Child lot ${piece.lot_code}`
            : piece.lot_code === "ALL"
              ? "Root lot ALL"
              : `Container ${piece.lot_code}`}
        </div>
      </td>
      <td className="piece-register-number">{piece.quantity}</td>
      <td>{piece.profile || "—"}</td>
      <td>{piece.material_grade || "—"}</td>
      <td className="piece-register-number">
        {piece.weight_each_lbs == null ? "—" : Number(piece.weight_each_lbs).toFixed(1)}
      </td>
      <td className="piece-register-number">
        {piece.weight_total_lbs == null ? "—" : Number(piece.weight_total_lbs).toFixed(1)}
      </td>
      <td className="piece-register-number piece-register-number--strong">
        {tons == null ? "—" : tons.toFixed(3)}
      </td>
      <td>{piece.workPackageLabel}</td>
      <td>
        <span className="cmd-pill cmd-pill--neutral">
          {pieceLifecycleLabel(piece.lifecycle_status)}
        </span>
      </td>
      <td>
        {piece.on_hold ? (
          <span className="piece-register-hold">Held</span>
        ) : (
          <span className="piece-register-cell-meta">Clear</span>
        )}
      </td>
      <td>
        <div>{piece.source_system || "—"}</div>
        <div className="piece-register-cell-meta piece-register-cell-meta--truncate">
          {piece.external_ref || ""}
        </div>
      </td>
      <td className="piece-register-updated">
        {new Date(piece.updated_at).toLocaleString()}
      </td>
    </tr>
  );
}

export const PieceRegisterRow = memo(PieceRegisterRowView);
